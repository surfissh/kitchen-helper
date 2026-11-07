/**
 * DeepSeek adapter: structures HowToCook content into the AR recipe schema and
 * answers beginner questions shown in the cooking-screen modal.
 *
 * If no key is configured the service layer uses the local parser instead, so
 * the simulator demo never depends on a secret to start.
 */

import {
  DEEPSEEK_API_BASE,
  DEEPSEEK_MODEL,
  DEEPSEEK_TIMEOUT_MS,
  resolveDeepSeekKey,
} from "../config.ts";
import type {
  IconKey,
  Localized,
  PrepItem,
  Recipe,
  RecipeStep,
  StepTimerSpec,
} from "../model/types.ts";
import { RecipePipelineError } from "./errors.ts";
import { postJson } from "./http.ts";
import { detectHeat, detectIcon, extractTimerSeconds } from "./local-extract.ts";

const ICONS: readonly IconKey[] = [
  "chef-hat",
  "flame",
  "clock",
  "timer",
  "mic",
  "check",
  "warning",
  "sparkle",
  "pot",
  "pan",
  "knife",
  "board",
  "bowl",
  "dish",
  "tomato",
  "egg",
  "meat",
  "vegetable",
  "tofu",
  "seasoning",
  "oil",
  "water",
  "grain",
  "other",
  "leaf",
  "tap",
  "sound",
];

export interface StructureContext {
  readonly titleHint: string;
  readonly pageUrl: string;
  readonly markdownUrl: string | null;
  readonly fetchedAt: string;
}

interface ChatMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
}

interface ChatResponse {
  readonly choices?: readonly { readonly message?: { readonly content?: string } }[];
  readonly error?: { readonly message?: string };
}

const STRUCTURE_SYSTEM_PROMPT = `You are the recipe structuring engine of an AR kitchen assistant for absolute beginners.
Convert the supplied Chinese HowToCook recipe into strict JSON. Never invent ingredients or steps that are not supported by the source.

Return a single JSON object with exactly these keys:
{
  "titleZh": string, "titleEn": string,
  "summaryZh": string, "summaryEn": string,
  "difficulty": number,        // 1..5
  "totalMinutes": number,      // realistic total time
  "servingsZh": string, "servingsEn": string,
  "caloriesKcal": number|null,
  "ingredients": [{"nameZh": string, "nameEn": string, "amountZh": string, "amountEn": string, "icon": string}],
  "cookware":    [{"nameZh": string, "nameEn": string, "amountZh": string, "amountEn": string, "icon": string}],
  "steps": [{
     "titleZh": string, "titleEn": string,
     "instructionZh": string, "instructionEn": string,
     "tipZh": string|null, "tipEn": string|null,
     "durationSeconds": number|null,
     "timers": [{"labelZh": string, "labelEn": string, "durationSeconds": number}],
     "heat": 0|1|2|3,
     "icon": string
  }]
}

Rules:
- Chinese is the primary language; provide natural concise English translations for every zh field.
- ingredients: only edible ingredients and seasonings. cookware: pots, pans, knives, boards, bowls, utensils.
- Split the source into 4-10 cooking steps that a beginner can follow one action at a time.
- instructionZh must be one clear action, at most 60 Chinese characters. Move side notes to tipZh.
- durationSeconds is only for an explicit timed wait in the source (e.g. "翻炒 20 秒", "炖 40 分钟"); null otherwise.
- timers: usually empty. Add a timer only for an explicit duration in that step. Each timer needs its own clear label.
- heat: 0 no flame, 1 low, 2 medium, 3 high. Use 0 for washing/cutting/mixing/plating.
- icon must be one of: ${ICONS.join(", ")}.
- Output raw JSON only, no Markdown fences and no commentary.`;

function valueOf(payload: Record<string, unknown>, key: string): unknown {
  return payload[key];
}

function stringValue(payload: Record<string, unknown>, key: string, fallback = ""): string {
  const value = valueOf(payload, key);
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function numberValue(payload: Record<string, unknown>, key: string, fallback: number): number {
  const value = valueOf(payload, key);
  const number =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(number) ? number : fallback;
}

function localizedField(
  payload: Record<string, unknown>,
  zhKey: string,
  enKey: string,
  fallback: string,
): Localized {
  const zhValue = stringValue(payload, zhKey, fallback);
  const enValue = stringValue(payload, enKey, zhValue);
  return { zh: zhValue || fallback, en: enValue || zhValue || fallback };
}

function iconValue(payload: Record<string, unknown>, fallbackText: string): IconKey {
  const icon = stringValue(payload, "icon").toLowerCase() as IconKey;
  if (ICONS.includes(icon)) return icon;
  return detectIcon(fallbackText);
}

function clampHeat(value: unknown, instruction: string): 0 | 1 | 2 | 3 {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return detectHeat(instruction);
  const clamped = Math.max(0, Math.min(3, Math.round(number)));
  return clamped as 0 | 1 | 2 | 3;
}

function normalizeTimers(
  payload: Record<string, unknown>,
  stepTitle: Localized,
  instruction: string,
  index: number,
): StepTimerSpec[] {
  const timers: StepTimerSpec[] = [];
  const rawTimers = valueOf(payload, "timers");
  if (Array.isArray(rawTimers)) {
    for (const raw of rawTimers.slice(0, 4)) {
      if (!raw || typeof raw !== "object") continue;
      const record = raw as Record<string, unknown>;
      const seconds = numberValue(record, "durationSeconds", Number.NaN);
      if (!Number.isFinite(seconds) || seconds < 5) continue;
      const label = localizedField(record, "labelZh", "labelEn", stepTitle.zh);
      timers.push({
        id: `llm-t${index}-${timers.length}`,
        label,
        durationSeconds: Math.min(7_200, Math.round(seconds)),
      });
    }
  }
  if (timers.length === 0) {
    const duration = numberValue(payload, "durationSeconds", Number.NaN);
    if (Number.isFinite(duration) && duration >= 5) {
      timers.push({
        id: `llm-t${index}-0`,
        label: stepTitle,
        durationSeconds: Math.min(7_200, Math.round(duration)),
      });
    } else {
      const detected = extractTimerSeconds(instruction);
      if (detected) {
        timers.push({ id: `llm-t${index}-0`, label: stepTitle, durationSeconds: detected });
      }
    }
  }
  return timers;
}

function normalizePrepItems(raw: unknown, idPrefix: string): PrepItem[] {
  if (!Array.isArray(raw)) return [];
  const items: PrepItem[] = [];
  for (const entry of raw.slice(0, 14)) {
    if (!entry || typeof entry !== "object") {
      if (typeof entry === "string" && entry.trim()) {
        const name = entry.trim();
        items.push({
          id: `${idPrefix}-${items.length + 1}`,
          name: { zh: name, en: name },
          amount: { zh: "适量", en: "to taste" },
          icon: detectIcon(name),
        });
      }
      continue;
    }
    const record = entry as Record<string, unknown>;
    const name = localizedField(record, "nameZh", "nameEn", "");
    if (!name.zh) continue;
    items.push({
      id: `${idPrefix}-${items.length + 1}`,
      name,
      amount: localizedField(record, "amountZh", "amountEn", "适量"),
      icon: iconValue(record, name.zh),
    });
  }
  return items;
}

/** Parse a model response that should contain one JSON object. */
export function parseJsonObject(text: string): unknown {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new RecipePipelineError(
      "llm",
      "model response did not contain valid JSON",
      trimmed.slice(0, 400),
    );
  }
}

/** Validate and normalize the model JSON into the exact app schema. */
export function normalizeStructuredRecipe(payload: unknown, context: StructureContext): Recipe {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new RecipePipelineError("invalid", "structured recipe is not an object", "llm-normalize");
  }
  const record = payload as Record<string, unknown>;
  const title = localizedField(record, "titleZh", "titleEn", context.titleHint);
  const summary = localizedField(
    record,
    "summaryZh",
    "summaryEn",
    "按步骤慢慢来，注意安全和火候。",
  );
  const difficulty = Math.max(1, Math.min(5, Math.round(numberValue(record, "difficulty", 2))));
  const totalMinutes = Math.max(
    3,
    Math.min(240, Math.round(numberValue(record, "totalMinutes", 20))),
  );
  const servings = localizedField(record, "servingsZh", "servingsEn", "1–2 人份");
  const caloriesRaw = valueOf(record, "caloriesKcal");
  const caloriesValue = typeof caloriesRaw === "number" ? caloriesRaw : Number(caloriesRaw);
  const caloriesKcal =
    Number.isFinite(caloriesValue) && caloriesValue > 0 ? Math.round(caloriesValue) : undefined;

  const ingredients = normalizePrepItems(valueOf(record, "ingredients"), "ing");
  const cookware = normalizePrepItems(valueOf(record, "cookware"), "tool");
  if (ingredients.length === 0) {
    throw new RecipePipelineError(
      "invalid",
      "structured recipe has no ingredients",
      "llm-normalize",
    );
  }

  const rawSteps = valueOf(record, "steps");
  if (!Array.isArray(rawSteps) || rawSteps.length < 2) {
    throw new RecipePipelineError(
      "invalid",
      "structured recipe has too few steps",
      "llm-normalize",
    );
  }
  const steps: RecipeStep[] = [];
  rawSteps.slice(0, 16).forEach((rawStep, index) => {
    if (!rawStep || typeof rawStep !== "object") return;
    const stepRecord = rawStep as Record<string, unknown>;
    const instruction = localizedField(
      stepRecord,
      "instructionZh",
      "instructionEn",
      stringValue(stepRecord, "instruction", ""),
    );
    if (!instruction.zh) return;
    const stepTitle = localizedField(stepRecord, "titleZh", "titleEn", `步骤 ${index + 1}`);
    const tipZh = stringValue(stepRecord, "tipZh");
    const tipEn = stringValue(stepRecord, "tipEn", tipZh);
    steps.push({
      id: `step-${index + 1}`,
      title: stepTitle,
      instruction,
      tip: tipZh ? { zh: tipZh, en: tipEn || tipZh } : undefined,
      timers: normalizeTimers(stepRecord, stepTitle, instruction.zh, index),
      heat: clampHeat(valueOf(stepRecord, "heat"), instruction.zh),
      icon: iconValue(stepRecord, instruction.zh),
    });
  });
  if (steps.length < 2) {
    throw new RecipePipelineError("invalid", "structured recipe lost every step", "llm-normalize");
  }

  const fallbackCookware: PrepItem[] = [
    {
      id: "tool-1",
      name: { zh: "炒锅", en: "Wok" },
      amount: { zh: "1 口", en: "1" },
      icon: "pan",
    },
    {
      id: "tool-2",
      name: { zh: "锅铲", en: "Spatula" },
      amount: { zh: "1 把", en: "1" },
      icon: "knife",
    },
  ];

  return {
    title,
    summary,
    difficulty,
    totalMinutes,
    servings,
    caloriesKcal,
    ingredients,
    cookware: cookware.length > 0 ? cookware : fallbackCookware,
    steps,
    source: {
      provider: "HowToCook",
      pageUrl: context.pageUrl,
      markdownUrl: context.markdownUrl ?? undefined,
      fetchedAt: context.fetchedAt,
      extractedBy: "deepseek",
    },
  };
}

async function chat(
  messages: readonly ChatMessage[],
  options: { json: boolean; temperature: number },
): Promise<string> {
  const key = resolveDeepSeekKey();
  if (!key) {
    throw new RecipePipelineError("llm", "DeepSeek API key is not configured", "missing-key");
  }
  const body: Record<string, unknown> = {
    model: DEEPSEEK_MODEL,
    messages,
    temperature: options.temperature,
    max_tokens: 4_096,
    stream: false,
  };
  if (options.json) body.response_format = { type: "json_object" };
  let payload: ChatResponse;
  try {
    payload = await postJson<ChatResponse>(`${DEEPSEEK_API_BASE}/chat/completions`, body, {
      timeoutMs: DEEPSEEK_TIMEOUT_MS,
      headers: { Authorization: `Bearer ${key}` },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new RecipePipelineError("llm", `DeepSeek request failed: ${detail}`, detail);
  }
  if (payload.error?.message) {
    throw new RecipePipelineError(
      "llm",
      `DeepSeek error: ${payload.error.message}`,
      payload.error.message,
    );
  }
  const content = payload.choices?.[0]?.message?.content;
  if (!content || !content.trim()) {
    throw new RecipePipelineError("llm", "DeepSeek returned an empty response", "empty-response");
  }
  return content;
}

export interface StructureInput {
  readonly sourceText: string;
  readonly context: StructureContext;
}

/** Structure a recipe with DeepSeek. Throws a pipeline error on failure. */
export async function structureRecipeWithDeepSeek(input: StructureInput): Promise<Recipe> {
  const source = input.sourceText.slice(0, 9_000);
  const userPrompt = [
    `Dish hint: ${input.context.titleHint}`,
    `Source page: ${input.context.pageUrl}`,
    "",
    "HowToCook source text:",
    source,
  ].join("\n");
  const content = await chat(
    [
      { role: "system", content: STRUCTURE_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    { json: true, temperature: 0.2 },
  );
  const payload = parseJsonObject(content);
  return normalizeStructuredRecipe(payload, input.context);
}

const ASSISTANT_SYSTEM_PROMPT = `You are a patient kitchen coach inside AR glasses, helping a total beginner cook one dish.
Answer the user's short question with 1-3 practical sentences (at most 90 Chinese characters / 60 English words).
Be specific to the current step, safety-first, and encouraging. Do not use Markdown or lists.
Return strict JSON: {"answerZh": string, "answerEn": string}.`;

/** Ask DeepSeek a contextual cooking question; returns a bilingual answer. */
export async function askDeepSeekAssistant(
  question: string,
  recipe: Recipe,
  step: RecipeStep,
  language: "zh" | "en",
): Promise<Localized> {
  const context = [
    `Dish: ${recipe.title.zh} / ${recipe.title.en}`,
    `Current step: ${step.title.zh}`,
    `Step instruction: ${step.instruction.zh}`,
    `Beginner tip: ${step.tip?.zh ?? "(none)"}`,
    `User question: ${question}`,
    `Answer primarily in ${language === "zh" ? "Simplified Chinese" : "English"}, but provide both fields.`,
  ].join("\n");
  const content = await chat(
    [
      { role: "system", content: ASSISTANT_SYSTEM_PROMPT },
      { role: "user", content: context },
    ],
    { json: true, temperature: 0.4 },
  );
  const payload = parseJsonObject(content);
  if (!payload || typeof payload !== "object") {
    throw new RecipePipelineError("llm", "assistant returned no JSON", "assistant");
  }
  const record = payload as Record<string, unknown>;
  const answerZh = stringValue(record, "answerZh");
  const answerEn = stringValue(record, "answerEn", answerZh);
  if (!answerZh && !answerEn) {
    throw new RecipePipelineError("llm", "assistant returned an empty answer", "assistant");
  }
  return { zh: answerZh || answerEn, en: answerEn || answerZh };
}

/** Offline answers keyed by common beginner questions. */
export function localAssistantAnswer(
  question: string,
  step: RecipeStep | null,
  language: "zh" | "en",
): Localized {
  const q = question.toLowerCase();
  const tips: { test: RegExp; zh: string; en: string }[] = [
    {
      test: /切|刀|丝|片|段|knife|cut|slice|chop/,
      zh: "刀要稳：手指弯成“猫爪”压住食材，刀背贴着指关节下刀，慢慢来比切得快更重要。",
      en: "Keep the knife steady: curl your fingers into a claw, tuck your thumb behind, and let the blade follow your knuckles. Slow beats fast.",
    },
    {
      test: /火|糊|焦|烟|burn|burnt|smoke|heat/,
      zh: "闻到焦味先关小火或关火，把锅移开；翻炒要勤，别让食材停在一个位置。",
      en: "If you smell burning, lower or turn off the heat and move the pan. Keep the food moving so it does not sit in one spot.",
    },
    {
      test: /油|溅|烫|oil|splash|burn my hand/,
      zh: "下锅前把食材表面的水擦干，沿锅边轻轻放入；热油溅起时先关火，别把手伸进锅里。",
      en: "Pat ingredients dry before they hit the oil and lower them in gently. If oil spits, turn off the heat and keep your hands clear.",
    },
    {
      test: /咸|淡|糖|盐|salty|salt|sweet/,
      zh: "宁淡勿咸：先加配方里三分之二的盐，尝味后再补。太咸可以加一点糖或少量水稀释。",
      en: "Start with two thirds of the salt, taste, then adjust. If it is too salty, add a pinch of sugar or a splash of water.",
    },
    {
      test: /多久|时间|分钟|how long|time|minute/,
      zh: "以锅中状态为准而不是只看钟：食材变软、颜色改变、汁水收浓，就是可以进入下一步的信号。",
      en: "Use the pan as your clock: when the food softens, changes color or the sauce thickens, it is ready for the next step.",
    },
    {
      test: /洗|焯|淀粉|粘|黏|starch|sticky|rinse/,
      zh: "土豆丝、藕片这类食材要洗掉表面淀粉，焯水后立刻沥干，下锅才不容易粘成一团。",
      en: "For starchy ingredients, rinse off the surface starch and drain right after blanching; they will not clump in the wok.",
    },
    {
      test: /替代|没有|换成|substitute|instead|missing/,
      zh: "缺一味调料时优先省略，不要用完全相反的味道替代；主料缺失就换一道更简单的菜。",
      en: "If a seasoning is missing, omit it rather than substituting an opposite flavor. If a main ingredient is missing, pick a simpler dish.",
    },
  ];
  const matched = tips.find((tip) => tip.test.test(q));
  if (matched) return { zh: matched.zh, en: matched.en };
  const fallbackZh =
    step?.tip?.zh ?? "按当前步骤慢慢来，保持锅中有油、火不要太大，遇到不确定就先关小火再观察。";
  const fallbackEn =
    step?.tip?.en ??
    "Follow the current step slowly, keep a little oil in the pan and the heat moderate. When unsure, lower the heat first.";
  return language === "zh"
    ? { zh: fallbackZh, en: fallbackEn }
    : { zh: fallbackZh, en: fallbackEn };
}

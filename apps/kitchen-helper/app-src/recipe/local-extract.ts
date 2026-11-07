/**
 * Deterministic offline recipe extraction.
 *
 * This is the fallback when no DeepSeek key is configured (or the LLM is
 * unreachable).  It turns HowToCook Markdown into the same structured recipe
 * shape the LLM produces, so every screen in the app still works.  Chinese and
 * English fields are identical here; the UI marks the result as "local parser".
 */

import type {
  IconKey,
  Localized,
  PrepItem,
  Recipe,
  RecipeStep,
  StepTimerSpec,
} from "../model/types.ts";
import { RecipePipelineError } from "./errors.ts";

export interface LocalExtractContext {
  readonly titleHint: string;
  readonly pageUrl: string;
  readonly markdownUrl: string | null;
  readonly fetchedAt: string;
  /** True when the input is visible page text rather than Markdown. */
  readonly fromPageText?: boolean;
}

const COOKWARE_WORDS =
  /锅|铲|刀|砧板|菜板|面板|碗|盘|碟|勺|夹|烤箱|微波炉|电饭煲|蒸屉|蒸锅|烤盘|烤架|料理机|打蛋器|漏勺|滤网|擀面杖|保鲜膜|锡纸|手套|量杯|茶匙|汤匙/;
const PREP_WORDS = /洗|切|剁|剥|去皮|改刀|腌制|腌|备|称|量|准备/;

function l(text: string): Localized {
  return { zh: text, en: text };
}

function cleanMarkdown(text: string): string {
  return text
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\s+([，。；：、！？])/g, "$1")
    .trim();
}

function splitLines(text: string): string[] {
  return text.replace(/\r\n?/g, "\n").split("\n");
}

function normalizeHeading(line: string): string {
  return line
    .replace(/^#+\s*/, "")
    .replace(/[:：]\s*$/, "")
    .trim();
}

function parseIngredientLine(line: string): string {
  return cleanMarkdown(
    line
      .replace(/^\s*[-*+]\s+/, "")
      .replace(/^\s*\d+[.、)]\s+/, "")
      .replace(/[:：]\s*$/, ""),
  ).trim();
}

export function detectHeat(text: string): 0 | 1 | 2 | 3 {
  if (/大火|猛火|爆炒|油炸|炸至|高火/.test(text)) return 3;
  if (/中火|翻炒|煎至|煎|煮开|煮沸|烧开|焖|炖/.test(text)) return 2;
  if (/小火|微火|慢炖|慢煮|收汁| simmer/i.test(text)) return 1;
  if (PREP_WORDS.test(text)) return 0;
  return 0;
}

export function detectIcon(text: string): IconKey {
  if (/蛋/.test(text)) return "egg";
  if (/番茄|西红柿/.test(text)) return "tomato";
  if (/土豆|青椒|红椒|辣椒|蔬菜|葱|蒜|姜|西兰花|白菜|萝卜|茄子|黄瓜/.test(text)) {
    return "vegetable";
  }
  if (/鸡|牛|猪|羊|肉|翅|排骨|鱼|虾/.test(text)) return "meat";
  if (/豆腐|豆干/.test(text)) return "tofu";
  if (/盐|糖|酱|醋|料|粉|椒盐|生抽|老抽|蚝油|料酒/.test(text)) return "seasoning";
  if (/油/.test(text)) return "oil";
  if (/水|汤|焯|洗|泡/.test(text)) return "water";
  if (/面|米|饭|粉|饺/.test(text)) return "grain";
  if (/装盘|盛盘|出锅|摆盘/.test(text)) return "dish";
  if (/切|刀|丝|片|块|剁/.test(text)) return "knife";
  if (/锅|炒|煎|炸|火/.test(text)) return "flame";
  if (/碗|搅拌|打散/.test(text)) return "bowl";
  return "other";
}

/** Parse the first explicit duration in a step and convert it to seconds. */
export function extractTimerSeconds(text: string): number | null {
  const pattern = /(\d+(?:\.\d+)?)\s*(小时|钟头|分钟|分|秒钟|秒)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const amount = Number.parseFloat(match[1] as string);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const unit = match[2] as string;
    const seconds =
      unit === "小时" || unit === "钟头"
        ? amount * 3600
        : unit === "分钟" || unit === "分"
          ? amount * 60
          : amount;
    if (seconds >= 5 && seconds <= 7_200) return Math.round(seconds);
  }
  return null;
}

function guessTitle(instruction: string, index: number): string {
  const first = instruction.split(/[，。；：,;.]/)[0]?.trim() ?? "";
  const clean = first.replace(/^(将|把|先|然后|接着|再|可选：)/, "").trim();
  if (clean.length === 0) return `步骤 ${index + 1}`;
  return clean.length > 14 ? `${clean.slice(0, 14)}…` : clean;
}

interface Section {
  readonly heading: string;
  readonly lines: string[];
}

function splitSections(lines: string[]): { preamble: string[]; sections: Section[] } {
  const preamble: string[] = [];
  const sections: Section[] = [];
  let current: Section | null = null;
  for (const line of lines) {
    const headingMatch = /^(#{2,6})\s+(.*)$/.exec(line);
    if (headingMatch) {
      current = { heading: normalizeHeading(line), lines: [] };
      sections.push(current);
      continue;
    }
    if (current) current.lines.push(line);
    else preamble.push(line);
  }
  return { preamble, sections };
}

function findSection(sections: Section[], words: string[]): Section | null {
  return sections.find((section) => words.some((word) => section.heading.includes(word))) ?? null;
}

function parseAmountMap(lines: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const raw of lines) {
    const line = parseIngredientLine(raw);
    if (!line) continue;
    const equals = line.split(/[=＝]/);
    if (equals.length >= 2) {
      const name = (equals[0] as string).trim();
      const amount = equals
        .slice(1)
        .join("=")
        .replace(/\*\s*份数/g, "")
        .replace(/份数\s*\*/g, "")
        .trim();
      if (name && amount) map.set(name, amount);
      continue;
    }
    const colon = /^(.+?)[:：]\s*(.+)$/.exec(line);
    if (colon && colon[1] && colon[2]) {
      map.set(cleanMarkdown(colon[1]), cleanMarkdown(colon[2]));
      continue;
    }
    const trailing =
      /^(.+?)\s+(\d+(?:\.\d+)?\s*(?:个|只|克|g|ml|毫升|瓣|片|根|颗|汤匙|茶匙|勺|块|段|张|杯))/i.exec(
        line,
      );
    if (trailing && trailing[1] && trailing[2]) {
      map.set(cleanMarkdown(trailing[1]), cleanMarkdown(trailing[2]));
    }
  }
  return map;
}

function isOptional(name: string): boolean {
  return /可选|根据口味|按需/.test(name);
}

function buildPrepItems(
  names: string[],
  amounts: Map<string, string>,
  idPrefix: string,
): PrepItem[] {
  const seen = new Set<string>();
  const items: PrepItem[] = [];
  for (const raw of names) {
    const optional = isOptional(raw);
    const name = cleanMarkdown(raw.replace(/[（(]可选[）)]/g, "").replace(/（.*?可选.*?）/g, ""))
      .replace(/\s+/g, " ")
      .trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const direct = amounts.get(name);
    const loose = [...amounts.entries()].find(
      ([candidate]) => candidate.includes(name) || name.includes(candidate),
    )?.[1];
    const amount = direct ?? loose ?? (optional ? "可选 / optional" : "适量 / to taste");
    items.push({
      id: `${idPrefix}-${items.length + 1}`,
      name: l(name),
      amount: l(amount),
      icon: detectIcon(name),
    });
  }
  return items;
}

function collectCookware(text: string, amounts: Map<string, string>, idPrefix: string): PrepItem[] {
  const found: string[] = [];
  for (const name of amounts.keys()) {
    if (COOKWARE_WORDS.test(name) && !found.includes(name)) found.push(name);
  }
  for (const match of text.matchAll(
    /(?:使用|准备|拿出|取出|用)([\u4e00-\u9fa5]{1,6}?(?:锅|碗|盘|刀|板|铲|勺|烤箱|微波炉))/g,
  )) {
    const name = match[1];
    if (name && !found.includes(name)) found.push(name);
  }
  for (const word of ["炒锅", "锅铲", "砧板", "菜刀", "搅拌碗", "漏勺"]) {
    if (text.includes(word) && !found.includes(word)) found.push(word);
  }
  if (found.length === 0) found.push("炒锅", "锅铲");
  return buildPrepItems(found.slice(0, 8), amounts, idPrefix);
}

function parseSteps(section: Section | null): RecipeStep[] {
  if (!section) return [];
  const lines = section.lines;
  const steps: RecipeStep[] = [];
  let currentInstruction = "";
  let currentTips: string[] = [];
  const flush = (): void => {
    if (!currentInstruction) return;
    const instruction = cleanMarkdown(currentInstruction);
    if (!instruction) return;
    const durationSeconds = extractTimerSeconds(instruction);
    const timers: StepTimerSpec[] = [];
    if (durationSeconds) {
      timers.push({
        id: `t-${steps.length + 1}`,
        label: l(guessTitle(instruction, steps.length)),
        durationSeconds,
      });
    }
    steps.push({
      id: `step-${steps.length + 1}`,
      title: l(guessTitle(instruction, steps.length)),
      instruction: l(instruction),
      tip: currentTips.length > 0 ? l(currentTips.map(cleanMarkdown).join(" ")) : undefined,
      timers,
      heat: detectHeat(instruction),
      icon: detectIcon(instruction),
    });
    currentInstruction = "";
    currentTips = [];
  };
  for (const rawLine of lines) {
    const numbered = /^\s{0,2}(\d+)[.、)]\s+(.*)$/.exec(rawLine);
    if (numbered && numbered[2]) {
      flush();
      currentInstruction = numbered[2];
      continue;
    }
    const nested = /^\s{2,}[-*+]\s+(.*)$/.exec(rawLine);
    if (nested && currentInstruction && nested[1]) {
      currentTips.push(nested[1]);
      continue;
    }
    const bullet = /^\s*[-*+]\s+(.*)$/.exec(rawLine);
    if (bullet && bullet[1]) {
      if (currentInstruction && /可选|注意|想|建议/.test(bullet[1])) {
        currentTips.push(bullet[1]);
      } else {
        flush();
        currentInstruction = bullet[1];
      }
      continue;
    }
    if (currentInstruction && rawLine.trim() && !rawLine.startsWith("```")) {
      currentInstruction += ` ${rawLine.trim()}`;
    }
  }
  flush();
  if (steps.length >= 2) return steps;
  // Page text often loses list markers; treat the most cooking-like lines as steps.
  const fallback = lines
    .map((line) => cleanMarkdown(line))
    .filter(
      (line) =>
        line.length >= 4 &&
        !/^(计算|总量|每次制作|按照|一份|如果您|点击|社区|贡献者|最后更新)/.test(line) &&
        /[，。；]|炒|煮|切|煎|炖|加|放|倒|关火|装盘|热锅/.test(line),
    );
  return fallback.slice(0, 10).map((instruction, index) => {
    const durationSeconds = extractTimerSeconds(instruction);
    return {
      id: `step-${index + 1}`,
      title: l(guessTitle(instruction, index)),
      instruction: l(instruction),
      timers: durationSeconds
        ? [{ id: `t-${index + 1}`, label: l(guessTitle(instruction, index)), durationSeconds }]
        : [],
      heat: detectHeat(instruction),
      icon: detectIcon(instruction),
    };
  });
}

function summaryOf(preamble: string[], title: string): string {
  for (const line of preamble) {
    const text = cleanMarkdown(line);
    if (!text || text.includes(title) || /^预估|^##/.test(text)) continue;
    if (text.length >= 10) return text;
  }
  return "";
}

/**
 * Convert Markdown (or page text that still has usable sections) into a Recipe.
 * Throws {@link RecipePipelineError} with code `invalid` when nothing useful
 * can be extracted.
 */
export function extractLocalRecipe(sourceText: string, context: LocalExtractContext): Recipe {
  const text = sourceText.trim();
  if (text.length < 40) {
    throw new RecipePipelineError(
      "invalid",
      "recipe text is too short to structure",
      "local-extract",
    );
  }
  let normalized = text;
  if (context.fromPageText) normalized = pageTextToMarkdown(normalized, context.titleHint);
  const lines = splitLines(normalized);
  const h1 = lines.find((line) => /^#\s+/.test(line));
  const titleFromHeading = h1
    ? normalizeHeading(h1)
        .replace(/的做法$/, "")
        .replace(/^.*?([^ ]+?)的做法.*$/, "$1")
        .trim()
    : "";
  const { preamble, sections } = splitSections(lines);
  const ingredientsSection = findSection(sections, ["原料", "食材"]);
  const calcSection = findSection(sections, ["计算", "用量"]);
  const stepsSection = findSection(sections, ["操作", "步骤", "做法"]);
  const title = context.titleHint || titleFromHeading || "家常菜";
  const summary = summaryOf(preamble, title) || l("按步骤慢慢来，你也可以做好这道菜。").zh;
  const allText = normalized;

  const difficultyStars = /预估烹饪难度[:：]\s*(★+)/.exec(allText)?.[1]?.length ?? 0;
  const difficulty = Math.max(1, Math.min(5, difficultyStars || 2));
  const caloriesMatch = /预估卡路里[:：]\s*(\d+)/.exec(allText);
  const caloriesKcal = caloriesMatch ? Number.parseInt(caloriesMatch[1] as string, 10) : undefined;
  const minuteMatches = [...allText.matchAll(/(\d+)\s*分钟/g)]
    .map((match) => Number.parseInt(match[1] as string, 10))
    .filter((value) => value >= 3 && value <= 240);
  const hourMatches = [...allText.matchAll(/(\d+)\s*小时/g)]
    .map((match) => Number.parseInt(match[1] as string, 10) * 60)
    .filter((value) => value >= 10 && value <= 300);
  const steps = parseSteps(stepsSection);
  const estimated = 10 + steps.length * 3;
  const totalMinutes = minuteMatches[0] ?? hourMatches[0] ?? estimated;

  const amounts = parseAmountMap(calcSection?.lines ?? []);
  const ingredientNames = (ingredientsSection?.lines ?? [])
    .map((line) => parseIngredientLine(line))
    .filter((name) => name.length > 0);
  const rawIngredients = ingredientNames.filter((name) => !COOKWARE_WORDS.test(name));
  const cookwareNames = ingredientNames.filter((name) => COOKWARE_WORDS.test(name));
  const ingredients = buildPrepItems(
    rawIngredients.length > 0
      ? rawIngredients
      : [...amounts.keys()].filter((name) => !COOKWARE_WORDS.test(name)),
    amounts,
    "ing",
  );
  const cookware = buildPrepItems(cookwareNames, amounts, "tool");
  const extraCookware = collectCookware(allText, amounts, "tool-extra");
  const mergedCookware = [...cookware];
  for (const item of extraCookware) {
    if (!mergedCookware.some((candidate) => candidate.name.zh === item.name.zh)) {
      mergedCookware.push({ ...item, id: `tool-${mergedCookware.length + 1}` });
    }
  }

  // Cookware is often implied by the prose rather than listed; always give a
  // beginner at least a wok and a spatula.
  for (const fallback of [
    { name: "炒锅", icon: "pan" as const },
    { name: "锅铲", icon: "knife" as const },
  ]) {
    if (!mergedCookware.some((item) => item.name.zh.includes(fallback.name))) {
      mergedCookware.push({
        id: `tool-${mergedCookware.length + 1}`,
        name: l(fallback.name),
        amount: l("1 件"),
        icon: fallback.icon,
      });
    }
  }
  if (ingredients.length === 0) {
    throw new RecipePipelineError(
      "invalid",
      "no ingredients found in recipe text",
      "local-extract",
    );
  }
  if (steps.length < 2) {
    throw new RecipePipelineError("invalid", "not enough cooking steps found", "local-extract");
  }

  return {
    title: l(title),
    summary: l(summary),
    difficulty,
    totalMinutes: Math.max(5, totalMinutes),
    servings: l("1–2 人份"),
    caloriesKcal,
    ingredients,
    cookware: mergedCookware.slice(0, 8),
    steps: steps.slice(0, 16),
    source: {
      provider: "HowToCook",
      pageUrl: context.pageUrl,
      markdownUrl: context.markdownUrl ?? undefined,
      fetchedAt: context.fetchedAt,
      extractedBy: "local",
    },
  };
}

/**
 * Reconstruct section headings from the visible text of the detail page.  The
 * page text keeps list items one per line, just without Markdown markers.
 */
export function pageTextToMarkdown(pageText: string, title: string): string {
  const lines = splitLines(pageText).map((line) => line.trim());
  const start = lines.findIndex((line) => line === "原料和工具" || line === "必备原料和工具");
  const stepsAt = lines.findIndex((line, index) => index > start && line === "步骤");
  if (start < 0 || stepsAt < 0) return pageText;
  const amountAt = lines.findIndex(
    (line, index) => index > start && index < stepsAt && (line === "计算" || line === "用量"),
  );
  const endAt = lines.findIndex(
    (line, index) =>
      index > stepsAt && ["补充说明", "附加内容", "社区内容", "评论", "最后更新"].includes(line),
  );
  const ingredientLines = lines.slice(start + 1, amountAt > 0 ? amountAt : stepsAt);
  const amountLines = amountAt > 0 ? lines.slice(amountAt + 1, stepsAt) : [];
  const stepLines = lines.slice(stepsAt + 1, endAt > 0 ? endAt : undefined);
  const summaryAt = lines.findIndex((line) => line.includes(title) && line.length > 10);
  const summary = summaryAt >= 0 ? (lines[summaryAt] as string) : "";
  const output: string[] = [
    `# ${title}`,
    "",
    summary,
    "",
    "## 必备原料和工具",
    ...ingredientLines.filter((line) => line.length > 0).map((line) => `- ${line}`),
    "",
    "## 计算",
    ...amountLines.filter((line) => line.length > 0).map((line) => `- ${line}`),
    "",
    "## 操作",
  ];
  let stepNumber = 0;
  for (const line of stepLines) {
    if (!line) continue;
    if (line.startsWith("可选：") || line.startsWith("注意：")) {
      output.push(`  - ${line}`);
      continue;
    }
    stepNumber += 1;
    output.push(`${stepNumber}. ${line}`);
  }
  return output.join("\n");
}

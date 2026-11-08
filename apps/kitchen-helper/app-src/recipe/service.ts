/**
 * Recipe pipeline orchestration:
 *
 *   user text -> HowToCook search -> Markdown/detail page -> DeepSeek structuring
 *                                    \-> local parser fallback -> structured Recipe
 *
 * Every stage reports progress so the loading screen can animate the current
 * phase.  Built-in offline snapshots keep the demo usable without network or an
 * API key.
 */

import type { LoadingPhase, Localized, Recipe, RecipeStep } from "../model/types.ts";
import { hasDeepSeekKey } from "../config.ts";
import { RecipePipelineError, isRecipePipelineError } from "./errors.ts";
import { fetchRecipeMaterial, searchHowToCook } from "./howtocook.ts";
import { askDeepSeekAssistant, localAssistantAnswer, structureRecipeWithDeepSeek } from "./llm.ts";
import { extractLocalRecipe } from "./local-extract.ts";
import { findOfflineRecipe } from "./recommended.ts";

export type ProgressReporter = (phase: LoadingPhase, detail: Localized) => void;

/** Log why a network/LLM stage fell back, without leaking keys or full responses. */
function logFallback(stage: string, error: unknown): void {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; current && depth < 4; depth += 1) {
    const value = current as { message?: unknown; code?: unknown; cause?: unknown };
    const text = typeof value.message === "string" ? value.message : String(current);
    const code = value.code === undefined ? "" : ` [${String(value.code)}]`;
    parts.push(`${text}${code}`);
    current = value.cause;
  }
  console.log(`KITCHEN_HELPER_FALLBACK ${JSON.stringify({ stage, reason: parts.join(" <- ") })}`);
}

function l(zh: string, en: string): Localized {
  return { zh, en };
}

function offlineResult(query: string): Recipe | null {
  return findOfflineRecipe(query);
}

function asPipelineError(error: unknown, query: string): RecipePipelineError {
  if (isRecipePipelineError(error)) return error;
  const detail = error instanceof Error ? error.message : String(error);
  return new RecipePipelineError(
    "network",
    `recipe pipeline failed for "${query}": ${detail}`,
    detail,
  );
}

/**
 * Load and structure one recipe.  Throws {@link RecipePipelineError} when no
 * usable result can be produced; the controller turns that into the error screen.
 */
export async function loadRecipe(
  query: string,
  report: ProgressReporter = () => undefined,
): Promise<Recipe> {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new RecipePipelineError("invalid", "empty dish name", "empty-query");
  }
  const offline = offlineResult(trimmed);

  report("search", l(`正在 HowToCook 搜索「${trimmed}」`, `Searching HowToCook for “${trimmed}”`));
  let search;
  try {
    search = await searchHowToCook(trimmed);
  } catch (error) {
    logFallback("search", error);
    if (offline) return finishOffline(offline, report);
    throw asPipelineError(error, trimmed);
  }

  report("fetch", l("正在读取菜谱原文", "Reading the recipe source"));
  let material;
  try {
    material = await fetchRecipeMaterial(search);
  } catch (error) {
    logFallback("fetch", error);
    if (offline) return finishOffline(offline, report);
    throw asPipelineError(error, trimmed);
  }

  const sourceText = material.markdown ?? material.pageText;
  const context = {
    titleHint: material.search.titleZh,
    pageUrl: material.search.pageUrl,
    markdownUrl: material.markdownUrl,
    fetchedAt: new Date().toISOString(),
  };

  report("structure", l("AI 正在整理成 AR 步骤", "AI is structuring the AR steps"));
  if (hasDeepSeekKey()) {
    try {
      const recipe = await structureRecipeWithDeepSeek({ sourceText, context });
      report("finish", l("菜谱准备好了", "Recipe ready"));
      return recipe;
    } catch (error) {
      // A slow or unavailable model should not kill the demo: fall through to
      // the offline snapshot or the deterministic parser.
      logFallback("deepseek", error);
      if (offline) return finishOffline(offline, report);
      try {
        const local = extractLocalRecipe(sourceText, {
          ...context,
          fromPageText: !material.markdown,
        });
        report("finish", l("已用本地解析完成", "Structured locally"));
        return local;
      } catch {
        throw asPipelineError(error, trimmed);
      }
    }
  }

  try {
    const local = extractLocalRecipe(sourceText, {
      ...context,
      fromPageText: !material.markdown,
    });
    report("finish", l("已用本地解析完成", "Structured locally"));
    return local;
  } catch (error) {
    if (offline) return finishOffline(offline, report);
    throw asPipelineError(error, trimmed);
  }
}

function finishOffline(recipe: Recipe, report: ProgressReporter): Recipe {
  report("finish", l("已使用内置菜谱", "Using a built-in recipe"));
  return recipe;
}

/** Answer a question from the cooking screen; always resolves to a usable tip. */
export async function answerCookingQuestion(
  question: string,
  recipe: Recipe,
  step: RecipeStep | null,
  language: "zh" | "en",
): Promise<Localized> {
  if (hasDeepSeekKey() && step) {
    try {
      return await askDeepSeekAssistant(question, recipe, step, language);
    } catch {
      return localAssistantAnswer(question, step, language);
    }
  }
  return localAssistantAnswer(question, step, language);
}

/** Exposed for tests: offline fallback lookup without network. */
export function offlineRecipe(query: string): Recipe | null {
  return offlineResult(query);
}

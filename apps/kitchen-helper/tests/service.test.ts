import assert from "node:assert/strict";
import { test } from "node:test";

import { isRecipePipelineError } from "../app-src/recipe/errors.ts";
import { loadRecipe, answerCookingQuestion } from "../app-src/recipe/service.ts";
import { findOfflineRecipe } from "../app-src/recipe/recommended.ts";
import { recordCompletion } from "../app-src/storage.ts";

const originalFetch = globalThis.fetch;

function offlineFetch(): void {
  globalThis.fetch = (async () => {
    throw new Error("offline in unit test");
  }) as typeof fetch;
}

test("known dishes fall back to the built-in snapshot when the network is unavailable", async () => {
  offlineFetch();
  try {
    const recipe = await loadRecipe("番茄炒蛋");
    assert.match(recipe.title.zh, /番茄|西红柿/);
    assert.ok(recipe.steps.length >= 3);
    assert.equal(recipe.source.provider, "HowToCook");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("unknown dishes surface a network pipeline error when everything is offline", async () => {
  offlineFetch();
  try {
    await assert.rejects(loadRecipe("不存在的菜abc"), (error: unknown) => {
      if (!isRecipePipelineError(error)) return false;
      assert.equal(error.code, "network");
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("assistant answers are local and useful without a DeepSeek key", async () => {
  delete process.env.DEEPSEEK_API_KEY;
  const recipe = findOfflineRecipe("番茄炒蛋");
  if (!recipe) throw new Error("offline tomato recipe is missing");
  const answer = await answerCookingQuestion(
    "切菜有什么技巧",
    recipe,
    recipe.steps[0] ?? null,
    "zh",
  );
  assert.ok(answer.zh.length > 8);
  assert.ok(answer.en.length > 8);
});

test("completion history increments and keeps the last dish", () => {
  const next = recordCompletion(
    { completedCount: 2, lastDish: null },
    { zh: "番茄炒蛋", en: "Tomato" },
  );
  assert.equal(next.completedCount, 3);
  assert.deepEqual(next.lastDish, { zh: "番茄炒蛋", en: "Tomato" });
});

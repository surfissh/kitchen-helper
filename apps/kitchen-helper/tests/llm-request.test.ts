import assert from "node:assert/strict";
import { test } from "node:test";

import { DEEPSEEK_STRUCTURE_MAX_TOKENS } from "../app-src/config.ts";
import { RecipePipelineError } from "../app-src/recipe/errors.ts";
import { structureRecipeWithDeepSeek } from "../app-src/recipe/llm.ts";

/** Minimal valid structured payload (two steps are required by the normalizer). */
const modelPayload = {
  titleZh: "测试菜",
  titleEn: "Test Dish",
  summaryZh: "测试用菜谱。",
  summaryEn: "A test recipe.",
  difficulty: 2,
  totalMinutes: 10,
  servingsZh: "1 人份",
  servingsEn: "1 serving",
  caloriesKcal: 200,
  ingredients: [
    { nameZh: "盐", nameEn: "Salt", amountZh: "1 克", amountEn: "1 g", icon: "seasoning" },
  ],
  cookware: [],
  steps: [
    {
      titleZh: "备料",
      titleEn: "Prep",
      instructionZh: "准备食材。",
      instructionEn: "Prepare the ingredients.",
      tipZh: null,
      tipEn: null,
      durationSeconds: null,
      timers: [],
      heat: 0,
      icon: "board",
    },
    {
      titleZh: "翻炒",
      titleEn: "Stir-fry",
      instructionZh: "大火翻炒 20 秒。",
      instructionEn: "Stir-fry over high heat for 20 seconds.",
      tipZh: null,
      tipEn: null,
      durationSeconds: 20,
      timers: [],
      heat: 2,
      icon: "flame",
    },
  ],
};

const context = {
  titleHint: "测试菜",
  pageUrl: "https://howtocook.aiursoft.com/Recipes/Detail/1",
  markdownUrl: null,
  fetchedAt: "2026-11-07T00:00:00.000Z",
};
const input = { sourceText: "测试菜谱原文", context };

interface StubCall {
  readonly url: string;
  readonly body: Record<string, unknown>;
}

/** Replace global fetch with a queue of canned responses; returns a restore fn. */
function stubFetch(responses: Array<Response | (() => Response)>): {
  calls: StubCall[];
  restore: () => void;
} {
  const original = globalThis.fetch;
  const calls: StubCall[] = [];
  let index = 0;
  globalThis.fetch = (async (requestInput: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof requestInput === "string"
        ? requestInput
        : requestInput instanceof URL
          ? requestInput.href
          : requestInput.url;
    calls.push({ url, body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown> });
    const entry = responses[Math.min(index, responses.length - 1)];
    index += 1;
    if (entry === undefined) throw new Error("no stubbed response");
    return typeof entry === "function" ? entry() : entry;
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

function chatResponse(content: string, finishReason = "stop"): Response {
  return new Response(
    JSON.stringify({
      choices: [{ finish_reason: finishReason, message: { content } }],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

async function withApiKey<T>(body: () => Promise<T>): Promise<T> {
  const previous = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "sk-test-runtime-key";
  try {
    return await body();
  } finally {
    if (previous === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previous;
  }
}

async function expectLlmFailure(errorP: Promise<unknown>, detail: string): Promise<void> {
  let caught: unknown = null;
  try {
    await errorP;
  } catch (error) {
    caught = error;
  }
  if (!(caught instanceof RecipePipelineError)) {
    throw new Error(`expected a RecipePipelineError, got ${String(caught)}`);
  }
  assert.equal(caught.detail, detail);
}

test("structuring disables thinking mode and sends a large output budget", async () => {
  const stub = stubFetch([chatResponse(JSON.stringify(modelPayload))]);
  try {
    await withApiKey(async () => {
      const recipe = await structureRecipeWithDeepSeek(input);
      assert.equal(recipe.title.zh, "测试菜");
    });
    assert.equal(stub.calls.length, 1);
    const body = stub.calls[0]?.body ?? {};
    assert.deepEqual(body.thinking, { type: "disabled" });
    assert.equal(body.max_tokens, DEEPSEEK_STRUCTURE_MAX_TOKENS);
    assert.deepEqual(body.response_format, { type: "json_object" });
    assert.equal(body.stream, false);
    assert.equal(body.model, "deepseek-flash");
  } finally {
    stub.restore();
  }
});

test("JSON Output blank content is retried once, then succeeds", async () => {
  const stub = stubFetch([chatResponse("   ", "stop"), chatResponse(JSON.stringify(modelPayload))]);
  try {
    await withApiKey(async () => {
      const recipe = await structureRecipeWithDeepSeek(input);
      assert.equal(recipe.steps.length, 2);
    });
    assert.equal(stub.calls.length, 2);
  } finally {
    stub.restore();
  }
});

test("blank content twice fails with empty-response after one retry", async () => {
  const stub = stubFetch([chatResponse("   "), chatResponse("")]);
  try {
    await withApiKey(async () => {
      await expectLlmFailure(structureRecipeWithDeepSeek(input), "empty-response");
    });
    assert.equal(stub.calls.length, 2);
  } finally {
    stub.restore();
  }
});

test("a truncated JSON payload is retried and reported as truncated", async () => {
  const partial = '{"titleZh":"测试菜","steps":[';
  const stub = stubFetch([chatResponse(partial, "length"), chatResponse(partial, "length")]);
  try {
    await withApiKey(async () => {
      await expectLlmFailure(structureRecipeWithDeepSeek(input), "truncated");
    });
    assert.equal(stub.calls.length, 2);
  } finally {
    stub.restore();
  }
});

test("unparsable JSON is retried once before giving up", async () => {
  const stub = stubFetch([
    chatResponse("this is not json"),
    chatResponse(JSON.stringify(modelPayload)),
  ]);
  try {
    await withApiKey(async () => {
      const recipe = await structureRecipeWithDeepSeek(input);
      assert.equal(recipe.title.zh, "测试菜");
    });
    assert.equal(stub.calls.length, 2);
  } finally {
    stub.restore();
  }
});

test("non-retryable finish reasons fail immediately", async () => {
  const stub = stubFetch([chatResponse("", "content_filter")]);
  try {
    await withApiKey(async () => {
      await expectLlmFailure(structureRecipeWithDeepSeek(input), "content_filter");
    });
    assert.equal(stub.calls.length, 1);
  } finally {
    stub.restore();
  }
});

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  localAssistantAnswer,
  normalizeStructuredRecipe,
  parseJsonObject,
} from "../app-src/recipe/llm.ts";

const context = {
  titleHint: "测试菜",
  pageUrl: "https://howtocook.aiursoft.com/Recipes/Detail/1",
  markdownUrl: null,
  fetchedAt: "2026-11-07T00:00:00.000Z",
};

const payload = {
  titleZh: "番茄炒蛋",
  titleEn: "Tomato & Eggs",
  summaryZh: "酸甜开胃。",
  summaryEn: "Sweet and tangy.",
  difficulty: 2,
  totalMinutes: 15,
  servingsZh: "1–2 人份",
  servingsEn: "Serves 1–2",
  caloriesKcal: 252,
  ingredients: [
    { nameZh: "西红柿", nameEn: "Tomatoes", amountZh: "2 个", amountEn: "2", icon: "tomato" },
    { nameZh: "鸡蛋", nameEn: "Eggs", amountZh: "3 个", amountEn: "3", icon: "egg" },
  ],
  cookware: [],
  steps: [
    {
      titleZh: "切西红柿",
      titleEn: "Cut tomatoes",
      instructionZh: "西红柿洗净切成小块。",
      instructionEn: "Wash and cut the tomatoes into chunks.",
      tipZh: "小心手指。",
      tipEn: "Watch your fingers.",
      durationSeconds: null,
      timers: [],
      heat: 0,
      icon: "tomato",
    },
    {
      titleZh: "翻炒",
      titleEn: "Stir-fry",
      instructionZh: "大火翻炒 20 秒。",
      instructionEn: "Stir-fry over high heat for 20 seconds.",
      durationSeconds: 20,
      timers: [],
      heat: 9,
      icon: "flame",
    },
    {
      titleZh: "装盘",
      titleEn: "Plate",
      instructionZh: "关火装盘。",
      instructionEn: "Turn off the heat and plate.",
      durationSeconds: null,
      timers: [],
      heat: 0,
      icon: "dish",
    },
  ],
};

test("structured model JSON is validated and clamped into the app schema", () => {
  const recipe = normalizeStructuredRecipe(payload, context);
  assert.equal(recipe.title.zh, "番茄炒蛋");
  assert.equal(recipe.title.en, "Tomato & Eggs");
  assert.equal(recipe.ingredients.length, 2);
  // The model omitted cookware; the normalizer supplies a safe default.
  assert.equal(recipe.cookware.length, 2);
  assert.equal(recipe.steps.length, 3);
  assert.equal(recipe.steps[1]?.heat, 3);
  assert.equal(recipe.steps[1]?.timers[0]?.durationSeconds, 20);
  assert.equal(recipe.source.extractedBy, "deepseek");
});

test("explicit timer arrays are preserved with bilingual labels", () => {
  const withTimers = {
    ...payload,
    steps: [
      payload.steps[0],
      {
        ...payload.steps[1],
        durationSeconds: null,
        timers: [
          { labelZh: "炖煮", labelEn: "Simmer", durationSeconds: 900 },
          { labelZh: "发酵", labelEn: "Proof", durationSeconds: 1_200 },
        ],
      },
      payload.steps[2],
    ],
  };
  const recipe = normalizeStructuredRecipe(withTimers, context);
  assert.equal(recipe.steps[1]?.timers.length, 2);
  assert.equal(recipe.steps[1]?.timers[1]?.label.en, "Proof");
});

test("JSON is recovered from markdown fences and extra prose", () => {
  const fenced = '```json\n{"a":1}\n```';
  assert.deepEqual(parseJsonObject(fenced), { a: 1 });
  const prose = 'Here you go: {"a":2} — enjoy';
  assert.deepEqual(parseJsonObject(prose), { a: 2 });
});

test("invalid structured payloads are rejected", () => {
  assert.throws(() => normalizeStructuredRecipe({}, context));
  assert.throws(() =>
    normalizeStructuredRecipe(
      {
        ...payload,
        ingredients: [],
      },
      context,
    ),
  );
  assert.throws(() =>
    normalizeStructuredRecipe(
      {
        ...payload,
        steps: [payload.steps[0]],
      },
      context,
    ),
  );
});

test("offline assistant answers cover knife safety in both languages", () => {
  const step = normalizeStructuredRecipe(payload, context).steps[0]!;
  const zh = localAssistantAnswer("切菜有什么技巧", step, "zh");
  const en = localAssistantAnswer("any knife tips?", step, "en");
  assert.match(zh.zh, /刀/);
  assert.match(en.en, /knife/i);
  assert.ok(zh.en.length > 0);
});

test("offline assistant falls back to the step tip", () => {
  const recipe = normalizeStructuredRecipe(payload, context);
  const answer = localAssistantAnswer("这个可以吗", recipe.steps[0]!, "zh");
  assert.match(answer.zh, /手指/);
});

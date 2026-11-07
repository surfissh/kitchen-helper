import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  detectHeat,
  detectIcon,
  extractLocalRecipe,
  extractTimerSeconds,
  pageTextToMarkdown,
} from "../app-src/recipe/local-extract.ts";

function fixture(name: string): string {
  return readFileSync(join(process.cwd(), "tests", "fixtures", name), "utf8");
}

const context = {
  titleHint: "西红柿炒鸡蛋",
  pageUrl: "https://howtocook.aiursoft.com/Recipes/Detail/37",
  markdownUrl:
    "https://github.com/Anduin2017/HowToCook/blob/master/dishes/vegetable_dish/西红柿炒鸡蛋.md",
  fetchedAt: "2026-11-07T00:00:00.000Z",
};

test("timer units are detected from beginner instructions", () => {
  assert.equal(extractTimerSeconds("加入西红柿块，翻炒 20 秒"), 20);
  assert.equal(extractTimerSeconds("腌制 10 分钟"), 600);
  assert.equal(extractTimerSeconds("转中火慢煮约 15 分钟"), 900);
  assert.equal(extractTimerSeconds("炖 1 小时"), 3_600);
  assert.equal(extractTimerSeconds("翻炒至变色"), null);
  assert.equal(extractTimerSeconds("划两刀"), null);
});

test("heat and icon heuristics follow cooking verbs", () => {
  assert.equal(detectHeat("大火爆炒 30 秒"), 3);
  assert.equal(detectHeat("中火翻炒均匀"), 2);
  assert.equal(detectHeat("转小火收汁"), 1);
  assert.equal(detectHeat("西红柿洗净切块"), 0);
  assert.equal(detectIcon("鸡蛋打入碗中"), "egg");
  assert.equal(detectIcon("热锅倒油"), "oil");
  assert.equal(detectIcon("关火装盘"), "dish");
});

test("HowToCook markdown becomes a complete offline recipe", () => {
  const recipe = extractLocalRecipe(fixture("tomato-eggs.md"), context);
  assert.match(recipe.title.zh, /西红柿炒鸡蛋/);
  assert.ok(recipe.ingredients.length >= 4);
  assert.ok(recipe.ingredients.some((item) => item.name.zh.includes("西红柿")));
  assert.ok(recipe.ingredients.some((item) => item.name.zh.includes("鸡蛋")));
  assert.ok(recipe.cookware.length >= 1);
  assert.ok(recipe.steps.length >= 4);
  assert.ok(recipe.steps.some((step) => step.timers.some((timer) => timer.durationSeconds === 20)));
  assert.equal(recipe.source.provider, "HowToCook");
  assert.equal(recipe.source.extractedBy, "local");
  assert.ok(recipe.totalMinutes >= 5);
});

test("long braised recipes expose several independent timers", () => {
  const recipe = extractLocalRecipe(fixture("cola-wings.md"), {
    ...context,
    titleHint: "可乐鸡翅",
    pageUrl: "https://howtocook.aiursoft.com/Recipes/Detail/170",
  });
  const durations = recipe.steps.flatMap((step) =>
    step.timers.map((timer) => timer.durationSeconds),
  );
  assert.ok(durations.includes(120));
  assert.ok(durations.includes(600));
  assert.ok(recipe.ingredients.some((item) => item.name.zh.includes("鸡翅")));
});

test("potato recipe keeps its short blanching timer", () => {
  const recipe = extractLocalRecipe(fixture("hot-sour-potato.md"), {
    ...context,
    titleHint: "酸辣土豆丝",
    pageUrl: "https://howtocook.aiursoft.com/Recipes/Detail/29",
  });
  const durations = recipe.steps.flatMap((step) =>
    step.timers.map((timer) => timer.durationSeconds),
  );
  assert.ok(durations.includes(10));
  assert.ok(
    recipe.cookware.some((item) => item.name.zh.includes("刀") || item.name.zh.includes("锅")),
  );
});

test("visible detail-page text can be reconstructed when markdown is unavailable", () => {
  const pageText = fixture("detail-page.txt");
  const markdown = pageTextToMarkdown(pageText, "西红柿炒鸡蛋");
  assert.match(markdown, /## 必备原料和工具/);
  assert.match(markdown, /## 操作/);
  const recipe = extractLocalRecipe(pageText, { ...context, fromPageText: true });
  assert.match(recipe.title.zh, /西红柿炒鸡蛋/);
  assert.ok(recipe.steps.length >= 3);
});

test("too-short input is rejected as an invalid recipe", () => {
  assert.throws(() => extractLocalRecipe("太短了", context));
});

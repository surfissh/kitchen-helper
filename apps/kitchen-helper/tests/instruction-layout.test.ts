import assert from "node:assert/strict";
import { test } from "node:test";

import {
  countWrappedLines,
  fitTextBlock,
  layoutInstruction,
  lineHeightFor,
  wrapLines,
} from "../app-src/ui/instruction-layout.ts";

const INSTRUCTION_BOX = { width: 552, height: 140 };
const SIZES = [38, 34, 30, 27, 24, 22] as const;

function layout(text: string) {
  return layoutInstruction(text, { ...INSTRUCTION_BOX, sizes: SIZES, maxPages: 3 });
}

function maxLinesPerPage(size: number): number {
  return Math.floor(INSTRUCTION_BOX.height / lineHeightFor(size));
}

test("line advance matches the simulator's rendered font metrics", () => {
  // Measured from rendered frames: 38 px text advances 63 px with an 8 px line space.
  assert.equal(lineHeightFor(38), 63);
  assert.equal(lineHeightFor(16), Math.round(16 * 1.45) + 4);
});

test("Latin words and numbers are never split across lines", () => {
  const lines = wrapLines("补足约 100g 热水，盖盖转中小火焖约 2 分钟。", 30, 200);
  for (const line of lines) {
    assert.equal(/^\d/.test(line), false, `line starts inside a number: ${line}`);
  }
  assert.match(lines.join("|"), /100g/);
});

test("closing CJK punctuation does not start a display line", () => {
  const lines = wrapLines("番茄洗净切块，鸡蛋打散备用。", 38, 300);
  for (const line of lines) {
    assert.equal(/^[，。；：、！？]/u.test(line), false, `punctuation starts a line: ${line}`);
  }
});

test("a short instruction is shown at the largest size on one page", () => {
  const result = layout("番茄洗净切块，鸡蛋打散备用。");
  assert.equal(result.size, 38);
  assert.equal(result.pages.length, 1);
  assert.equal(result.truncated, false);
  assert.equal(countWrappedLines(result.pages[0] ?? "", result.size, INSTRUCTION_BOX.width), 1);
});

test("a longer instruction shrinks instead of overflowing the box", () => {
  const text = "下葱粒翻炒，加入剩余葱姜水补足约 100g 热水，盖盖转中小火焖约 2 分钟。";
  const result = layout(text);
  assert.equal(result.pages.length, 1);
  assert.equal(result.truncated, false);
  assert.ok(result.size < 38);
  const lines = countWrappedLines(result.pages[0] ?? "", result.size, INSTRUCTION_BOX.width);
  assert.ok(
    lines * lineHeightFor(result.size) <= INSTRUCTION_BOX.height,
    `layout overflows: ${lines} lines at ${result.size} px`,
  );
});

test("a very long instruction paginates within the pager's three pages", () => {
  const text =
    "热锅倒油，油温六成热时倒入打散的蛋液，快速划散炒至刚刚凝固就立刻盛出备用；锅里留少许底油，下番茄块中火翻炒，用铲子按压让番茄出汁，炒到汤汁浓稠时加盐和糖调味即可。";
  const result = layout(text);
  assert.ok(result.pages.length >= 2);
  assert.ok(result.pages.length <= 3);
  for (const page of result.pages) {
    const lines = countWrappedLines(page, result.size, INSTRUCTION_BOX.width);
    assert.ok(lines <= maxLinesPerPage(result.size));
    assert.ok(lines * lineHeightFor(result.size) <= INSTRUCTION_BOX.height);
  }
  assert.equal(
    result.pages.join("\n").replace(/\n/gu, ""),
    text.replace(/\s/gu, "").replace(/\n/gu, ""),
  );
});

test("an extreme instruction is truncated with an ellipsis", () => {
  const text = "这是一段极端冗长的说明文字，".repeat(20);
  const result = layout(text);
  assert.equal(result.truncated, true);
  assert.equal(result.pages.length, 3);
  assert.match(result.pages[result.pages.length - 1] ?? "", /…$/u);
});

test("empty instructions stay empty", () => {
  const result = layout("   ");
  assert.deepEqual(result.pages, [""]);
  assert.equal(result.truncated, false);
});

test("fitTextBlock shrinks and truncates a tip line", () => {
  const longTip =
    "小贴士 · 务必加热水，冷水会使鸡肉变柴；如果中途需要补水，也只能加开水，并且沿着锅边慢慢倒入，避免温度骤降。";
  const fitted = fitTextBlock(longTip, { width: 510, height: 40, sizes: [16, 13, 12] });
  assert.ok(fitted.size <= 16);
  assert.equal(fitted.truncated || fitted.text.includes("\n"), true);
  const lines = countWrappedLines(fitted.text, fitted.size, 510);
  assert.ok(lines * lineHeightFor(fitted.size) <= 40);
});

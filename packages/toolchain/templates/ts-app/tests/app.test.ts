import assert from "node:assert/strict";
import { test } from "node:test";
import { formatElapsed, launchLabel, subtitle } from "../app-src/app.ts";

test("formatElapsed pads minutes and seconds", () => {
  assert.equal(formatElapsed(0), "00:00");
  assert.equal(formatElapsed(9), "00:09");
  assert.equal(formatElapsed(61), "01:01");
  assert.equal(formatElapsed(-5), "00:00");
});

test("launchLabel respects the display language", () => {
  assert.equal(launchLabel(3, "en"), "Launch 3");
  assert.equal(launchLabel(3, "zh"), "第 3 次启动");
});

test("subtitle is localized", () => {
  assert.ok(subtitle("zh").length > 0);
  assert.ok(subtitle("en").length > 0);
});

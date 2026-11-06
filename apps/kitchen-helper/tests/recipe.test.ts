import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CYCLE_REST_MS,
  RECIPE_STEPS,
  formatCountdown,
  initialState,
  progressRatio,
  remainingMs,
  skip,
  tick,
} from "../app-src/recipe.ts";

test("initial state starts at the first step", () => {
  const state = initialState();
  assert.equal(state.stepIndex, 0);
  assert.equal(state.elapsedMs, 0);
  assert.equal(state.completed, false);
  assert.equal(state.cycles, 0);
});

test("tick advances within a step and resets elapsed when crossing steps", () => {
  const first = tick(initialState(), 3_000);
  assert.equal(first.state.stepIndex, 0);
  assert.equal(first.state.elapsedMs, 3_000);
  assert.equal(first.stepChanged, false);

  const second = tick(initialState(), RECIPE_STEPS[0]!.durationMs + 1_000);
  assert.equal(second.state.stepIndex, 1);
  assert.equal(second.state.elapsedMs, 1_000);
  assert.equal(second.stepChanged, true);
});

test("a large delta can cross several steps and finish the cycle", () => {
  const total = RECIPE_STEPS.reduce((sum, step) => sum + step.durationMs, 0);
  const result = tick(initialState(2), total + 10);
  assert.equal(result.state.completed, true);
  assert.equal(result.cycleCompleted, true);
  assert.equal(result.state.cycles, 2);
  assert.equal(result.stepChanged, true);
});

test("after the rest pause the next cycle starts with an incremented counter", () => {
  const total = RECIPE_STEPS.reduce((sum, step) => sum + step.durationMs, 0);
  const completed = tick(initialState(0), total);
  const rested = tick(completed.state, CYCLE_REST_MS);
  assert.equal(rested.state.completed, false);
  assert.equal(rested.state.stepIndex, 0);
  assert.equal(rested.state.cycles, 1);
});

test("skip wraps in both directions and clears progress", () => {
  const skipped = skip(initialState(), -1);
  assert.equal(skipped.stepIndex, RECIPE_STEPS.length - 1);
  assert.equal(skipped.elapsedMs, 0);
  assert.equal(skip(initialState(), 1).stepIndex, 1);
});

test("countdown and progress helpers stay in range", () => {
  assert.equal(formatCountdown(0), "0:00");
  assert.equal(formatCountdown(9_400), "0:10");
  assert.equal(formatCountdown(-5), "0:00");
  const state = { ...initialState(), elapsedMs: 4_000 };
  assert.equal(remainingMs(state), RECIPE_STEPS[0]!.durationMs - 4_000);
  assert.ok(progressRatio(state) > 0 && progressRatio(state) < 1);
});

import assert from "node:assert/strict";
import { test } from "node:test";

import { findOfflineRecipe } from "../app-src/recipe/recommended.ts";
import {
  assistantAnswered,
  createInitialState,
  currentStep,
  forceError,
  handleAction,
  handleTextInput,
  loadingSucceeded,
  parseTextInput,
  prepCounts,
  tick,
  visiblePrepItems,
  visibleTimers,
} from "../app-src/model/state.ts";
import type { AppState, Recipe } from "../app-src/model/types.ts";

const tomato = findOfflineRecipe("番茄炒蛋") as Recipe;
const wings = findOfflineRecipe("可乐鸡翅") as Recipe;

/** Advance the deterministic clock in the reducer's maximum safe increments. */
function advance(state: AppState, milliseconds: number): AppState {
  let remaining = milliseconds;
  let next = state;
  while (remaining > 0) {
    const step = Math.min(5_000, remaining);
    next = tick(next, step);
    remaining -= step;
  }
  return next;
}

function toLoading(query: string): AppState {
  let state = createInitialState("zh");
  state = handleAction(state, "activate").state;
  assert.equal(state.screen, "listening");
  return handleTextInput(state, query).state;
}

function enterPrep(recipe: Recipe): AppState {
  let state = toLoading(recipe.title.zh);
  assert.equal(state.screen, "loading");
  const requestId = state.loading?.requestId ?? 0;
  state = loadingSucceeded(state, requestId, recipe);
  assert.equal(state.screen, "recipe");
  state = handleAction(state, "activate").state;
  assert.equal(state.screen, "prep");
  return state;
}

function clearPrep(recipe: Recipe): AppState {
  let state = enterPrep(recipe);
  let guard = 0;
  while (state.screen === "prep" && !state.prep?.ready && guard < 30) {
    state = handleAction(state, "activate").state;
    guard += 1;
  }
  assert.equal(state.prep?.ready, true);
  return state;
}

function enterCooking(recipe: Recipe): AppState {
  let state = clearPrep(recipe);
  state = handleAction(state, "activate").state;
  assert.equal(state.screen, "cooking");
  return state;
}

test("home confirm opens simulated listening, text starts the loader", () => {
  const home = createInitialState("zh");
  assert.equal(home.screen, "home");
  const listening = handleAction(home, "activate");
  assert.equal(listening.state.screen, "listening");
  assert.equal(listening.effects.length, 0);

  const loading = handleTextInput(listening.state, "番茄炒蛋");
  assert.equal(loading.state.screen, "loading");
  assert.equal(loading.effects[0]?.type, "load-recipe");
  if (loading.effects[0]?.type === "load-recipe") {
    assert.equal(loading.effects[0].query, "番茄炒蛋");
    assert.equal(loading.effects[0].requestId, loading.state.loading?.requestId);
  }
});

test("typing a dish directly on the home screen also starts the loader", () => {
  const loading = handleTextInput(createInitialState("zh"), "可乐鸡翅");
  assert.equal(loading.state.screen, "loading");
  assert.equal(loading.state.loading?.query, "可乐鸡翅");
});

test("loading progress and success move to the recipe summary", () => {
  let state = toLoading("番茄炒蛋");
  const requestId = state.loading?.requestId ?? 0;
  state = loadingSucceeded(state, requestId, tomato);
  assert.equal(state.screen, "recipe");
  assert.equal(state.recipe?.title.zh, "番茄炒蛋");
  assert.equal(state.loading, null);
});

test("stale loading results are ignored", () => {
  const state = toLoading("番茄炒蛋");
  const requestId = state.loading?.requestId ?? 0;
  const stale = loadingSucceeded(state, requestId + 1, tomato);
  assert.equal(stale.screen, "loading");
});

test("prep removes cards, advances focus automatically and becomes ready", () => {
  let state = enterPrep(tomato);
  const first = visiblePrepItems(state, "ingredients")[0];
  assert.ok(first);
  const total = prepCounts(state).total;
  assert.equal(prepCounts(state).done, 0);

  const removed = handleAction(state, "activate").state;
  assert.equal(prepCounts(removed).done, 1);
  assert.equal(
    visiblePrepItems(removed, "ingredients").some((item) => item.id === first.id),
    false,
  );
  assert.equal(removed.prep?.focusIndex, 0);
  assert.equal(prepCounts(removed).total, total);

  state = clearPrep(tomato);
  assert.equal(state.prep?.ready, true);
  assert.equal(prepCounts(state).done, total);
});

test("prep focus cycles rows and confirms into cooking when ready", () => {
  let state = clearPrep(tomato);
  state = handleAction(state, "activate").state;
  assert.equal(state.screen, "cooking");
  assert.equal(state.cooking?.stepIndex, 0);
});

test("cooking confirm starts the step timer before advancing", () => {
  let state = enterCooking(wings);
  assert.equal(currentStep(state)?.timers.length, 1);
  state = handleAction(state, "activate").state;
  assert.equal(state.cooking?.stepIndex, 0);
  const timer = state.cooking?.timers.find((candidate) => candidate.stepIndex === 0);
  assert.equal(timer?.status, "running");
  state = handleAction(state, "activate").state;
  assert.equal(state.cooking?.stepIndex, 1);
});

test("timers keep running across steps and stack vertically", () => {
  let state = enterCooking(wings);
  state = handleAction(state, "activate").state; // start blanch timer
  state = handleAction(state, "left").state; // next step
  state = handleAction(state, "activate").state; // start marinate timer
  state = handleAction(state, "left").state; // next step
  assert.equal(state.cooking?.stepIndex, 2);
  assert.equal(visibleTimers(state).length, 2);

  state = advance(state, 121_000);
  const blanch = state.cooking?.timers.find((candidate) => candidate.stepIndex === 0);
  const marinate = state.cooking?.timers.find((candidate) => candidate.stepIndex === 1);
  assert.equal(blanch?.status, "done");
  assert.equal(marinate?.status, "running");
  assert.equal(marinate?.remainingMs, 600_000 - 121_000);
});

test("left/right navigate steps and up/down scroll within the step", () => {
  let state = enterCooking(tomato);
  assert.equal(state.cooking?.scrollPage, 0);
  state = handleAction(state, "down").state;
  assert.equal(state.cooking?.scrollPage, 1);
  state = handleAction(state, "down").state;
  state = handleAction(state, "down").state;
  assert.equal(state.cooking?.scrollPage, 2);
  state = handleAction(state, "up").state;
  assert.equal(state.cooking?.scrollPage, 1);

  state = handleAction(state, "left").state;
  assert.equal(state.cooking?.stepIndex, 1);
  state = handleAction(state, "right").state;
  assert.equal(state.cooking?.stepIndex, 0);
  assert.equal(state.cooking?.scrollPage, 0);
});

test("voice question opens the assistant modal and confirm closes it", () => {
  let state = enterCooking(tomato);
  const asked = handleTextInput(state, "切菜有什么技巧");
  assert.equal(asked.effects[0]?.type, "ask-assistant");
  assert.equal(asked.state.cooking?.modal?.status, "thinking");
  const modalId = asked.state.cooking?.modal?.id ?? 0;
  state = assistantAnswered(asked.state, modalId, { zh: "稳住刀", en: "Keep steady" });
  assert.equal(state.cooking?.modal?.status, "answered");
  assert.equal(state.cooking?.modal?.answer.zh, "稳住刀");
  state = handleAction(state, "activate").state;
  assert.equal(state.cooking?.modal, null);
});

test("timers tick down and mark themselves done", () => {
  let state = enterCooking(tomato);
  // Advance to the 20 s tomato stir-fry step (index 3).
  state = handleAction(state, "left").state;
  state = handleAction(state, "left").state;
  state = handleAction(state, "left").state;
  assert.equal(state.cooking?.stepIndex, 3);
  state = handleAction(state, "activate").state;
  const timer = state.cooking?.timers.find((candidate) => candidate.stepIndex === 3);
  assert.equal(timer?.status, "running");
  state = advance(state, 20_000);
  const done = state.cooking?.timers.find((candidate) => candidate.stepIndex === 3);
  assert.equal(done?.status, "done");
  assert.equal(done?.remainingMs, 0);
});

test("finishing the last step reaches the celebration screen and persists", () => {
  let state = enterCooking(tomato);
  let guard = 0;
  while (state.screen === "cooking" && guard < 40) {
    state = handleAction(state, "activate").state;
    guard += 1;
  }
  assert.equal(state.screen, "done");
  assert.equal(state.home.completedCount, 1);
  assert.ok(state.recipe);
  const back = handleAction(state, "activate").state;
  assert.equal(back.screen, "home");
});

test("typing * forces the error screen and retry returns to loading", () => {
  const home = createInitialState("zh");
  const forced = handleTextInput(home, "*");
  assert.equal(forced.state.screen, "error");
  assert.equal(forced.state.error?.error.code, "forced");
  assert.equal(forced.state.error?.error.canRetry, false);

  const back = handleAction(forced.state, "back").state;
  assert.equal(back.screen, "home");

  const loading = toLoading("番茄炒蛋");
  const forcedDuringLoad = forceError(loading);
  assert.equal(forcedDuringLoad.state.error?.error.code, "forced");
  assert.equal(forcedDuringLoad.state.error?.error.canRetry, true);
  const retry = handleAction(forcedDuringLoad.state, "activate");
  assert.equal(retry.state.screen, "loading");
  assert.equal(retry.effects[0]?.type, "load-recipe");
});

test("text command parsing maps confirm, directions and *", () => {
  assert.deepEqual(parseTextInput("确认"), { kind: "action", action: "activate" });
  assert.deepEqual(parseTextInput("确定"), { kind: "action", action: "activate" });
  assert.deepEqual(parseTextInput("上"), { kind: "action", action: "up" });
  assert.deepEqual(parseTextInput("left"), { kind: "action", action: "left" });
  assert.deepEqual(parseTextInput("返回"), { kind: "action", action: "back" });
  assert.deepEqual(parseTextInput("  *  "), { kind: "force-error" });
  assert.deepEqual(parseTextInput("番茄炒蛋"), { kind: "text", text: "番茄炒蛋" });
});

test("home carousel advances with the clock", () => {
  const state = tick(createInitialState("zh"), 5_100);
  assert.equal(state.home.carouselIndex, 1);
});

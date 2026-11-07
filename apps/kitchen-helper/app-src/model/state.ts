/**
 * Pure application reducer.
 *
 * The reducer owns every screen transition, countdown and focus decision. It
 * never touches FusionUI, timers or the network: the controller feeds it
 * navigation actions, text input, async pipeline results and clock deltas, and
 * executes the returned {@link Effect}s. This keeps the whole flow testable in
 * plain Node.js.
 */

import { RECOMMENDED_RECIPES, findOfflineRecipe } from "../recipe/recommended.ts";
import { formatStars, pick } from "./i18n.ts";
import type {
  AppError,
  AppState,
  AssistantModal,
  CookingState,
  DoneState,
  Effect,
  ErrorCode,
  FocusRow,
  InputAction,
  LoadingPhase,
  Localized,
  ParsedInput,
  PrepItem,
  PrepState,
  Recipe,
  RecipeStep,
  RecommendedRecipe,
  StepTimerSpec,
  TimerState,
  UiLanguage,
} from "./types.ts";

export interface InitialOptions {
  readonly completedCount?: number;
  readonly lastDish?: Localized | null;
}

export interface Transition {
  readonly state: AppState;
  readonly effects: readonly Effect[];
}

const EMPTY_EFFECTS: readonly Effect[] = [];
const CAROUSEL_INTERVAL_MS = 5_000;

function l(zh: string, en: string): Localized {
  return { zh, en };
}

export function recommended(): readonly RecommendedRecipe[] {
  return RECOMMENDED_RECIPES;
}

export function createInitialState(language: UiLanguage, options: InitialOptions = {}): AppState {
  return {
    screen: "home",
    language,
    clockMs: 0,
    home: {
      completedCount: Math.max(0, Math.floor(options.completedCount ?? 0)),
      lastDish: options.lastDish ?? null,
      carouselIndex: 0,
      carouselAtMs: 0,
    },
    listeningStartedAtMs: 0,
    loading: null,
    recipe: null,
    prep: null,
    cooking: null,
    done: null,
    error: null,
    effectSerial: 0,
  };
}

/** Normalize a raw simulator text submission into a command or free text. */
export function parseTextInput(raw: string): ParsedInput {
  const text = raw.trim();
  if (text === "*") return { kind: "force-error" };
  const key = text.toLowerCase();
  const actions: Record<string, InputAction> = {
    confirm: "activate",
    ok: "activate",
    okay: "activate",
    enter: "activate",
    tap: "activate",
    start: "activate",
    next: "activate",
    确定: "activate",
    确认: "activate",
    开始: "activate",
    好的: "activate",
    好: "activate",
    是的: "activate",
    点按: "activate",
    up: "up",
    down: "down",
    left: "left",
    right: "right",
    上: "up",
    下: "down",
    左: "left",
    右: "right",
    向上: "up",
    向下: "down",
    向左: "left",
    向右: "right",
    back: "back",
    escape: "back",
    cancel: "back",
    返回: "back",
    退出: "back",
    重试: "activate",
    retry: "activate",
    previous: "right",
    prev: "right",
    上一页: "right",
    上一步: "right",
  };
  const action = actions[key];
  if (action) return { kind: "action", action };
  if (text.length === 0) return { kind: "text", text: "" };
  return { kind: "text", text };
}

export function currentRecipe(state: AppState): Recipe | null {
  return state.recipe;
}

export function currentStep(state: AppState): RecipeStep | null {
  if (!state.recipe || !state.cooking) return null;
  return state.recipe.steps[state.cooking.stepIndex] ?? null;
}

export function currentRecommended(state: AppState): RecommendedRecipe {
  return RECOMMENDED_RECIPES[
    state.home.carouselIndex % RECOMMENDED_RECIPES.length
  ] as RecommendedRecipe;
}

export function visiblePrepItems(state: AppState, row: FocusRow): readonly PrepItem[] {
  if (!state.prep) return [];
  const source = row === "ingredients" ? state.prep.ingredients : state.prep.cookware;
  return source.filter((item) => !state.prep!.removedIds.includes(item.id));
}

export function focusedPrepItem(state: AppState): PrepItem | null {
  if (!state.prep) return null;
  const items = visiblePrepItems(state, state.prep.focusRow);
  return items[state.prep.focusIndex] ?? null;
}

export function prepCounts(state: AppState): { done: number; total: number } {
  if (!state.prep) return { done: 0, total: 0 };
  return {
    done: state.prep.removedIds.length,
    total: state.prep.ingredients.length + state.prep.cookware.length,
  };
}

/** Timers that should be visible on the cooking screen: every started timer plus idle timers of the current step. */
export function visibleTimers(state: AppState): readonly TimerState[] {
  if (!state.cooking) return [];
  const current = state.cooking.stepIndex;
  return state.cooking.timers.filter(
    (timer) => timer.status !== "idle" || timer.stepIndex === current,
  );
}

export function currentStepHasIdleTimer(state: AppState): boolean {
  if (!state.cooking) return false;
  return state.cooking.timers.some(
    (timer) => timer.stepIndex === state.cooking!.stepIndex && timer.status === "idle",
  );
}

export function formatDifficulty(difficulty: number): string {
  return formatStars(difficulty);
}

function nextSerial(state: AppState): number {
  return state.effectSerial + 1;
}

function buildPrep(recipe: Recipe): PrepState {
  const focusRow: FocusRow = recipe.ingredients.length > 0 ? "ingredients" : "cookware";
  return {
    ingredients: recipe.ingredients,
    cookware: recipe.cookware,
    removedIds: [],
    focusRow,
    focusIndex: 0,
    ready: recipe.ingredients.length + recipe.cookware.length === 0,
    readyAtMs: null,
    lastRemovedId: null,
    lastRemovedAtMs: -1,
  };
}

function timersForRecipe(recipe: Recipe): TimerState[] {
  const timers: TimerState[] = [];
  recipe.steps.forEach((step, stepIndex) => {
    step.timers.forEach((timer: StepTimerSpec) => {
      timers.push({
        id: `${stepIndex}:${timer.id}`,
        stepIndex,
        label: timer.label,
        totalMs: Math.max(1_000, Math.round(timer.durationSeconds * 1000)),
        remainingMs: Math.max(1_000, Math.round(timer.durationSeconds * 1000)),
        status: "idle",
        doneAtMs: null,
      });
    });
  });
  return timers;
}

function beginLoading(state: AppState, query: string): Transition {
  const requestId = nextSerial(state);
  return {
    state: {
      ...state,
      screen: "loading",
      effectSerial: requestId,
      loading: {
        query,
        phase: "search",
        requestId,
        startedAtMs: state.clockMs,
        detail: l("正在连接 HowToCook", "Connecting to HowToCook"),
      },
      error: null,
    },
    effects: [{ type: "load-recipe", query, requestId }],
  };
}

function beginListening(state: AppState): Transition {
  return {
    state: {
      ...state,
      screen: "listening",
      listeningStartedAtMs: state.clockMs,
    },
    effects: EMPTY_EFFECTS,
  };
}

function goHome(state: AppState): Transition {
  return {
    state: {
      ...state,
      screen: "home",
      loading: null,
      recipe: null,
      prep: null,
      cooking: null,
      done: null,
      error: null,
      listeningStartedAtMs: 0,
    },
    effects: EMPTY_EFFECTS,
  };
}

function startCooking(state: AppState): Transition {
  const recipe = state.recipe;
  if (!recipe) return { state, effects: EMPTY_EFFECTS };
  const cooking: CookingState = {
    stepIndex: 0,
    scrollPage: 0,
    timers: timersForRecipe(recipe),
    modal: null,
    stepEnteredAtMs: state.clockMs,
    startedAtMs: state.clockMs,
  };
  return {
    state: { ...state, screen: "cooking", cooking },
    effects: EMPTY_EFFECTS,
  };
}

function finishCooking(state: AppState): Transition {
  const recipe = state.recipe;
  if (!recipe || !state.cooking) return { state, effects: EMPTY_EFFECTS };
  const cookingMs = Math.max(0, state.clockMs - (state.cooking.startedAtMs ?? state.clockMs));
  const done: DoneState = {
    finishedAtMs: state.clockMs,
    cookingMs,
    confettiSeed: (recipe.steps.length * 37 + recipe.title.zh.length * 11) % 997,
  };
  return {
    state: {
      ...state,
      screen: "done",
      cooking: null,
      done,
      home: {
        ...state.home,
        completedCount: state.home.completedCount + 1,
        lastDish: recipe.title,
        carouselIndex: 0,
        carouselAtMs: state.clockMs,
      },
    },
    effects: [{ type: "persist-completion", recipeTitle: recipe.title }],
  };
}

function startCurrentStepTimers(state: AppState): Transition {
  if (!state.cooking) return { state, effects: EMPTY_EFFECTS };
  const stepIndex = state.cooking.stepIndex;
  const hasIdle = state.cooking.timers.some(
    (timer) => timer.stepIndex === stepIndex && timer.status === "idle",
  );
  if (!hasIdle) return { state, effects: EMPTY_EFFECTS };
  return {
    state: {
      ...state,
      cooking: {
        ...state.cooking,
        timers: state.cooking.timers.map((timer) =>
          timer.stepIndex === stepIndex && timer.status === "idle"
            ? { ...timer, status: "running" as const, remainingMs: timer.totalMs, doneAtMs: null }
            : timer,
        ),
      },
    },
    effects: EMPTY_EFFECTS,
  };
}

function nextStep(state: AppState): Transition {
  if (!state.recipe || !state.cooking) return { state, effects: EMPTY_EFFECTS };
  const nextIndex = state.cooking.stepIndex + 1;
  if (nextIndex >= state.recipe.steps.length) return finishCooking(state);
  return {
    state: {
      ...state,
      cooking: {
        ...state.cooking,
        stepIndex: nextIndex,
        scrollPage: 0,
        stepEnteredAtMs: state.clockMs,
        modal: null,
      },
    },
    effects: EMPTY_EFFECTS,
  };
}

function previousStep(state: AppState): Transition {
  if (!state.cooking) return { state, effects: EMPTY_EFFECTS };
  const previousIndex = Math.max(0, state.cooking.stepIndex - 1);
  if (previousIndex === state.cooking.stepIndex) return { state, effects: EMPTY_EFFECTS };
  return {
    state: {
      ...state,
      cooking: {
        ...state.cooking,
        stepIndex: previousIndex,
        scrollPage: 0,
        stepEnteredAtMs: state.clockMs,
      },
    },
    effects: EMPTY_EFFECTS,
  };
}

function scrollStep(state: AppState, direction: 1 | -1): Transition {
  if (!state.cooking) return { state, effects: EMPTY_EFFECTS };
  const page = Math.max(0, Math.min(2, state.cooking.scrollPage + direction));
  if (page === state.cooking.scrollPage) return { state, effects: EMPTY_EFFECTS };
  return {
    state: { ...state, cooking: { ...state.cooking, scrollPage: page } },
    effects: EMPTY_EFFECTS,
  };
}

function askAssistant(state: AppState, question: string): Transition {
  const recipe = state.recipe;
  const step = currentStep(state);
  if (!recipe || !step || !state.cooking) return { state, effects: EMPTY_EFFECTS };
  const requestId = nextSerial(state);
  const modal: AssistantModal = {
    id: requestId,
    question,
    status: "thinking",
    answer: { zh: "", en: "" },
    createdAtMs: state.clockMs,
  };
  return {
    state: {
      ...state,
      effectSerial: requestId,
      cooking: { ...state.cooking, modal },
    },
    effects: [{ type: "ask-assistant", question, requestId, recipe, step }],
  };
}

function closeModal(state: AppState): Transition {
  if (!state.cooking?.modal) return { state, effects: EMPTY_EFFECTS };
  return {
    state: { ...state, cooking: { ...state.cooking, modal: null } },
    effects: EMPTY_EFFECTS,
  };
}

function removeFocusedPrepItem(state: AppState): Transition {
  if (!state.prep) return { state, effects: EMPTY_EFFECTS };
  const prep = state.prep;
  const row = prep.focusRow;
  const visible = visiblePrepItems(state, row);
  const item = visible[prep.focusIndex];
  if (!item) {
    if (prep.ready) return startCooking(state);
    return { state, effects: EMPTY_EFFECTS };
  }
  const removedIds = [...prep.removedIds, item.id];
  const remaining = visible.filter((candidate) => candidate.id !== item.id);
  const otherRow: FocusRow = row === "ingredients" ? "cookware" : "ingredients";
  const other = visiblePrepItems(state, otherRow);
  const ready = removedIds.length >= prep.ingredients.length + prep.cookware.length;
  let focusRow: FocusRow = row;
  let focusIndex = Math.min(prep.focusIndex, Math.max(0, remaining.length - 1));
  if (remaining.length === 0 && other.length > 0) {
    focusRow = otherRow;
    focusIndex = 0;
  }
  return {
    state: {
      ...state,
      prep: {
        ...prep,
        removedIds,
        focusRow,
        focusIndex,
        ready,
        readyAtMs: ready ? state.clockMs : prep.readyAtMs,
        lastRemovedId: item.id,
        lastRemovedAtMs: state.clockMs,
      },
    },
    effects: EMPTY_EFFECTS,
  };
}

function prepAction(state: AppState, action: InputAction): Transition {
  if (!state.prep) return { state, effects: EMPTY_EFFECTS };
  if (action === "activate") return removeFocusedPrepItem(state);
  if (action === "back") {
    return {
      state: { ...state, screen: "recipe", prep: null },
      effects: EMPTY_EFFECTS,
    };
  }
  const prep = state.prep;
  if (action === "up" || action === "down") {
    const ingredientCount = visiblePrepItems(state, "ingredients").length;
    const cookwareCount = visiblePrepItems(state, "cookware").length;
    if (ingredientCount === 0 || cookwareCount === 0) return { state, effects: EMPTY_EFFECTS };
    const target: FocusRow = action === "up" ? "ingredients" : "cookware";
    if (target === prep.focusRow) return { state, effects: EMPTY_EFFECTS };
    return {
      state: {
        ...state,
        prep: {
          ...prep,
          focusRow: target,
          focusIndex: Math.min(prep.focusIndex, visiblePrepItems(state, target).length - 1),
        },
      },
      effects: EMPTY_EFFECTS,
    };
  }
  const direction = action === "left" ? -1 : 1;
  const count = visiblePrepItems(state, prep.focusRow).length;
  if (count === 0) return { state, effects: EMPTY_EFFECTS };
  const focusIndex = Math.max(0, Math.min(count - 1, prep.focusIndex + direction));
  if (focusIndex === prep.focusIndex) return { state, effects: EMPTY_EFFECTS };
  return {
    state: { ...state, prep: { ...prep, focusIndex } },
    effects: EMPTY_EFFECTS,
  };
}

function cookingAction(state: AppState, action: InputAction): Transition {
  if (!state.cooking) return { state, effects: EMPTY_EFFECTS };
  if (state.cooking.modal) {
    if (action === "activate" || action === "back") return closeModal(state);
    return { state, effects: EMPTY_EFFECTS };
  }
  switch (action) {
    case "up":
      return scrollStep(state, -1);
    case "down":
      return scrollStep(state, 1);
    case "left":
      return nextStep(state);
    case "right":
      return previousStep(state);
    case "activate":
      if (currentStepHasIdleTimer(state)) return startCurrentStepTimers(state);
      return nextStep(state);
    case "back":
      return {
        state: { ...state, screen: "recipe", cooking: null, prep: null },
        effects: EMPTY_EFFECTS,
      };
  }
}

function errorAction(state: AppState, action: InputAction): Transition {
  if (!state.error) return { state, effects: EMPTY_EFFECTS };
  if (action === "back") return goHome(state);
  if (action === "activate" && state.error.error.canRetry && state.error.query) {
    return beginLoading(state, state.error.query);
  }
  return { state, effects: EMPTY_EFFECTS };
}

export function handleAction(state: AppState, action: InputAction): Transition {
  switch (state.screen) {
    case "home":
      if (action === "activate") return beginListening(state);
      if (action === "left") {
        const index =
          (state.home.carouselIndex - 1 + RECOMMENDED_RECIPES.length) % RECOMMENDED_RECIPES.length;
        return {
          state: {
            ...state,
            home: { ...state.home, carouselIndex: index, carouselAtMs: state.clockMs },
          },
          effects: EMPTY_EFFECTS,
        };
      }
      if (action === "right") {
        const index = (state.home.carouselIndex + 1) % RECOMMENDED_RECIPES.length;
        return {
          state: {
            ...state,
            home: { ...state.home, carouselIndex: index, carouselAtMs: state.clockMs },
          },
          effects: EMPTY_EFFECTS,
        };
      }
      return { state, effects: EMPTY_EFFECTS };
    case "listening":
      if (action === "back") return goHome(state);
      return { state, effects: EMPTY_EFFECTS };
    case "loading":
      if (action === "back") return goHome(state);
      return { state, effects: EMPTY_EFFECTS };
    case "recipe":
      if (action === "activate") {
        if (!state.recipe) return goHome(state);
        return {
          state: { ...state, screen: "prep", prep: buildPrep(state.recipe) },
          effects: EMPTY_EFFECTS,
        };
      }
      if (action === "back") return goHome(state);
      return { state, effects: EMPTY_EFFECTS };
    case "prep":
      return prepAction(state, action);
    case "cooking":
      return cookingAction(state, action);
    case "done":
      if (action === "activate" || action === "back") return goHome(state);
      return { state, effects: EMPTY_EFFECTS };
    case "error":
      return errorAction(state, action);
  }
}

export function handleTextInput(state: AppState, raw: string): Transition {
  const parsed = parseTextInput(raw);
  if (parsed.kind === "force-error") return forceError(state);
  if (parsed.kind === "action") return handleAction(state, parsed.action);
  const text = parsed.text;
  if (text.length === 0) return { state, effects: EMPTY_EFFECTS };
  switch (state.screen) {
    case "home":
    case "listening":
      return beginLoading(state, text);
    case "cooking":
      return askAssistant(state, text);
    case "error":
      return errorAction(state, "activate");
    default:
      return { state, effects: EMPTY_EFFECTS };
  }
}

export function forceError(state: AppState): Transition {
  const query = state.loading?.query ?? "";
  const error: AppError = {
    code: "forced",
    title: l("强制异常测试", "Forced error test"),
    message: l(
      "已触发强制异常测试（*）。这是用于验证异常界面的入口。",
      "Forced error test triggered (*). This entry verifies the error screen.",
    ),
    detail: `forced-error:${query || "(no query)"}`,
    canRetry: query.length > 0,
  };
  return {
    state: {
      ...state,
      screen: "error",
      error: { error, query },
      loading: null,
    },
    effects: EMPTY_EFFECTS,
  };
}

/** Driver callbacks used by the controller when the async pipeline reports progress. */
export function loadingProgress(
  state: AppState,
  requestId: number,
  phase: LoadingPhase,
  detail: Localized,
): AppState {
  if (state.screen !== "loading" || !state.loading || state.loading.requestId !== requestId) {
    return state;
  }
  return { ...state, loading: { ...state.loading, phase, detail } };
}

export function loadingSucceeded(state: AppState, requestId: number, recipe: Recipe): AppState {
  if (state.screen !== "loading" || !state.loading || state.loading.requestId !== requestId) {
    return state;
  }
  return {
    ...state,
    screen: "recipe",
    recipe,
    loading: null,
    error: null,
  };
}

export function loadingFailed(state: AppState, requestId: number, error: AppError): AppState {
  if (state.screen !== "loading" || !state.loading || state.loading.requestId !== requestId) {
    return state;
  }
  return {
    ...state,
    screen: "error",
    error: { error, query: state.loading.query },
    loading: null,
  };
}

export function assistantAnswered(state: AppState, requestId: number, answer: Localized): AppState {
  if (!state.cooking?.modal || state.cooking.modal.id !== requestId) return state;
  return {
    ...state,
    cooking: {
      ...state.cooking,
      modal: {
        ...state.cooking.modal,
        status: "answered",
        answer,
      },
    },
  };
}

export function assistantFailed(state: AppState, requestId: number, answer: Localized): AppState {
  return assistantAnswered(state, requestId, answer);
}

/** Advance clocks, countdowns and the home carousel. */
export function tick(state: AppState, deltaMs: number): AppState {
  const delta = Math.max(0, Math.min(5_000, deltaMs));
  if (delta === 0) return state;
  const clockMs = state.clockMs + delta;
  let next: AppState = { ...state, clockMs };

  if (next.screen === "home") {
    const elapsed = clockMs - next.home.carouselAtMs;
    if (elapsed >= CAROUSEL_INTERVAL_MS) {
      const steps = Math.floor(elapsed / CAROUSEL_INTERVAL_MS);
      next = {
        ...next,
        home: {
          ...next.home,
          carouselIndex: (next.home.carouselIndex + steps) % RECOMMENDED_RECIPES.length,
          carouselAtMs: next.home.carouselAtMs + steps * CAROUSEL_INTERVAL_MS,
        },
      };
    }
  }

  if (next.cooking) {
    const timers = next.cooking.timers.map((timer) => {
      if (timer.status !== "running") return timer;
      const remainingMs = timer.remainingMs - delta;
      if (remainingMs <= 0) {
        return { ...timer, remainingMs: 0, status: "done" as const, doneAtMs: clockMs };
      }
      return { ...timer, remainingMs };
    });
    next = { ...next, cooking: { ...next.cooking, timers } };
  }

  return next;
}

/** Human readable remaining time, reused by the renderer and tests. */
export function formatDurationShort(milliseconds: number, language: UiLanguage): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  if (seconds < 60) return language === "zh" ? `${seconds} 秒` : `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return language === "zh"
    ? rest === 0
      ? `${minutes} 分钟`
      : `${minutes} 分 ${rest} 秒`
    : rest === 0
      ? `${minutes} min`
      : `${minutes}m ${rest}s`;
}

/** Resolve an unknown recipe name to an offline snapshot, used by the service. */
export function offlineRecipeFor(query: string): Recipe | null {
  return findOfflineRecipe(query);
}

export function errorForCode(code: ErrorCode, query: string): AppError {
  const definitions: Record<
    ErrorCode,
    { title: Localized; message: Localized; canRetry: boolean }
  > = {
    "not-found": {
      title: l("没有找到这道菜", "Recipe not found"),
      message: l(
        "换个说法试试，或从首页推荐里选一道。",
        "Try another name, or pick one of the home recommendations.",
      ),
      canRetry: true,
    },
    network: {
      title: l("网络好像不太稳定", "The network looks unstable"),
      message: l(
        "检查网络后重试；内置推荐菜谱可以离线使用。",
        "Check the connection and retry; built-in picks work offline.",
      ),
      canRetry: true,
    },
    llm: {
      title: l("AI 整理菜谱时卡住了", "The AI got stuck structuring the recipe"),
      message: l("可以重试一次，或换一道更常见的菜。", "Retry once, or pick a more common dish."),
      canRetry: true,
    },
    invalid: {
      title: l("菜谱内容不完整", "The recipe was incomplete"),
      message: l(
        "这次返回的步骤不够完整，换一道菜或重试。",
        "The returned steps were incomplete. Retry or pick another dish.",
      ),
      canRetry: true,
    },
    forced: {
      title: l("强制异常测试", "Forced error test"),
      message: l("已触发强制异常测试（*）。", "Forced error test triggered (*)."),
      canRetry: query.length > 0,
    },
  };
  const definition = definitions[code];
  return {
    code,
    title: definition.title,
    message: definition.message,
    detail: `pipeline-error:${code}:${query}`,
    canRetry: definition.canRetry || query.length > 0,
  };
}

/** Used by the UI to render the assistant answer, keeps copy out of renderer. */
export function assistantHeader(language: UiLanguage): string {
  return pick(l("厨房助手", "Kitchen Helper"), language);
}

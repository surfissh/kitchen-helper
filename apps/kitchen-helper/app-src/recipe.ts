/**
 * Pure recipe state machine for the Kitchen Helper AR application.
 *
 * Time is injected as deltas so the logic is deterministic and testable
 * without the simulator or a real clock.
 */

export interface RecipeStep {
  readonly id: string;
  readonly nameZh: string;
  readonly nameEn: string;
  readonly instructionZh: string;
  readonly instructionEn: string;
  readonly durationMs: number;
}

/** A short four-step cooking loop, sized for a 640x480 HUD. */
export const RECIPE_STEPS: readonly RecipeStep[] = [
  {
    id: "wash",
    nameZh: "清洗食材",
    nameEn: "Wash",
    instructionZh: "流水冲洗 8 秒，去掉表面浮尘",
    instructionEn: "Rinse under running water for 8 seconds",
    durationMs: 8_000,
  },
  {
    id: "chop",
    nameZh: "切配",
    nameEn: "Chop",
    instructionZh: "切成入口大小，注意手指位置",
    instructionEn: "Cut into bite-sized pieces; keep fingers clear",
    durationMs: 10_000,
  },
  {
    id: "cook",
    nameZh: "下锅",
    nameEn: "Cook",
    instructionZh: "中火翻炒，观察锅温与油烟",
    instructionEn: "Stir over medium heat and mind the pan",
    durationMs: 12_000,
  },
  {
    id: "plate",
    nameZh: "装盘",
    nameEn: "Plate",
    instructionZh: "关火装盘，静置片刻即可享用",
    instructionEn: "Plate, rest for a moment, then serve",
    durationMs: 6_000,
  },
];

/** Pause between loops before the next round starts. */
export const CYCLE_REST_MS = 3_000;

export interface RecipeState {
  stepIndex: number;
  /** Milliseconds into the current step, or into the post-cycle rest. */
  elapsedMs: number;
  completed: boolean;
  /** Completed rounds since the application started. */
  cycles: number;
}

export interface TickResult {
  state: RecipeState;
  /** True when the visible step changed, including cycle completion/restart. */
  stepChanged: boolean;
  /** True when the last step finished and the rest pause began. */
  cycleCompleted: boolean;
}

export function initialState(cycles = 0): RecipeState {
  return { stepIndex: 0, elapsedMs: 0, completed: false, cycles };
}

export function currentStep(state: RecipeState): RecipeStep {
  return (RECIPE_STEPS[state.stepIndex] ?? RECIPE_STEPS[0]) as RecipeStep;
}

export function stepDuration(state: RecipeState): number {
  return currentStep(state).durationMs;
}

export function tick(state: RecipeState, deltaMs: number): TickResult {
  if (deltaMs <= 0) {
    return { state, stepChanged: false, cycleCompleted: false };
  }
  if (state.completed) {
    const elapsed = state.elapsedMs + deltaMs;
    if (elapsed >= CYCLE_REST_MS) {
      return {
        state: initialState(state.cycles + 1),
        stepChanged: true,
        cycleCompleted: false,
      };
    }
    return { state: { ...state, elapsedMs: elapsed }, stepChanged: false, cycleCompleted: false };
  }

  let stepIndex = state.stepIndex;
  let elapsed = state.elapsedMs + deltaMs;
  let completed = false;
  let cycleCompleted = false;
  let stepChanged = false;
  for (;;) {
    const step = RECIPE_STEPS[stepIndex] as RecipeStep;
    if (elapsed < step.durationMs) break;
    elapsed -= step.durationMs;
    const isLast = stepIndex === RECIPE_STEPS.length - 1;
    if (isLast) {
      completed = true;
      cycleCompleted = true;
      stepChanged = true;
      elapsed = 0;
      break;
    }
    stepIndex += 1;
    stepChanged = true;
  }
  return {
    state: { stepIndex, elapsedMs: completed ? 0 : elapsed, completed, cycles: state.cycles },
    stepChanged,
    cycleCompleted,
  };
}

/** Move one step forward/backward; wraps around. Ignored during rest. */
export function skip(state: RecipeState, direction: 1 | -1): RecipeState {
  if (state.completed) return state;
  const count = RECIPE_STEPS.length;
  return {
    ...state,
    stepIndex: (state.stepIndex + direction + count) % count,
    elapsedMs: 0,
  };
}

/** Remaining time in `m:ss` form. */
export function formatCountdown(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

export function remainingMs(state: RecipeState): number {
  if (state.completed) return Math.max(0, CYCLE_REST_MS - state.elapsedMs);
  return Math.max(0, stepDuration(state) - state.elapsedMs);
}

/** 0..1 completion of the current step (or the rest pause). */
export function progressRatio(state: RecipeState): number {
  const total = state.completed ? CYCLE_REST_MS : stepDuration(state);
  if (total <= 0) return 1;
  return Math.min(1, Math.max(0, state.elapsedMs / total));
}

export function cycleLabel(state: RecipeState, language: "zh" | "en"): string {
  if (state.completed) return language === "zh" ? "本轮完成" : "Round complete";
  return language === "zh" ? `第 ${state.cycles + 1} 轮` : `Round ${state.cycles + 1}`;
}

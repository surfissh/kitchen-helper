/**
 * Domain types shared by the recipe pipeline, the reducer and the renderer.
 *
 * Everything here is deliberately free of FusionUI imports so the cooking
 * logic can be unit tested with plain Node.js.
 */

export type UiLanguage = "zh" | "en";

/** A string that is available in both supported display languages. */
export interface Localized {
  readonly zh: string;
  readonly en: string;
}

/** Decorative icon keys backed by PNG assets in `src/assets/icons`. */
export type IconKey =
  | "chef-hat"
  | "flame"
  | "clock"
  | "timer"
  | "mic"
  | "check"
  | "warning"
  | "sparkle"
  | "pot"
  | "pan"
  | "knife"
  | "board"
  | "bowl"
  | "dish"
  | "tomato"
  | "egg"
  | "meat"
  | "vegetable"
  | "tofu"
  | "seasoning"
  | "oil"
  | "water"
  | "grain"
  | "other"
  | "leaf"
  | "tap"
  | "sound"
  | "arrow-up"
  | "arrow-down"
  | "arrow-left"
  | "arrow-right";

/** One ingredient or one piece of cookware on the preparation screen. */
export interface PrepItem {
  readonly id: string;
  readonly name: Localized;
  readonly amount: Localized;
  readonly icon: IconKey;
}

/** One countdown that can be started from a cooking step. */
export interface StepTimerSpec {
  /** Stable id within the step; combined with the step index for the timer list. */
  readonly id: string;
  readonly label: Localized;
  readonly durationSeconds: number;
}

/** One guided cooking step. */
export interface RecipeStep {
  readonly id: string;
  readonly title: Localized;
  /** The big instruction shown in the middle of the AR HUD. */
  readonly instruction: Localized;
  /** Extra beginner tip rendered a little smaller under the instruction. */
  readonly tip?: Localized;
  /** Timers the user can start while this step is active. */
  readonly timers: readonly StepTimerSpec[];
  /** 0 = no heat, 1 = low, 2 = medium, 3 = high. */
  readonly heat: 0 | 1 | 2 | 3;
  readonly icon: IconKey;
}

export interface RecipeSource {
  readonly provider: "HowToCook";
  readonly pageUrl: string;
  readonly markdownUrl?: string;
  readonly fetchedAt: string;
  /** Whether the structured payload came from DeepSeek or the offline parser. */
  readonly extractedBy: "deepseek" | "local";
}

export interface Recipe {
  readonly title: Localized;
  readonly summary: Localized;
  /** 1..5 stars. */
  readonly difficulty: number;
  readonly totalMinutes: number;
  readonly servings: Localized;
  readonly caloriesKcal?: number;
  readonly ingredients: readonly PrepItem[];
  readonly cookware: readonly PrepItem[];
  readonly steps: readonly RecipeStep[];
  readonly source: RecipeSource;
}

/** A card on the home screen. These are always available offline. */
export interface RecommendedRecipe {
  readonly id: string;
  readonly title: Localized;
  readonly subtitle: Localized;
  readonly minutes: number;
  readonly difficulty: number;
  readonly icon: IconKey;
  /** Query that is sent to HowToCook when this card starts the flow. */
  readonly query: string;
  readonly accent: "orange" | "teal" | "pink";
}

/** Phases reported by the asynchronous recipe pipeline. */
export type LoadingPhase = "search" | "fetch" | "structure" | "finish";

export type ErrorCode = "not-found" | "network" | "llm" | "invalid" | "forced";

export interface AppError {
  readonly code: ErrorCode;
  readonly title: Localized;
  readonly message: Localized;
  readonly detail: string;
  readonly canRetry: boolean;
}

export type Screen =
  | "home"
  | "listening"
  | "loading"
  | "recipe"
  | "prep"
  | "cooking"
  | "done"
  | "error";

export type FocusRow = "ingredients" | "cookware";

export interface TimerState {
  readonly id: string;
  readonly stepIndex: number;
  readonly label: Localized;
  readonly totalMs: number;
  remainingMs: number;
  status: "idle" | "running" | "done";
  /** State clock time at which the timer finished, for the completion flash. */
  doneAtMs: number | null;
}

export interface AssistantModal {
  readonly id: number;
  readonly question: string;
  readonly status: "thinking" | "answered";
  readonly answer: Localized;
  readonly createdAtMs: number;
}

export interface PrepState {
  readonly ingredients: readonly PrepItem[];
  readonly cookware: readonly PrepItem[];
  readonly removedIds: readonly string[];
  readonly focusRow: FocusRow;
  readonly focusIndex: number;
  readonly ready: boolean;
  readonly readyAtMs: number | null;
  readonly lastRemovedId: string | null;
  readonly lastRemovedAtMs: number;
}

export interface CookingState {
  readonly stepIndex: number;
  readonly scrollPage: number;
  readonly timers: readonly TimerState[];
  readonly modal: AssistantModal | null;
  readonly stepEnteredAtMs: number;
  readonly startedAtMs: number | null;
}

export interface HomeState {
  readonly completedCount: number;
  readonly lastDish: Localized | null;
  readonly carouselIndex: number;
  readonly carouselAtMs: number;
}

export interface LoadingState {
  readonly query: string;
  readonly phase: LoadingPhase;
  readonly requestId: number;
  readonly startedAtMs: number;
  readonly detail: Localized;
}

export interface ErrorState {
  readonly error: AppError;
  readonly query: string;
}

export interface DoneState {
  readonly finishedAtMs: number;
  readonly cookingMs: number;
  readonly confettiSeed: number;
}

export interface AppState {
  readonly screen: Screen;
  readonly language: UiLanguage;
  /** Milliseconds accumulated by the deterministic tick loop. */
  readonly clockMs: number;
  readonly home: HomeState;
  readonly listeningStartedAtMs: number;
  readonly loading: LoadingState | null;
  readonly recipe: Recipe | null;
  readonly prep: PrepState | null;
  readonly cooking: CookingState | null;
  readonly done: DoneState | null;
  readonly error: ErrorState | null;
  /** Monotonic id used by asynchronous effects to reject stale results. */
  readonly effectSerial: number;
}

export type InputAction = "up" | "down" | "left" | "right" | "activate" | "back";

export type ParsedInput =
  | { readonly kind: "action"; readonly action: InputAction }
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "force-error" };

export type Effect =
  | {
      readonly type: "load-recipe";
      readonly query: string;
      readonly requestId: number;
    }
  | {
      readonly type: "ask-assistant";
      readonly question: string;
      readonly requestId: number;
      readonly recipe: Recipe;
      readonly step: RecipeStep;
    }
  | {
      readonly type: "persist-completion";
      readonly recipeTitle: Localized;
    };

/**
 * Kitchen Helper — entry point.
 *
 * Responsibilities:
 *  - create the IrisView window and FusionUI root;
 *  - drive a single requestAnimationFrame loop that polls navigation/text input;
 *  - apply the pure reducer and execute its async effects (HowToCook + DeepSeek);
 *  - render the current screen and log lifecycle/state for simulator checks.
 */

import {
  App,
  AppLifecycle,
  cancelAnimationFrame,
  DisplayLanguage,
  getDisplayLanguage,
  requestAnimationFrame,
  Window,
  WindowProperty,
} from "@irisview/osx/os";
import { isNavigationAvailable, takeNavigationAction, takeTextInput } from "@irisview/osx/os/input";
import { FusionRoot } from "@irisview/osx/fusionui";

import type { AppError, AppState, Effect, Recipe, UiLanguage } from "./model/types.ts";
import {
  assistantAnswered,
  createInitialState,
  currentStep,
  errorForCode,
  handleAction,
  handleTextInput,
  loadingFailed,
  loadingProgress,
  loadingSucceeded,
  tick,
} from "./model/state.ts";
import { applicationDataDirectory } from "./application-data.ts";
import {
  DEEPSEEK_MODEL,
  deepSeekKeyFilePath,
  deepSeekKeyStatus,
  ensureDeepSeekKeyTemplate,
} from "./config.ts";
import { isRecipePipelineError } from "./recipe/errors.ts";
import { answerCookingQuestion, loadRecipe } from "./recipe/service.ts";
import { loadHistory, recordCompletion, saveHistory, type HistoryState } from "./storage.ts";
import { AppRenderer } from "./ui/renderer.ts";

const MIN_LOADING_MS = 1_500;

interface PendingLoad {
  readonly requestId: number;
  readonly recipe?: Recipe;
  readonly error?: AppError;
  readonly readyAtMs: number;
  /** Wall-clock submission time of the text that started this request. */
  readonly inputAtMs: number;
  /** Wall-clock time the async pipeline resolved (before the screen change). */
  readonly pipelineDoneAtMs: number;
}

function displayLanguage(): UiLanguage {
  return getDisplayLanguage() === DisplayLanguage.ENGLISH ? "en" : "zh";
}

function log(event: string, payload?: Record<string, unknown>): void {
  console.log(payload ? `${event} ${JSON.stringify(payload)}` : event);
}

class KitchenController {
  private window: Window | null = null;
  private renderer: AppRenderer | null = null;
  private state: AppState;
  private history: HistoryState;
  private frame: number | null = null;
  private lastTime: number | null = null;
  private active = false;
  private pendingLoad: PendingLoad | null = null;
  private loadingStartedAtMs = 0;
  /** Wall-clock time the current text submission arrived from the input queue. */
  private lastInputAtMs = 0;
  private lastScreen = "";
  private readonly language: UiLanguage;

  constructor(language: UiLanguage) {
    this.language = language;
    this.history = loadHistory();
    this.state = createInitialState(language, {
      completedCount: this.history.completedCount,
      lastDish: this.history.lastDish,
    });
    // The data directory follows the simulator state directory selected with
    // `--state-dir`; the DeepSeek key is read from it at request time. Log the
    // resolved paths (never the key) so a developer can drop the key file in
    // the right place.
    ensureDeepSeekKeyTemplate();
    log("KITCHEN_HELPER_DATA_DIR", { path: applicationDataDirectory() });
    const key = deepSeekKeyStatus();
    log("KITCHEN_HELPER_LLM_KEY", {
      source: key.source,
      file: deepSeekKeyFilePath(),
      model: DEEPSEEK_MODEL,
    });
  }

  start(): void {
    if (this.window) return;
    const property = WindowProperty.create();
    property.setTitle(this.language === "zh" ? "厨房助手" : "Kitchen Helper");
    property.setSize([0.64, 0.48, 0.01]);
    this.window = Window.create(property);
    const root = FusionRoot.acquireFusionRootFromWindow(this.window);
    this.renderer = new AppRenderer(root.getRootWidget(), this.language);
    this.renderer.render(this.state);
    log("KITCHEN_HELPER_READY", {
      language: this.language,
      navigation: isNavigationAvailable(),
      completed: this.history.completedCount,
    });
    this.lastScreen = this.state.screen;
    this.resume();
  }

  pause(): void {
    this.active = false;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  resume(): void {
    if (!this.window || this.active) return;
    this.active = true;
    this.lastTime = null;
    this.frame = requestAnimationFrame((time) => this.onFrame(time));
  }

  destroy(): void {
    this.pause();
    this.renderer?.dispose();
    this.renderer = null;
    try {
      this.window?.close();
    } catch {
      // The Client may already have torn the surface down.
    }
    this.window = null;
  }

  private onFrame(timestamp: number): void {
    this.frame = null;
    if (!this.active || !this.window) return;
    const delta =
      this.lastTime === null ? 16 : Math.max(0, Math.min(250, timestamp - this.lastTime));
    this.lastTime = timestamp;
    this.drainInput();
    this.state = tick(this.state, delta);
    this.applyPendingLoad();
    this.renderer?.render(this.state);
    this.logScreenChange();
    this.frame = requestAnimationFrame((time) => this.onFrame(time));
  }

  private drainInput(): void {
    let guard = 0;
    while (guard < 12) {
      const action = takeNavigationAction();
      if (action === null) break;
      guard += 1;
      this.dispatch(handleAction(this.state, action));
    }
    guard = 0;
    while (guard < 6) {
      const input = takeTextInput();
      if (!input) break;
      guard += 1;
      this.lastInputAtMs = Date.now();
      log("KITCHEN_HELPER_TEXT", {
        text: input.text,
        screen: this.state.screen,
        at: this.lastInputAtMs,
      });
      this.dispatch(handleTextInput(this.state, input.text));
    }
  }

  private dispatch(transition: { state: AppState; effects: readonly Effect[] }): void {
    this.state = transition.state;
    for (const effect of transition.effects) this.runEffect(effect);
  }

  private runEffect(effect: Effect): void {
    switch (effect.type) {
      case "load-recipe": {
        this.pendingLoad = null;
        this.loadingStartedAtMs = this.state.clockMs;
        const { query, requestId } = effect;
        const inputAtMs = this.lastInputAtMs || Date.now();
        void loadRecipe(query, (phase, detail) => {
          this.state = loadingProgress(this.state, requestId, phase, detail);
        })
          .then((recipe) => {
            this.queueLoadResult({
              requestId,
              recipe,
              readyAtMs: this.loadingReadyAt(),
              inputAtMs,
              pipelineDoneAtMs: Date.now(),
            });
          })
          .catch((error: unknown) => {
            const code = isRecipePipelineError(error) ? error.code : "network";
            const base = errorForCode(code, query);
            const detail =
              isRecipePipelineError(error) && error.detail ? error.detail : base.detail;
            this.queueLoadResult({
              requestId,
              error: { ...base, detail },
              readyAtMs: this.loadingReadyAt(),
              inputAtMs,
              pipelineDoneAtMs: Date.now(),
            });
          });
        break;
      }
      case "ask-assistant": {
        const { question, requestId, recipe, step } = effect;
        void answerCookingQuestion(question, recipe, step, this.language).then((answer) => {
          setTimeout(() => {
            this.state = assistantAnswered(this.state, requestId, answer);
          }, 420);
        });
        break;
      }
      case "persist-completion": {
        this.history = recordCompletion(this.history, effect.recipeTitle);
        saveHistory(this.history);
        log("KITCHEN_HELPER_DONE", {
          dish: effect.recipeTitle.zh,
          completed: this.history.completedCount,
        });
        break;
      }
    }
  }

  private loadingReadyAt(): number {
    return (
      this.state.clockMs +
      Math.max(0, MIN_LOADING_MS - (this.state.clockMs - this.loadingStartedAtMs))
    );
  }

  private queueLoadResult(result: PendingLoad): void {
    // A newer request supersedes any slower result.
    if (this.pendingLoad && this.pendingLoad.requestId > result.requestId) return;
    this.pendingLoad = result;
  }

  private applyPendingLoad(): void {
    const pending = this.pendingLoad;
    if (!pending) return;
    if (this.state.clockMs < pending.readyAtMs) return;
    this.pendingLoad = null;
    if (pending.recipe) {
      const appliedAtMs = Date.now();
      log("KITCHEN_HELPER_LATENCY", {
        requestId: pending.requestId,
        dish: pending.recipe.title.zh,
        source: pending.recipe.source.extractedBy,
        steps: pending.recipe.steps.length,
        inputToPipelineMs: pending.pipelineDoneAtMs - pending.inputAtMs,
        pipelineToScreenMs: appliedAtMs - pending.pipelineDoneAtMs,
        inputToScreenMs: appliedAtMs - pending.inputAtMs,
        minLoadingWaitMs: Math.max(0, pending.readyAtMs - pending.pipelineDoneAtMs),
      });
      log("KITCHEN_HELPER_RECIPE", {
        title: pending.recipe.title.zh,
        steps: pending.recipe.steps.length,
        source: pending.recipe.source.extractedBy,
        ingredients: pending.recipe.ingredients.length,
      });
      this.state = loadingSucceeded(this.state, pending.requestId, pending.recipe);
    } else if (pending.error) {
      log("KITCHEN_HELPER_ERROR", { code: pending.error.code, detail: pending.error.detail });
      this.state = loadingFailed(this.state, pending.requestId, pending.error);
    }
  }

  private logScreenChange(): void {
    if (this.state.screen === this.lastScreen) return;
    this.lastScreen = this.state.screen;
    const recipe = this.state.recipe;
    log("KITCHEN_HELPER_SCREEN", {
      screen: this.state.screen,
      step: this.state.cooking?.stepIndex ?? null,
      dish: recipe?.title.zh ?? null,
    });
    if (this.state.screen === "cooking") {
      const step = currentStep(this.state);
      if (step && step.timers.length > 0) {
        log("KITCHEN_HELPER_TIMER_READY", { step: step.title.zh, timers: step.timers.length });
      }
    }
  }

  /** Exposed for debugging tools; keeps the reducer state inspectable. */
  snapshot(): AppState {
    return this.state;
  }
}

const controller = new KitchenController(displayLanguage());

App.createApp((lifecycle: AppLifecycle) => {
  log("KITCHEN_HELPER_LIFECYCLE", { lifecycle });
  switch (lifecycle) {
    case AppLifecycle.ON_CREATE:
      controller.start();
      break;
    case AppLifecycle.ON_FOREGROUND:
    case AppLifecycle.ON_REOPEN:
      controller.resume();
      break;
    case AppLifecycle.ON_BACKGROUND:
      controller.pause();
      break;
    case AppLifecycle.ON_DESTROY:
      controller.destroy();
      break;
  }
});

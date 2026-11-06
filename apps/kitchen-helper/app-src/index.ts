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
import { takeNavigationAction } from "@irisview/osx/os/input";
import { Board, Color, Font, FusionRoot, Text, TextAlign, View } from "@irisview/osx/fusionui";
import type { RootWidget, Widget } from "@irisview/osx/fusionui";
import {
  RECIPE_STEPS,
  currentStep,
  cycleLabel,
  formatCountdown,
  initialState,
  progressRatio,
  remainingMs,
  skip,
  tick,
  type RecipeState,
} from "./recipe.ts";
import { loadState, saveState } from "./storage.ts";

const APP_ID = "com.example.kitchenhelper";
const DISPLAY_WIDTH = 640;
const DISPLAY_HEIGHT = 480;
const ACTIVE = Color.fromRGB8(0, 255, 128);
const DIM = Color.fromRGB8(40, 90, 62);
const TEXT = Color.fromRGB8(200, 255, 220);
const MUTED = Color.fromRGB8(120, 180, 150);

interface ViewState {
  window: Window | null;
  root: FusionRoot | null;
  board: Board | null;
  title: Text | null;
  round: Text | null;
  stepName: Text | null;
  countdown: Text | null;
  instruction: Text | null;
  status: Text | null;
  dots: View[];
  frame: number | null;
  lastFrameAt: number | null;
  lastPaintAt: number;
  recipe: RecipeState;
  language: "zh" | "en";
}

const view: ViewState = {
  window: null,
  root: null,
  board: null,
  title: null,
  round: null,
  stepName: null,
  countdown: null,
  instruction: null,
  status: null,
  dots: [],
  frame: null,
  lastFrameAt: null,
  lastPaintAt: 0,
  recipe: initialState(),
  language: "en",
};

function label(
  parent: Widget,
  y: number,
  height: number,
  size: number,
  bold: number,
  color: Color,
): Text {
  const text = Text.create();
  text.setParent(parent);
  text.setIgnoreLayout(true);
  text.setPosition([0, y, 0]);
  text.setSize([DISPLAY_WIDTH, height, 0]);
  text.setText("");
  text.setLongMode(Text.LongMode.LONG_DOT_END);
  const style = text.getLocalStyle();
  style.setTextColor(color);
  style.setTextAlign(TextAlign.CENTER);
  const font = Font.getCachedFont("", size, bold, 0);
  if (font) style.setTextFont(font);
  return text;
}

function dot(parent: Widget, x: number): View {
  const view = View.create();
  view.setParent(parent);
  view.setIgnoreLayout(true);
  view.setPosition([x, 352, 0]);
  view.setSize([18, 18, 0]);
  view.getLocalStyle().setBackgroundColor(DIM);
  return view;
}

/** Repaint the whole HUD from the current recipe state. */
function paint(): void {
  if (!view.board) return;
  const language = view.language;
  const state = view.recipe;
  const step = currentStep(state);
  const stepNumber = state.completed ? RECIPE_STEPS.length : state.stepIndex + 1;

  view.round?.setText(
    language === "zh"
      ? `步骤 ${stepNumber} / ${RECIPE_STEPS.length}`
      : `Step ${stepNumber} / ${RECIPE_STEPS.length}`,
  );
  view.stepName?.setText(
    state.completed
      ? language === "zh"
        ? "完成"
        : "Done"
      : language === "zh"
        ? step.nameZh
        : step.nameEn,
  );
  view.countdown?.setText(formatCountdown(remainingMs(state)));
  view.instruction?.setText(
    state.completed
      ? language === "zh"
        ? "稍作休息，下一轮马上开始"
        : "Rest a moment; the next round starts shortly"
      : language === "zh"
        ? step.instructionZh
        : step.instructionEn,
  );
  view.status?.setText(
    `${cycleLabel(state, language)} · ${language === "zh" ? "←/→ 切换步骤" : "←/→ change step"}`,
  );

  const activeIndex = state.completed ? RECIPE_STEPS.length : state.stepIndex;
  view.dots.forEach((dotView, index) => {
    const color =
      index < activeIndex ? Color.fromRGB8(0, 140, 90) : index === activeIndex ? ACTIVE : DIM;
    dotView.getLocalStyle().setBackgroundColor(color);
  });

  // A subtle progress cue in the countdown color.
  const ratio = progressRatio(state);
  view.countdown?.getLocalStyle().setTextColor(ratio >= 1 ? ACTIVE : Color.fromRGB8(160, 255, 210));
}

function onRecipeChanged(result: ReturnType<typeof tick>): void {
  view.recipe = result.state;
  if (result.cycleCompleted) {
    const completed = view.recipe.cycles + 1;
    saveState({ cycles: completed });
    console.log(`KITCHEN_CYCLE completed=${completed}`);
  }
  paint();
}

function pollInput(): boolean {
  let changed = false;
  for (;;) {
    const action = takeNavigationAction();
    if (action === null) break;
    if (action === "left") {
      view.recipe = skip(view.recipe, -1);
      changed = true;
    } else if (action === "right" || action === "activate") {
      view.recipe = skip(view.recipe, 1);
      changed = true;
    }
  }
  return changed;
}

function tickFrame(timestamp: number): void {
  view.frame = null;
  if (!view.window) return;
  const previous = view.lastFrameAt ?? timestamp;
  const delta = Math.min(500, Math.max(0, timestamp - previous));
  view.lastFrameAt = timestamp;

  const inputChanged = pollInput();
  const result = tick(view.recipe, delta);
  if (result.stepChanged || result.cycleCompleted) {
    onRecipeChanged(result);
  } else {
    view.recipe = result.state;
    if (timestamp - view.lastPaintAt >= 100 || inputChanged) paint();
  }
  view.lastPaintAt = timestamp;
  view.frame = requestAnimationFrame(tickFrame);
}

function resume(): void {
  if (!view.window || view.frame !== null) return;
  view.lastFrameAt = null;
  view.frame = requestAnimationFrame(tickFrame);
}

function pause(): void {
  if (view.frame !== null) {
    cancelAnimationFrame(view.frame);
    view.frame = null;
  }
  view.lastFrameAt = null;
}

function teardown(): void {
  pause();
  view.window = null;
  view.root = null;
  view.board = null;
  view.title = null;
  view.round = null;
  view.stepName = null;
  view.countdown = null;
  view.instruction = null;
  view.status = null;
  view.dots = [];
}

function start(): void {
  if (view.window) return;
  view.language = getDisplayLanguage() === DisplayLanguage.SIMPLIFIED_CHINESE ? "zh" : "en";
  view.recipe = initialState(loadState().cycles);

  const property = WindowProperty.create();
  property.setTitle("Kitchen Helper");
  property.setSize([0.64, 0.48, 0.01]);
  view.window = Window.create(property);
  view.root = FusionRoot.acquireFusionRootFromWindow(view.window);
  const rootWidget: RootWidget = view.root.getRootWidget();

  const board = Board.create();
  view.board = board;
  board.setParent(rootWidget);
  board.setIgnoreLayout(true);
  board.setSize([DISPLAY_WIDTH, DISPLAY_HEIGHT, 0]);
  board.getLocalStyle().setBackgroundColor(Color.fromRGB8(2, 10, 6));

  view.title = label(board, 22, 32, 20, 1, MUTED);
  view.title.setText("厨房助手 · Kitchen Helper");
  view.round = label(board, 62, 24, 16, 0, DIM);
  view.stepName = label(board, 92, 56, 40, 1, ACTIVE);
  view.countdown = label(board, 158, 88, 64, 1, TEXT);
  view.instruction = label(board, 254, 60, 18, 0, MUTED);
  view.status = label(board, 420, 26, 15, 0, DIM);

  const count = RECIPE_STEPS.length;
  const startX = DISPLAY_WIDTH / 2 - ((count - 1) * 34) / 2 - 9;
  view.dots = Array.from({ length: count }, (_unused, index) => dot(board, startX + index * 34));

  paint();
  resume();
  console.log(`KITCHEN_READY ${APP_ID} cycles=${view.recipe.cycles}`);
}

App.createApp((lifecycle) => {
  if (lifecycle === AppLifecycle.ON_CREATE) start();
  else if (lifecycle === AppLifecycle.ON_FOREGROUND || lifecycle === AppLifecycle.ON_REOPEN)
    resume();
  else if (lifecycle === AppLifecycle.ON_BACKGROUND) pause();
  else if (lifecycle === AppLifecycle.ON_DESTROY) teardown();
});

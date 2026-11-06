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
import { Board, Color, Font, FusionRoot, Text, TextAlign } from "@irisview/osx/fusionui";
import type { RootWidget, Widget } from "@irisview/osx/fusionui";
import { formatElapsed, launchLabel, subtitle, type UiLanguage } from "./app.ts";
import { loadState, saveState } from "./storage.ts";

/**
 * Keep strong references to every native-backed object for as long as the
 * window is alive; dropping them can destroy the FusionUI object tree.
 */
interface ViewState {
  window: Window | null;
  root: FusionRoot | null;
  board: Board | null;
  title: Text | null;
  clock: Text | null;
  hint: Text | null;
  launch: Text | null;
  frame: number | null;
  startedAt: number | null;
  language: UiLanguage;
}

const view: ViewState = {
  window: null,
  root: null,
  board: null,
  title: null,
  clock: null,
  hint: null,
  launch: null,
  frame: null,
  startedAt: null,
  language: "en",
};

function textLabel(parent: Widget, y: number, height: number, size: number, color: Color): Text {
  const label = Text.create();
  label.setParent(parent);
  label.setIgnoreLayout(true);
  label.setPosition([0, y, 0]);
  label.setSize([640, height, 0]);
  label.setText("");
  const style = label.getLocalStyle();
  style.setTextColor(color);
  style.setTextAlign(TextAlign.CENTER);
  const font = Font.getCachedFont("", size, 0, 0);
  if (font) style.setTextFont(font);
  return label;
}

function paintClock(): void {
  if (!view.clock || view.startedAt === null) return;
  view.clock.setText(formatElapsed((Date.now() - view.startedAt) / 1000));
}

function tick(): void {
  view.frame = null;
  if (!view.window) return;
  paintClock();
  view.frame = requestAnimationFrame(tick);
}

function resume(): void {
  if (!view.window || view.frame !== null) return;
  view.frame = requestAnimationFrame(tick);
}

function pause(): void {
  if (view.frame !== null) {
    cancelAnimationFrame(view.frame);
    view.frame = null;
  }
}

function teardown(): void {
  pause();
  view.window = null;
  view.root = null;
  view.board = null;
  view.title = null;
  view.clock = null;
  view.hint = null;
  view.launch = null;
  view.startedAt = null;
}

function start(): void {
  if (view.window) return;
  view.language = getDisplayLanguage() === DisplayLanguage.SIMPLIFIED_CHINESE ? "zh" : "en";

  const property = WindowProperty.create();
  property.setTitle("__APP_NAME__");
  property.setSize([0.64, 0.48, 0.01]);
  view.window = Window.create(property);

  view.root = FusionRoot.acquireFusionRootFromWindow(view.window);
  const rootWidget: RootWidget = view.root.getRootWidget();

  view.board = Board.create();
  view.board.setParent(rootWidget);
  view.board.setIgnoreLayout(true);
  view.board.setSize([640, 480, 0]);
  view.board.getLocalStyle().setBackgroundColor(Color.fromRGB8(4, 12, 8));

  view.title = textLabel(view.board, 88, 48, 30, Color.fromRGB8(0, 255, 128));
  view.title.setText("__APP_NAME__");

  view.hint = textLabel(view.board, 158, 32, 18, Color.fromRGB8(120, 180, 150));
  view.hint.setText(subtitle(view.language));

  view.clock = textLabel(view.board, 208, 72, 52, Color.fromRGB8(200, 255, 220));

  view.launch = textLabel(view.board, 306, 28, 16, Color.fromRGB8(80, 140, 110));
  const state = loadState();
  state.launches += 1;
  saveState(state);
  view.launch.setText(launchLabel(state.launches, view.language));

  view.startedAt = Date.now();
  paintClock();
  resume();
  console.log(`IRISVIEW_TS_READY __APP_ID__ launches=${state.launches}`);
}

App.createApp((lifecycle) => {
  if (lifecycle === AppLifecycle.ON_CREATE) start();
  else if (lifecycle === AppLifecycle.ON_FOREGROUND || lifecycle === AppLifecycle.ON_REOPEN)
    resume();
  else if (lifecycle === AppLifecycle.ON_BACKGROUND) pause();
  else if (lifecycle === AppLifecycle.ON_DESTROY) teardown();
});

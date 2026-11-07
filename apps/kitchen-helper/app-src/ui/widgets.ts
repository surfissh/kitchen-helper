/**
 * Thin factory helpers over the FusionUI public API.
 *
 * Every widget is manually positioned (`setIgnoreLayout(true)`) because the AR
 * HUD is a fixed 640×480 canvas; keeping the layout explicit makes the visual
 * result deterministic in the simulator.
 */

import { Board, Image, Text, TextAlign, View } from "@irisview/osx/fusionui";
import type { Color, Widget } from "@irisview/osx/fusionui";
import { existsSync } from "node:fs";
import { join } from "node:path";

import type { IconKey } from "../model/types.ts";
import { COLORS, font } from "./theme.ts";

export type ViewWidget = View;

const ICON_DIR_CANDIDATES: string[] = (() => {
  const candidates: string[] = [];
  try {
    if (typeof __dirname === "string") candidates.push(join(__dirname, "assets", "icons"));
  } catch {
    // `__dirname` is supplied by the CommonJS host; ignore when absent.
  }
  candidates.push(join(process.cwd(), "src", "assets", "icons"));
  candidates.push(join(process.cwd(), "apps", "kitchen-helper", "src", "assets", "icons"));
  return candidates;
})();

export function iconPath(icon: IconKey): string | null {
  for (const directory of ICON_DIR_CANDIDATES) {
    const path = join(directory, `${icon}.png`);
    if (existsSync(path)) return path;
  }
  return null;
}

export function addView(
  parent: Widget,
  x: number,
  y: number,
  width: number,
  height: number,
  color: Color = COLORS.panel,
): View {
  const view = View.create();
  view.setParent(parent);
  view.setIgnoreLayout(true);
  view.setPosition([x, y, 0]);
  view.setSize([width, height, 0]);
  view.getLocalStyle().setBackgroundColor(color);
  return view;
}

export function addBoard(
  parent: Widget,
  x: number,
  y: number,
  width: number,
  height: number,
  color: Color = COLORS.background,
): Board {
  const board = Board.create(width, height);
  board.setParent(parent);
  board.setIgnoreLayout(true);
  board.setPosition([x, y, 0]);
  board.setSize([width, height, 0]);
  board.getLocalStyle().setBackgroundColor(color);
  return board;
}

export interface Panel {
  readonly outer: View;
  readonly inner: View;
}

/** A 1 px border expressed as two nested views (the public style API has no border radius). */
export function addPanel(
  parent: Widget,
  x: number,
  y: number,
  width: number,
  height: number,
  options: { fill?: Color; border?: Color; borderWidth?: number; parent?: Widget } = {},
): Panel {
  const borderWidth = options.borderWidth ?? 1;
  const outer = addView(
    options.parent ?? parent,
    x,
    y,
    width,
    height,
    options.border ?? COLORS.border,
  );
  const inner = addView(
    outer,
    borderWidth,
    borderWidth,
    Math.max(0, width - borderWidth * 2),
    Math.max(0, height - borderWidth * 2),
    options.fill ?? COLORS.panel,
  );
  return { outer, inner };
}

export interface TextOptions {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly size: number;
  readonly color?: Color;
  readonly align?: TextAlign;
  readonly bold?: boolean;
  readonly text?: string;
  readonly wrap?: boolean;
  readonly opacity?: number;
  /** Extra pixels between wrapped lines; defaults to 20% of the font size. */
  readonly lineSpace?: number;
}

export function addText(parent: Widget, options: TextOptions): Text {
  const label = Text.create();
  label.setParent(parent);
  label.setIgnoreLayout(true);
  label.setPosition([options.x, options.y, 0]);
  label.setSize([options.width, options.height, 0]);
  const style = label.getLocalStyle();
  style.setTextColor(options.color ?? COLORS.text);
  style.setTextAlign(options.align ?? TextAlign.LEFT_MID);
  const loaded = font(options.size, options.bold ?? false);
  if (loaded) style.setTextFont(loaded);
  if (options.opacity !== undefined) style.setTextOpacity(options.opacity);
  style.setTextLineSpace(options.lineSpace ?? Math.max(2, Math.round(options.size * 0.22)));
  label.setLongMode(options.wrap === false ? Text.LongMode.LONG_DOT_END : Text.LongMode.LONG_WRAP);
  label.setText(options.text ?? "");
  return label;
}

export function addIcon(
  parent: Widget,
  icon: IconKey,
  x: number,
  y: number,
  size: number,
  options: { opacity?: number } = {},
): Image | null {
  const path = iconPath(icon);
  if (!path) return null;
  const image = Image.create();
  image.setParent(parent);
  image.setIgnoreLayout(true);
  image.setPosition([x, y, 0]);
  image.setSize([size, size, 0]);
  const style = image.getLocalStyle();
  if (options.opacity !== undefined) style.setImageOpacity(options.opacity);
  image.onDataCompletion.add((code: number, source: string) => {
    if (code !== 0) console.log("KITCHEN_ICON_ERROR " + JSON.stringify({ code, source }));
  });
  image.setSource(path);
  return image;
}

export function addDivider(
  parent: Widget,
  x: number,
  y: number,
  width: number,
  color: Color = COLORS.borderSoft,
): View {
  return addView(parent, x, y, width, 1, color);
}

export function updateText(label: Text | null | undefined, value: string): void {
  if (!label) return;
  if (label.getText() !== value) label.setText(value);
}

export function updateColor(label: Text | null | undefined, color: Color): void {
  label?.getLocalStyle().setTextColor(color);
}

export function updateBackground(view: View | null | undefined, color: Color): void {
  view?.getLocalStyle().setBackgroundColor(color);
}

export function updateOpacity(widget: Widget | null | undefined, opacity: number): void {
  widget?.getLocalStyle().setOpacity(opacity);
}

export function moveTo(widget: Widget | null | undefined, x: number, y: number): void {
  if (!widget) return;
  widget.setPosition([x, y, 0]);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(1, maxLength - 1))}…`;
}

/** 0..1 progress bar: a filled view inside a track. */
export interface ProgressBar {
  readonly track: View;
  readonly fill: View;
  readonly width: number;
}

export function addProgressBar(
  parent: Widget,
  x: number,
  y: number,
  width: number,
  height: number,
  color: Color = COLORS.orange,
  trackColor: Color = COLORS.borderSoft,
): ProgressBar {
  const track = addView(parent, x, y, width, height, trackColor);
  // A zero-width native View can stall the simulator's first scene, so the
  // fill starts full-width and is resized immediately by the first update.
  const fill = addView(track, 0, 0, width, height, color);
  return { track, fill, width };
}

export function setProgress(bar: ProgressBar, ratio: number): void {
  const clamped = clamp(ratio, 0, 1);
  // A zero-width native View can stall the simulator's first scene; keep at
  // least a hairline so an empty progress bar is still a valid widget.
  const width = Math.max(1, Math.round(bar.width * clamped));
  const current = Number.parseFloat(bar.fill.getWidth());
  if (Math.abs(current - width) > 0.4) bar.fill.setWidth(width);
}

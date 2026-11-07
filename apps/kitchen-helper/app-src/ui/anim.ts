/**
 * Frame-driven micro-animations for the HUD.
 *
 * The MVP simulator profile rejects native AnimationPlayback clips, so the app
 * animates the public `Style.opacity` value directly from its own clock. This
 * keeps every effect deterministic, testable and safe on any backend.
 *
 * The API mirrors the helpers the screens use; translation and scale are
 * intentionally not animated (border/fill changes carry focus).
 */

import type { Widget } from "@irisview/osx/fusionui";

interface OpacityEntry {
  readonly widget: Widget;
  readonly kind: "fade" | "pulse";
  readonly durationMs: number;
  readonly from: number;
  readonly to: number;
  readonly delayMs: number;
  startMs: number | null;
  readonly onDone?: () => void;
  done: boolean;
}

function clampOpacity(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(0, Math.min(1, value));
}

const entries: OpacityEntry[] = [];

/** Keeps animation entries alive for as long as the owning screen exists. */
export class PlaybackKeeper {
  private readonly owned: OpacityEntry[] = [];

  track(entry: OpacityEntry): void {
    this.owned.push(entry);
    entries.push(entry);
  }

  clear(): void {
    for (const entry of this.owned) {
      entry.done = true;
      const index = entries.indexOf(entry);
      if (index >= 0) entries.splice(index, 1);
    }
    this.owned.length = 0;
  }
}

function setOpacity(widget: Widget, value: number): void {
  try {
    if (widget.getValid()) widget.getLocalStyle().setOpacity(clampOpacity(value));
  } catch {
    // A widget can be disposed between updates; opacity is cosmetic.
  }
}

function addFade(
  widget: Widget,
  keeper: PlaybackKeeper,
  options: { from: number; to: number; durationMs: number; delayMs?: number; onDone?: () => void },
): void {
  const entry: OpacityEntry = {
    widget,
    kind: "fade",
    durationMs: Math.max(16, options.durationMs),
    from: clampOpacity(options.from),
    to: clampOpacity(options.to),
    delayMs: Math.max(0, options.delayMs ?? 0),
    startMs: null,
    onDone: options.onDone,
    done: false,
  };
  setOpacity(widget, entry.from);
  keeper.track(entry);
}

function addPulse(
  widget: Widget,
  keeper: PlaybackKeeper,
  options: { min: number; max: number; durationMs: number; delayMs?: number },
): void {
  const entry: OpacityEntry = {
    widget,
    kind: "pulse",
    durationMs: Math.max(64, options.durationMs),
    from: clampOpacity(options.min),
    to: clampOpacity(options.max),
    delayMs: Math.max(0, options.delayMs ?? 0),
    startMs: null,
    done: false,
  };
  setOpacity(widget, entry.from);
  keeper.track(entry);
}

/** Called once per rendered frame by the screen router. */
export function tickAnimations(nowMs: number): void {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (!entry || entry.done) continue;
    let valid = true;
    try {
      valid = entry.widget.getValid();
    } catch {
      valid = false;
    }
    if (!valid) {
      entry.done = true;
      entries.splice(index, 1);
      continue;
    }
    if (entry.startMs === null) entry.startMs = nowMs + entry.delayMs;
    const elapsed = nowMs - entry.startMs;
    if (elapsed < 0) continue;
    if (entry.kind === "pulse") {
      const wave = 0.5 - 0.5 * Math.cos((elapsed / entry.durationMs) * Math.PI * 2);
      setOpacity(entry.widget, entry.from + (entry.to - entry.from) * wave);
      continue;
    }
    const ratio = Math.min(1, elapsed / entry.durationMs);
    const eased = 1 - (1 - ratio) * (1 - ratio);
    setOpacity(entry.widget, entry.from + (entry.to - entry.from) * eased);
    if (ratio >= 1) {
      entry.done = true;
      entries.splice(index, 1);
      entry.onDone?.();
    }
  }
}

/** Fade a widget in. */
export function fadeIn(
  widget: Widget,
  keeper: PlaybackKeeper,
  options: { durationMs?: number; from?: number; translateY?: number; delayMs?: number } = {},
): void {
  void options.translateY;
  addFade(widget, keeper, {
    from: options.from ?? 0,
    to: 1,
    durationMs: options.durationMs ?? 240,
    delayMs: options.delayMs,
  });
}

/** Softer entrance for cards and modal panels. */
export function popIn(
  widget: Widget,
  keeper: PlaybackKeeper,
  options: { durationMs?: number; from?: number; translateY?: number } = {},
): void {
  void options.translateY;
  addFade(widget, keeper, {
    from: options.from ?? 0,
    to: 1,
    durationMs: options.durationMs ?? 220,
  });
}

/** Entrance used for side content. */
export function slideIn(
  widget: Widget,
  keeper: PlaybackKeeper,
  options: { offsetX?: number; from?: number; durationMs?: number } = {},
): void {
  void options.offsetX;
  addFade(widget, keeper, {
    from: options.from ?? 0,
    to: 1,
    durationMs: options.durationMs ?? 260,
  });
}

/** Infinite soft opacity pulse. */
export function pulseOpacity(
  widget: Widget,
  keeper: PlaybackKeeper,
  options: { min?: number; max?: number; durationMs?: number; delayMs?: number } = {},
): void {
  addPulse(widget, keeper, {
    min: options.min ?? 0.35,
    max: options.max ?? 1,
    durationMs: options.durationMs ?? 1_100,
    delayMs: options.delayMs ?? 0,
  });
}

/** Attention pulse for icons; scale is replaced with a safe opacity pulse. */
export function pulseScale(
  widget: Widget,
  keeper: PlaybackKeeper,
  options: { min?: number; max?: number; durationMs?: number; delayMs?: number } = {},
): void {
  addPulse(widget, keeper, {
    min: Math.min(options.min ?? 0.82, 0.9),
    max: options.max ?? 1,
    durationMs: options.durationMs ?? 1_300,
    delayMs: options.delayMs ?? 0,
  });
}

/** UI focus is expressed with borders/fills; kept for API completeness. */
export function scaleTo(
  widget: Widget,
  keeper: PlaybackKeeper,
  target: number,
  durationMs = 160,
): void {
  void widget;
  void keeper;
  void target;
  void durationMs;
}

/** Fade a detached widget out, then dispose it. */
export function fadeOutAndDispose(widget: Widget, keeper: PlaybackKeeper, durationMs = 180): void {
  addFade(widget, keeper, {
    from: 1,
    to: 0,
    durationMs,
    onDone: () => {
      try {
        if (widget.getValid()) widget.dispose(true);
      } catch {
        // Already disposed with its screen.
      }
    },
  });
}

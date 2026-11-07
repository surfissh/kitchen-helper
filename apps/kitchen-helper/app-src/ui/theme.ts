/** Visual language for the 640×480 monocular AR HUD. */

import { Color } from "@irisview/osx/fusionui";
import { Font } from "@irisview/osx/fusionui";
import type { RecommendedRecipe } from "../model/types.ts";

export const HUD_WIDTH = 640;
export const HUD_HEIGHT = 480;

export const LAYOUT = {
  margin: 24,
  contentWidth: 592,
  headerTop: 10,
  headerHeight: 40,
  contentTop: 58,
  footerTop: 444,
  footerHeight: 36,
} as const;

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a?: number;
}

function make(rgb: Rgb): Color {
  return rgb.a === undefined
    ? Color.fromRGB8(rgb.r, rgb.g, rgb.b)
    : Color.fromRGBA8(rgb.r, rgb.g, rgb.b, Math.round(rgb.a * 255));
}

export const COLORS = {
  background: make({ r: 5, g: 8, b: 13 }),
  panel: make({ r: 14, g: 21, b: 30 }),
  panelRaised: make({ r: 20, g: 30, b: 41 }),
  panelFocus: make({ r: 28, g: 43, b: 58 }),
  border: make({ r: 39, g: 56, b: 74 }),
  borderSoft: make({ r: 28, g: 41, b: 56 }),
  text: make({ r: 232, g: 238, b: 245 }),
  textMuted: make({ r: 150, g: 166, b: 184 }),
  textFaint: make({ r: 100, g: 116, b: 134 }),
  orange: make({ r: 255, g: 159, b: 67 }),
  orangeSoft: make({ r: 255, g: 184, b: 107 }),
  orangeDim: make({ r: 96, g: 62, b: 30 }),
  teal: make({ r: 45, g: 212, b: 191 }),
  tealDim: make({ r: 21, g: 78, b: 71 }),
  yellow: make({ r: 250, g: 204, b: 21 }),
  green: make({ r: 74, g: 222, b: 128 }),
  red: make({ r: 248, g: 113, b: 113 }),
  pink: make({ r: 249, g: 168, b: 212 }),
  purple: make({ r: 167, g: 139, b: 250 }),
  blue: make({ r: 125, g: 211, b: 252 }),
  overlay: make({ r: 2, g: 5, b: 9, a: 0.86 }),
  shadow: make({ r: 0, g: 0, b: 0, a: 0.5 }),
  white: make({ r: 255, g: 255, b: 255 }),
  transparent: make({ r: 0, g: 0, b: 0, a: 0 }),
} as const;

export function accentFor(accent: RecommendedRecipe["accent"]): Color {
  switch (accent) {
    case "orange":
      return COLORS.orange;
    case "teal":
      return COLORS.teal;
    case "pink":
      return COLORS.pink;
  }
}

const fontCache = new Map<string, Font>();

/** Cached font lookup; returns null when the platform has no font backend. */
export function font(size: number, bold = false): Font | null {
  const key = `${size}:${bold ? 1 : 0}`;
  const cached = fontCache.get(key);
  if (cached) return cached;
  const loaded = Font.getCachedFont("", size, bold ? 1 : 0, 0);
  if (loaded) fontCache.set(key, loaded);
  return loaded;
}

export const FONT_SIZE = {
  tiny: 13,
  caption: 15,
  small: 16,
  body: 18,
  label: 20,
  title: 26,
  heading: 30,
  hero: 36,
  display: 44,
} as const;

/** Background layer shared by every screen. */

import type { Widget } from "@irisview/osx/fusionui";

import { COLORS } from "./theme.ts";
import { addView } from "./widgets.ts";

export function drawBackground(parent: Widget): void {
  addView(parent, 0, 0, 640, 480, COLORS.background);
  addView(parent, 0, 0, 640, 2, COLORS.orangeDim);
  addView(parent, 0, 478, 640, 2, COLORS.borderSoft);
}

/** Error screen for network, model and forced (`*`) test failures. */

import { TextAlign } from "@irisview/osx/fusionui";
import type { Widget } from "@irisview/osx/fusionui";

import { pick, text } from "../model/i18n.ts";
import type { AppState, UiLanguage } from "../model/types.ts";
import { fadeIn, pulseOpacity, pulseScale } from "./anim.ts";
import { BaseScreen } from "./screen.ts";
import { COLORS, FONT_SIZE } from "./theme.ts";
import { addIcon, addPanel, addText, truncate } from "./widgets.ts";

export class ErrorScreen extends BaseScreen {
  constructor(parent: Widget, language: UiLanguage, state: AppState) {
    super(parent, language);
    const error = state.error?.error;
    const icon = addIcon(this.container, "warning", 282, 44, 76);
    if (icon) {
      pulseScale(icon, this.keeper, { min: 0.95, max: 1.06, durationMs: 1_100 });
      pulseOpacity(icon, this.keeper, { min: 0.7, max: 1, durationMs: 1_100 });
    }
    if (error?.code === "forced") {
      const badge = addPanel(this.container, 246, 134, 148, 32, {
        fill: COLORS.panelRaised,
        border: COLORS.red,
      });
      addText(badge.inner, {
        x: 6,
        y: 2,
        width: 136,
        height: 28,
        size: FONT_SIZE.caption,
        bold: true,
        color: COLORS.red,
        align: TextAlign.CENTER,
        text: "TEST · *",
        wrap: false,
      });
    }

    const fallbackTitle = { zh: text("errorTitle", "zh"), en: text("errorTitle", "en") };
    addText(this.container, {
      x: 24,
      y: 180,
      width: 592,
      height: 46,
      size: FONT_SIZE.heading,
      bold: true,
      align: TextAlign.CENTER,
      text: pick(error?.title ?? fallbackTitle, language),
      wrap: false,
    });
    addText(this.container, {
      x: 56,
      y: 234,
      width: 528,
      height: 66,
      size: FONT_SIZE.body,
      color: COLORS.textMuted,
      align: TextAlign.CENTER,
      text: pick(error?.message ?? { zh: "", en: "" }, language),
      wrap: true,
    });
    addText(this.container, {
      x: 72,
      y: 306,
      width: 496,
      height: 44,
      size: FONT_SIZE.tiny,
      color: COLORS.textFaint,
      align: TextAlign.CENTER,
      text: error ? truncate(error.detail, 120) : "",
      wrap: true,
    });

    if (error?.canRetry) {
      const cta = addPanel(this.container, 140, 358, 360, 60, {
        fill: COLORS.panelFocus,
        border: COLORS.orange,
        borderWidth: 2,
      });
      addIcon(cta.inner, "arrow-right", 26, 17, 26);
      addText(cta.inner, {
        x: 64,
        y: 12,
        width: 280,
        height: 36,
        size: FONT_SIZE.label,
        bold: true,
        text: text("errorRetry", language),
      });
      pulseOpacity(cta.outer, this.keeper, { min: 0.86, max: 1, durationMs: 1_200 });
    }
    addText(this.container, {
      x: 24,
      y: 434,
      width: 592,
      height: 24,
      size: FONT_SIZE.caption,
      color: COLORS.textFaint,
      align: TextAlign.CENTER,
      text: text("errorHome", language),
      wrap: false,
    });

    fadeIn(this.container, this.keeper, { from: 0.15, translateY: 0, durationMs: 200 });
  }

  update(_state: AppState): void {
    // Static: the controller replaces this screen for each new failure.
  }
}

/** Avoids a non-null assertion when only the screen's static content matters. */
export function errorTitleFor(state: AppState, language: UiLanguage): string {
  const error = state.error?.error;
  return error ? pick(error.title, language) : "";
}

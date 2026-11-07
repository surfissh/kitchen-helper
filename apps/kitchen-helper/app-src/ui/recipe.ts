/** Recipe summary screen shown after structuring, before preparation. */

import { TextAlign } from "@irisview/osx/fusionui";
import type { Widget } from "@irisview/osx/fusionui";

import { formatMinutes, formatStars, pick, text } from "../model/i18n.ts";
import type { AppState, IconKey, Recipe, UiLanguage } from "../model/types.ts";
import { fadeIn, popIn, pulseOpacity } from "./anim.ts";
import { BaseScreen } from "./screen.ts";
import { COLORS, FONT_SIZE } from "./theme.ts";
import { addIcon, addPanel, addText } from "./widgets.ts";

export class RecipeScreen extends BaseScreen {
  constructor(parent: Widget, language: UiLanguage, recipe: Recipe) {
    super(parent, language);
    const structured = recipe.source.extractedBy === "deepseek";

    addText(this.container, {
      x: 24,
      y: 20,
      width: 592,
      height: 84,
      size: FONT_SIZE.hero,
      bold: true,
      text: pick(recipe.title, language),
      wrap: true,
    });
    addText(this.container, {
      x: 24,
      y: 104,
      width: 592,
      height: 76,
      size: FONT_SIZE.small,
      color: COLORS.textMuted,
      text: pick(recipe.summary, language),
      wrap: true,
    });

    const chips: { icon: IconKey; label: string; value: string }[] = [
      {
        icon: "sparkle",
        label: text("difficulty", language),
        value: formatStars(recipe.difficulty),
      },
      {
        icon: "clock",
        label: text("duration", language),
        value: formatMinutes(recipe.totalMinutes, language),
      },
      { icon: "bowl", label: text("servings", language), value: pick(recipe.servings, language) },
      {
        icon: "flame",
        label: text("calories", language),
        value: recipe.caloriesKcal ? `${recipe.caloriesKcal} ${text("kcalUnit", language)}` : "—",
      },
    ];
    chips.forEach((chip, index) => {
      const panel = addPanel(this.container, 24 + index * 150, 186, 140, 74, {
        fill: COLORS.panelRaised,
        border: COLORS.borderSoft,
      });
      addIcon(panel.inner, chip.icon, 12, 10, 20);
      addText(panel.inner, {
        x: 38,
        y: 6,
        width: 94,
        height: 20,
        size: FONT_SIZE.tiny,
        color: COLORS.textFaint,
        text: chip.label,
        wrap: false,
      });
      addText(panel.inner, {
        x: 12,
        y: 30,
        width: 116,
        height: 34,
        size: index === 0 ? FONT_SIZE.caption : FONT_SIZE.small,
        bold: true,
        color: index === 0 ? COLORS.orangeSoft : COLORS.text,
        text: chip.value,
        wrap: false,
      });
      popIn(panel.outer, this.keeper, { durationMs: 240, from: 0.94 });
    });

    const info: { icon: IconKey; title: string; value: string }[] = [
      {
        icon: "tomato",
        title: text("ingredientsCount", language),
        value: `${recipe.ingredients.length} ${language === "zh" ? "种" : "items"}`,
      },
      {
        icon: "pan",
        title: text("cookwareCount", language),
        value: `${recipe.cookware.length} ${language === "zh" ? "件" : "items"}`,
      },
      {
        icon: "tap",
        title: text("stepsCount", language),
        value: `${recipe.steps.length} ${language === "zh" ? "步" : "steps"}`,
      },
    ];
    info.forEach((item, index) => {
      const panel = addPanel(this.container, 24 + index * 202, 272, 186, 82, {
        fill: COLORS.panel,
        border: COLORS.borderSoft,
      });
      addIcon(panel.inner, item.icon, 14, 22, 34);
      addText(panel.inner, {
        x: 58,
        y: 14,
        width: 116,
        height: 24,
        size: FONT_SIZE.tiny,
        color: COLORS.textFaint,
        text: item.title,
        wrap: false,
      });
      addText(panel.inner, {
        x: 58,
        y: 40,
        width: 116,
        height: 30,
        size: FONT_SIZE.label,
        bold: true,
        text: item.value,
        wrap: false,
      });
    });

    const ingredientLine = recipe.ingredients
      .slice(0, 5)
      .map((item) => pick(item.name, language))
      .join(" · ");
    addText(this.container, {
      x: 24,
      y: 364,
      width: 592,
      height: 24,
      size: FONT_SIZE.tiny,
      color: COLORS.textMuted,
      text: ingredientLine,
      wrap: false,
    });

    const cta = addPanel(this.container, 24, 392, 592, 58, {
      fill: COLORS.panelFocus,
      border: COLORS.orange,
      borderWidth: 2,
    });
    addIcon(cta.inner, "check", 20, 16, 26);
    addText(cta.inner, {
      x: 58,
      y: 12,
      width: 480,
      height: 34,
      size: FONT_SIZE.label,
      bold: true,
      text: text("recipeStart", language),
    });
    addIcon(cta.inner, "arrow-right", 548, 16, 26);
    pulseOpacity(cta.outer, this.keeper, { min: 0.86, max: 1, durationMs: 1_200 });

    addText(this.container, {
      x: 24,
      y: 454,
      width: 592,
      height: 20,
      size: FONT_SIZE.tiny,
      color: COLORS.textFaint,
      align: TextAlign.RIGHT_MID,
      text: `${text("sourceLabel", language)}: HowToCook · ${text(structured ? "aiStructured" : "localStructured", language)}`,
      wrap: false,
    });
    fadeIn(this.container, this.keeper, { from: 0.15, durationMs: 180, delayMs: 20 });
  }

  update(_state: AppState): void {
    // Static screen: the controller replaces it when a new recipe loads.
  }
}

/**
 * Home: recommended dishes and the "press confirm to speak" entry point.
 * No header or footer chrome — only the core content, with oversized type and
 * roughly 1.7 cards visible per row.
 *
 * The recommendation area is a fixed two-slot window into the recommendation
 * list (slot 0 = current dish, slot 1 = next dish). The carousel rotates by
 * swapping the contents of those slots; no widget geometry is animated at
 * runtime. The simulator's composition path rejects frames that move styled
 * widgets or re-render a moved parent's text layers — the display freezes with
 * "Composition geometry proof rejected" / "The display could not be updated"
 * and the Client reports the app as needing attention — so card geometry must
 * stay fixed after the first presentation.
 */

import { TextAlign } from "@irisview/osx/fusionui";
import type { Image, Text, View, Widget } from "@irisview/osx/fusionui";

import { formatMinutes, formatStars, pick, text } from "../model/i18n.ts";
import { recommended } from "../model/state.ts";
import type { AppState, IconKey, RecommendedRecipe, UiLanguage } from "../model/types.ts";
import { fadeIn, popIn, pulseOpacity, pulseScale } from "./anim.ts";
import { BaseScreen } from "./screen.ts";
import { COLORS, FONT_SIZE } from "./theme.ts";
import { addIcon, addPanel, addText, iconPath, updateBackground, updateText } from "./widgets.ts";

const CARD_WIDTH = 360;
const CARD_GAP = 16;
const STEP = CARD_WIDTH + CARD_GAP;
const LEFT = 24;
/** Cards that fit on the HUD at once (the right one is clipped by the surface). */
const VISIBLE_CARDS = 2;

interface HomeCardSlot {
  /** Position of this slot inside the visible row (0 = focused / leftmost). */
  readonly slot: number;
  readonly outer: View;
  readonly inner: View;
  readonly title: Text;
  readonly subtitle: Text;
  readonly meta: Text;
  icon: Image | null;
  iconKey: IconKey | null;
  recipe: RecommendedRecipe | null;
}

export class HomeScreen extends BaseScreen {
  private readonly hero: View;
  private readonly micIcon: Image | null;
  private readonly cards: HomeCardSlot[] = [];
  private readonly completedLabel: Text;
  private readonly lastDishLabel: Text;
  private carouselIndex = -1;

  constructor(parent: Widget, language: UiLanguage) {
    super(parent, language);
    addText(this.container, {
      x: 24,
      y: 22,
      width: 592,
      height: 46,
      size: FONT_SIZE.hero,
      bold: true,
      text: text("homeTitle", language),
      wrap: false,
    });
    addText(this.container, {
      x: 24,
      y: 76,
      width: 560,
      height: 28,
      size: FONT_SIZE.small,
      color: COLORS.textMuted,
      text: text("homeSubtitle", language),
      wrap: false,
    });

    const cta = addPanel(this.container, 24, 116, 592, 104, {
      fill: COLORS.panelRaised,
      border: COLORS.orange,
      borderWidth: 2,
    });
    this.hero = cta.outer;
    this.micIcon = addIcon(cta.inner, "mic", 22, 27, 50);
    if (this.micIcon)
      pulseOpacity(this.micIcon, this.keeper, { min: 0.5, max: 1, durationMs: 950 });
    addText(cta.inner, {
      x: 88,
      y: 16,
      width: 420,
      height: 40,
      size: FONT_SIZE.label,
      bold: true,
      text: text("homeSpeakCta", language),
    });
    addText(cta.inner, {
      x: 88,
      y: 58,
      width: 440,
      height: 28,
      size: FONT_SIZE.caption,
      color: COLORS.textMuted,
      text: language === "zh" ? "说出菜名，比如「番茄炒蛋」" : "Say a dish, e.g. “tomato and eggs”",
    });
    addIcon(cta.inner, "arrow-right", 534, 36, 26);
    fadeIn(this.hero, this.keeper, { from: 0.3, durationMs: 280 });

    addIcon(this.container, "sparkle", 24, 240, 20);
    addText(this.container, {
      x: 52,
      y: 232,
      width: 280,
      height: 34,
      size: FONT_SIZE.label,
      bold: true,
      text: text("homeRecommend", language),
    });
    this.completedLabel = addText(this.container, {
      x: 300,
      y: 232,
      width: 316,
      height: 34,
      size: FONT_SIZE.caption,
      color: COLORS.textFaint,
      align: TextAlign.RIGHT_MID,
      text: "",
    });

    const dishes = recommended();
    for (let slot = 0; slot < VISIBLE_CARDS; slot += 1) {
      const focused = slot === 0;
      const recipe = dishes[slot % dishes.length] as RecommendedRecipe;
      const panel = addPanel(this.container, LEFT + slot * STEP, 276, CARD_WIDTH, 158, {
        fill: focused ? COLORS.panelFocus : COLORS.panel,
        border: focused ? accentFor(recipe) : COLORS.borderSoft,
      });
      const icon = addIcon(panel.inner, recipe.icon, 18, 20, 40, focused ? {} : { opacity: 0.7 });
      const title = addText(panel.inner, {
        x: 72,
        y: 18,
        width: 270,
        height: 34,
        size: FONT_SIZE.label,
        bold: true,
        text: pick(recipe.title, language),
        wrap: false,
        opacity: focused ? 1 : 0.82,
      });
      const subtitle = addText(panel.inner, {
        x: 18,
        y: 70,
        width: 324,
        height: 30,
        size: FONT_SIZE.caption,
        color: COLORS.textMuted,
        text: pick(recipe.subtitle, language),
      });
      const meta = addText(panel.inner, {
        x: 18,
        y: 112,
        width: 324,
        height: 28,
        size: FONT_SIZE.caption,
        color: COLORS.orangeSoft,
        text: `${formatStars(recipe.difficulty)}  ·  ${formatMinutes(recipe.minutes, language)}`,
        wrap: false,
      });
      this.cards.push({
        slot,
        outer: panel.outer,
        inner: panel.inner,
        title,
        subtitle,
        meta,
        icon,
        iconKey: recipe.icon,
        recipe,
      });
      popIn(panel.outer, this.keeper, { durationMs: 260, from: 0.95 });
    }

    this.lastDishLabel = addText(this.container, {
      x: 24,
      y: 446,
      width: 592,
      height: 22,
      size: FONT_SIZE.tiny,
      color: COLORS.textFaint,
      align: TextAlign.CENTER,
      text: text("homeNoRecent", language),
      wrap: false,
    });
    pulseScale(this.micIcon ?? this.hero, this.keeper, { min: 0.96, max: 1, durationMs: 1_500 });
  }

  update(state: AppState): void {
    const dishes = recommended();
    const index = state.home.carouselIndex % dishes.length;
    if (index !== this.carouselIndex) {
      this.carouselIndex = index;
      // Content swap only: every widget keeps its creation geometry. Combining
      // position animation with style/opacity changes (or re-rendering text in
      // a moved parent) makes the simulator reject the composition.
      this.cards.forEach((card) => {
        const dish = dishes[(index + card.slot) % dishes.length] as RecommendedRecipe;
        this.bindSlot(card, dish);
        updateBackground(card.outer, card.slot === 0 ? accentFor(dish) : COLORS.borderSoft);
      });
    }
    const completedText = text("homeCompleted", this.language, { n: state.home.completedCount });
    updateText(
      this.completedLabel,
      `${state.home.lastDish ? `${text("homeRecent", this.language)} · ` : ""}${completedText}`,
    );
    updateText(
      this.lastDishLabel,
      state.home.lastDish
        ? `${text("homeRecent", this.language)} · ${pick(state.home.lastDish, this.language)} · ${completedText}`
        : text("homeNoRecent", this.language),
    );
  }

  /** Replace one slot's contents; the slot keeps its position and size. */
  private bindSlot(card: HomeCardSlot, recipe: RecommendedRecipe): void {
    if (card.recipe === recipe) return;
    card.recipe = recipe;
    updateText(card.title, pick(recipe.title, this.language));
    updateText(card.subtitle, pick(recipe.subtitle, this.language));
    updateText(
      card.meta,
      `${formatStars(recipe.difficulty)}  ·  ${formatMinutes(recipe.minutes, this.language)}`,
    );
    if (card.icon && card.iconKey !== recipe.icon) {
      const path = iconPath(recipe.icon);
      if (path) {
        card.iconKey = recipe.icon;
        card.icon.setSource(path);
      }
    }
  }
}

function accentFor(recipe: RecommendedRecipe) {
  switch (recipe.accent) {
    case "orange":
      return COLORS.orange;
    case "teal":
      return COLORS.teal;
    case "pink":
      return COLORS.pink;
  }
}

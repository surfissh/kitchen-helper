/**
 * Preparation screen: one large horizontal card row for ingredients and one for
 * cookware. Roughly 1.7 cards fit on screen, matching the glasses' glanceable
 * 640×480 HUD. Only the cards around the focus are instantiated so the scene
 * stays light enough for the simulator.
 */

import { TextAlign } from "@irisview/osx/fusionui";
import type { Image, Text, View, Widget } from "@irisview/osx/fusionui";

import { pick, text } from "../model/i18n.ts";
import { prepCounts, visiblePrepItems } from "../model/state.ts";
import type { AppState, FocusRow, PrepItem, UiLanguage } from "../model/types.ts";
import { fadeIn, popIn, pulseOpacity, pulseScale } from "./anim.ts";
import { BaseScreen } from "./screen.ts";
import { COLORS, FONT_SIZE } from "./theme.ts";
import {
  addIcon,
  addPanel,
  addProgressBar,
  addText,
  addView,
  clamp,
  setProgress,
  updateBackground,
  updateColor,
  updateText,
  type ProgressBar,
} from "./widgets.ts";

const CARD_WIDTH = 360;
const CARD_GAP = 16;
const STEP = CARD_WIDTH + CARD_GAP;
const LEFT = 24;
const INGREDIENT_TOP = 146;
const INGREDIENT_HEIGHT = 152;
const COOKWARE_TOP = 336;
const COOKWARE_HEIGHT = 112;
const WINDOW_SIZE = 3;

interface PrepCard {
  readonly item: PrepItem;
  readonly row: FocusRow;
  readonly absoluteIndex: number;
  readonly outer: View;
  readonly inner: View;
  readonly icon: Image | null;
  readonly name: Text;
  readonly amount: Text;
}

interface RowChrome {
  readonly icon: Image | null;
  readonly label: Text;
  readonly count: Text;
  readonly empty: Text;
}

interface RowState {
  readonly viewport: View;
  readonly chrome: RowChrome;
  readonly scroll: { current: number; target: number };
  cards: PrepCard[];
}

export class PrepScreen extends BaseScreen {
  private readonly subtitle: Text;
  private readonly progress: ProgressBar;
  private readonly progressLabel: Text;
  private readonly hint: Text;
  private readonly rows: Record<FocusRow, RowState>;
  private readonly readyOverlay: View;
  private readonly readyCheck: Image | null;
  private readonly readyTitle: Text;
  private readonly readyHint: Text;
  private lastRemovedCount = -1;
  private lastFocusRow: FocusRow | null = null;
  private lastFocusIndex = -1;
  private ready = false;

  constructor(parent: Widget, language: UiLanguage, state: AppState) {
    super(parent, language);

    addText(this.container, {
      x: 24,
      y: 18,
      width: 592,
      height: 38,
      size: FONT_SIZE.title,
      bold: true,
      text: text("prepTitle", language),
    });
    this.subtitle = addText(this.container, {
      x: 24,
      y: 56,
      width: 592,
      height: 22,
      size: FONT_SIZE.small,
      color: COLORS.textMuted,
      text: text("prepSubtitle", language),
      wrap: false,
    });
    this.progressLabel = addText(this.container, {
      x: 360,
      y: 82,
      width: 256,
      height: 20,
      size: FONT_SIZE.tiny,
      color: COLORS.orangeSoft,
      align: TextAlign.RIGHT_MID,
      text: "",
      wrap: false,
    });
    this.progress = addProgressBar(this.container, 24, 104, 592, 8, COLORS.orange);

    const ingredient = this.buildRow("ingredients", "prepIngredientsRow", "tomato", INGREDIENT_TOP);
    const cookware = this.buildRow("cookware", "prepCookwareRow", "pan", COOKWARE_TOP);
    this.rows = { ingredients: ingredient, cookware: cookware };

    this.hint = addText(this.container, {
      x: 24,
      y: 454,
      width: 592,
      height: 22,
      size: FONT_SIZE.caption,
      color: COLORS.textFaint,
      align: TextAlign.CENTER,
      text: text("prepRemoveHint", language),
      wrap: false,
    });

    const overlay = addView(this.container, 0, 118, 640, 362, COLORS.background);
    this.readyCheck = addIcon(overlay, "check", 290, 28, 60);
    this.readyTitle = addText(overlay, {
      x: 24,
      y: 100,
      width: 592,
      height: 56,
      size: FONT_SIZE.display,
      bold: true,
      align: TextAlign.CENTER,
      color: COLORS.green,
      text: text("prepReady", language),
      wrap: false,
    });
    this.readyHint = addText(overlay, {
      x: 24,
      y: 164,
      width: 592,
      height: 36,
      size: FONT_SIZE.label,
      align: TextAlign.CENTER,
      color: COLORS.text,
      text: text("prepReadyHint", language),
      wrap: false,
    });
    addText(overlay, {
      x: 24,
      y: 212,
      width: 592,
      height: 24,
      size: FONT_SIZE.caption,
      align: TextAlign.CENTER,
      color: COLORS.textMuted,
      text: language === "zh" ? "深呼吸，我们开始吧" : "Take a breath — let's cook",
      wrap: false,
    });
    overlay.setHidden(true);
    this.readyOverlay = overlay;

    // Build the initial cards before the first scene is presented.
    if (state.prep) {
      this.lastRemovedCount = state.prep.removedIds.length;
      this.lastFocusRow = state.prep.focusRow;
      this.lastFocusIndex = state.prep.focusIndex;
      this.rebuildCards(state);
      this.applyFocus(state);
      this.updateScrollTargets(state);
      this.animateScroll();
    }
    fadeIn(this.container, this.keeper, { from: 0.2, durationMs: 180 });
  }

  private buildRow(
    row: FocusRow,
    key: "prepIngredientsRow" | "prepCookwareRow",
    icon: "tomato" | "pan",
    top: number,
  ): RowState {
    const y = top - 32;
    const iconWidget = addIcon(this.container, icon, 24, y + 2, 22);
    const label = addText(this.container, {
      x: 56,
      y: y - 2,
      width: 300,
      height: 30,
      size: FONT_SIZE.label,
      bold: true,
      color: COLORS.text,
      text: text(key, this.language),
      wrap: false,
    });
    const count = addText(this.container, {
      x: 360,
      y: y - 2,
      width: 256,
      height: 30,
      size: FONT_SIZE.caption,
      color: COLORS.textFaint,
      align: TextAlign.RIGHT_MID,
      text: "",
      wrap: false,
    });
    const viewport = addView(
      this.container,
      0,
      top,
      640,
      row === "ingredients" ? INGREDIENT_HEIGHT : COOKWARE_HEIGHT,
      COLORS.background,
    );
    const empty = addText(viewport, {
      x: 0,
      y: 40,
      width: 640,
      height: 30,
      size: FONT_SIZE.caption,
      color: COLORS.textFaint,
      align: TextAlign.CENTER,
      text: text("prepEmptyRow", this.language),
      wrap: false,
    });
    empty.setHidden(true);
    return {
      viewport,
      chrome: { icon: iconWidget, label, count, empty },
      scroll: { current: 0, target: 0 },
      cards: [],
    };
  }

  update(state: AppState): void {
    if (!state.prep) return;
    const removedCount = state.prep.removedIds.length;
    const cardsChanged = removedCount !== this.lastRemovedCount;
    const focusChanged =
      this.lastFocusRow !== state.prep.focusRow || this.lastFocusIndex !== state.prep.focusIndex;
    if (cardsChanged || focusChanged) {
      this.lastRemovedCount = removedCount;
      this.lastFocusRow = state.prep.focusRow;
      this.lastFocusIndex = state.prep.focusIndex;
      this.rebuildCards(state);
      this.applyFocus(state);
      this.updateScrollTargets(state);
    }

    const counts = prepCounts(state);
    setProgress(this.progress, counts.total === 0 ? 1 : counts.done / counts.total);
    updateText(
      this.progressLabel,
      text("prepProgress", this.language, { done: counts.done, total: counts.total }),
    );
    const ingredientCount = visiblePrepItems(state, "ingredients").length;
    const cookwareCount = visiblePrepItems(state, "cookware").length;
    updateText(this.rows.ingredients.chrome.count, `${ingredientCount}`);
    updateText(this.rows.cookware.chrome.count, `${cookwareCount}`);
    this.rows.ingredients.chrome.empty.setHidden(ingredientCount > 0);
    this.rows.cookware.chrome.empty.setHidden(cookwareCount > 0);
    this.animateScroll();
    this.updateReady(counts.total > 0 && state.prep.ready);
  }

  private rebuildCards(state: AppState): void {
    for (const row of ["ingredients", "cookware"] as FocusRow[]) {
      const rowState = this.rows[row];
      while (rowState.viewport.getChildCount() > 0) rowState.viewport.getChild(0).dispose(true);
      rowState.cards = [];
      const items = visiblePrepItems(state, row);
      const focus = row === state.prep!.focusRow ? state.prep!.focusIndex : 0;
      const start = Math.max(0, focus - 1);
      const end = Math.min(items.length, start + WINDOW_SIZE);
      const height = row === "ingredients" ? INGREDIENT_HEIGHT : COOKWARE_HEIGHT;
      for (let index = start; index < end; index += 1) {
        const item = items[index];
        if (!item) continue;
        const panel = addPanel(rowState.viewport, 0, 0, CARD_WIDTH, height, {
          fill: COLORS.panel,
          border: COLORS.borderSoft,
        });
        panel.outer.setHidden(true);
        const padY = Math.max(18, Math.round((height - 84) / 2));
        const iconWidget = addIcon(panel.inner, item.icon, 20, padY, 48);
        const name = addText(panel.inner, {
          x: 82,
          y: padY - 2,
          width: 258,
          height: 36,
          size: FONT_SIZE.label,
          bold: true,
          text: pick(item.name, this.language),
          wrap: false,
        });
        const amount = addText(panel.inner, {
          x: 82,
          y: padY + 40,
          width: 258,
          height: 30,
          size: FONT_SIZE.small,
          color: COLORS.textMuted,
          text: pick(item.amount, this.language),
          wrap: true,
        });
        rowState.cards.push({
          item,
          row,
          absoluteIndex: index,
          outer: panel.outer,
          inner: panel.inner,
          icon: iconWidget,
          name,
          amount,
        });
        void amount;
      }
    }
    this.animateScroll();
  }

  private applyFocus(state: AppState): void {
    if (!state.prep) return;
    for (const row of ["ingredients", "cookware"] as FocusRow[]) {
      const rowState = this.rows[row];
      const rowFocused = state.prep.focusRow === row;
      updateColor(rowState.chrome.label, rowFocused ? COLORS.orangeSoft : COLORS.text);
      for (const card of rowState.cards) {
        const focused = rowFocused && card.absoluteIndex === state.prep.focusIndex;
        updateBackground(card.outer, focused ? COLORS.orange : COLORS.borderSoft);
        updateBackground(card.inner, focused ? COLORS.panelFocus : COLORS.panel);
        updateColor(card.name, focused ? COLORS.text : COLORS.textMuted);
        updateColor(card.amount, focused ? COLORS.textMuted : COLORS.textFaint);
      }
    }
  }

  private updateScrollTargets(state: AppState): void {
    if (!state.prep) return;
    for (const row of ["ingredients", "cookware"] as FocusRow[]) {
      const rowState = this.rows[row];
      const count = visiblePrepItems(state, row).length;
      const maxOffset = Math.max(0, LEFT + count * STEP - CARD_GAP - 640);
      const focus = row === state.prep.focusRow ? state.prep.focusIndex : 0;
      rowState.scroll.target = clamp(focus * STEP, 0, maxOffset);
    }
  }

  private animateScroll(): void {
    for (const row of ["ingredients", "cookware"] as FocusRow[]) {
      const rowState = this.rows[row];
      const scroll = rowState.scroll;
      const diff = scroll.target - scroll.current;
      scroll.current = Math.abs(diff) < 0.5 ? scroll.target : scroll.current + diff * 0.22;
      for (const card of rowState.cards) {
        const x = LEFT + card.absoluteIndex * STEP - Math.round(scroll.current);
        const visible = x + CARD_WIDTH > 0 && x < 640;
        card.outer.setHidden(!visible);
        if (visible) card.outer.setPositionX(x);
      }
    }
  }

  private updateReady(ready: boolean): void {
    if (ready === this.ready) return;
    this.ready = ready;
    this.readyOverlay.setHidden(!ready);
    this.rows.ingredients.viewport.setHidden(ready);
    this.rows.cookware.viewport.setHidden(ready);
    for (const row of [this.rows.ingredients, this.rows.cookware]) {
      row.chrome.icon?.setHidden(ready);
      row.chrome.label.setHidden(ready);
      row.chrome.count.setHidden(ready);
      row.chrome.empty.setHidden(true);
    }
    this.hint.setHidden(ready);
    updateText(
      this.subtitle,
      ready ? text("prepReadyHint", this.language) : text("prepSubtitle", this.language),
    );
    if (ready) {
      popIn(this.readyOverlay, this.keeper, { durationMs: 240, from: 0.95 });
      if (this.readyCheck) {
        pulseScale(this.readyCheck, this.keeper, { min: 0.9, max: 1, durationMs: 1_000 });
        pulseOpacity(this.readyCheck, this.keeper, { min: 0.65, max: 1, durationMs: 1_000 });
      }
      this.readyTitle.setText(text("prepReady", this.language));
      this.readyHint.setText(text("prepReadyHint", this.language));
    }
  }
}

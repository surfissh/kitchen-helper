/** Guided step screen: big instruction, heat indicator, scrollable notes and timers. */

import { TextAlign } from "@irisview/osx/fusionui";
import type { Image, Text, View, Widget } from "@irisview/osx/fusionui";

import { formatClock, pick, text } from "../model/i18n.ts";
import { currentStep, visibleTimers } from "../model/state.ts";
import type { AppState, RecipeStep, TimerState, UiLanguage } from "../model/types.ts";
import { fadeIn, popIn, pulseOpacity } from "./anim.ts";
import { fitTextBlock, layoutInstruction } from "./instruction-layout.ts";
import { BaseScreen } from "./screen.ts";
import { COLORS, FONT_SIZE } from "./theme.ts";
import {
  addIcon,
  addPanel,
  addProgressBar,
  addText,
  addView,
  setProgress,
  updateBackground,
  updateColor,
  updateText,
  type ProgressBar,
} from "./widgets.ts";

const CARD_X = 24;
const CARD_Y = 52;
const CARD_W = 592;
const CARD_H = 230;
const TIMER_TOP = 292;

interface TimerRow {
  readonly id: string;
  readonly outer: View;
  readonly label: Text;
  readonly value: Text;
  readonly hint: Text;
  readonly bar: ProgressBar;
  readonly clock: Image | null;
  readonly check: Image | null;
  readonly fillColor: View;
}

interface ModalRefs {
  readonly overlay: View;
  readonly answer: Text;
  readonly question: Text;
  readonly thinking: View;
}

export class CookingScreen extends BaseScreen {
  private readonly step: RecipeStep;
  private readonly stepIndex: number;
  private readonly totalSteps: number;
  private instruction!: Text;
  private instructionPages: readonly string[] = [];
  private pageIndex = 0;
  private readonly timerContainer: View;
  private readonly timerRows: TimerRow[] = [];
  private readonly progressDots: View[] = [];
  private readonly upHint: Image | null;
  private readonly downHint: Image | null;
  private readonly askHint: Text;
  private modal: ModalRefs | null = null;
  private timerIds = "";

  constructor(parent: Widget, language: UiLanguage, state: AppState) {
    super(parent, language);
    const step = currentStep(state);
    this.step = step ?? {
      id: "step-1",
      title: { zh: "准备", en: "Ready" },
      instruction: { zh: "按确认继续", en: "Confirm to continue" },
      timers: [],
      heat: 0,
      icon: "other",
    };
    this.stepIndex = state.cooking?.stepIndex ?? 0;
    this.totalSteps = state.recipe?.steps.length ?? 1;
    this.buildHeader();
    this.buildContent();
    this.timerContainer = addView(this.container, 0, TIMER_TOP, 640, 154, COLORS.background);
    this.timerContainer.setChildOverflowVisible(false);
    this.askHint = addText(this.container, {
      x: 46,
      y: 446,
      width: 570,
      height: 20,
      size: FONT_SIZE.caption,
      color: COLORS.textFaint,
      text: text("askHint", language),
      wrap: false,
    });
    addIcon(this.container, "mic", 24, 444, 18, { opacity: 0.8 });
    this.upHint = addIcon(this.container, "arrow-up", 604, 70, 18, { opacity: 0.7 });
    this.downHint = addIcon(this.container, "arrow-down", 604, 218, 18, { opacity: 0.7 });
    const initialTimers = visibleTimers(state).slice(0, 3);
    this.timerIds = initialTimers.map((timer) => timer.id).join("|");
    this.rebuildTimerRows(initialTimers);
    if (state.cooking?.modal) {
      this.buildModal();
      this.updateModal(state);
    }
    fadeIn(this.container, this.keeper, { from: 0.2, translateY: 6, durationMs: 200 });
  }

  private buildHeader(): void {
    const heat = this.step.heat;
    if (heat > 0) {
      const size = 18 + heat * 6;
      addIcon(this.container, "flame", 24, 6 + Math.max(0, (34 - size) / 2), size);
      addText(this.container, {
        x: 24 + size + 8,
        y: 8,
        width: 150,
        height: 32,
        size: FONT_SIZE.caption,
        color: COLORS.orangeSoft,
        text: text(heat === 1 ? "heatLow" : heat === 2 ? "heatMedium" : "heatHigh", this.language),
        wrap: false,
      });
    } else {
      addText(this.container, {
        x: 24,
        y: 8,
        width: 160,
        height: 28,
        size: FONT_SIZE.tiny,
        color: COLORS.textFaint,
        text: text("heatNone", this.language),
        wrap: false,
      });
    }

    addText(this.container, {
      x: 360,
      y: 4,
      width: 256,
      height: 26,
      size: FONT_SIZE.body,
      bold: true,
      color: COLORS.textMuted,
      align: TextAlign.RIGHT_MID,
      text: text("stepLabel", this.language, {
        current: String(this.stepIndex + 1).padStart(2, "0"),
        total: String(this.totalSteps).padStart(2, "0"),
      }),
      wrap: false,
    });
    for (let index = 0; index < this.totalSteps; index += 1) {
      const dot = addView(
        this.container,
        360 + index * 14,
        34,
        9,
        6,
        index < this.stepIndex
          ? COLORS.green
          : index === this.stepIndex
            ? COLORS.orange
            : COLORS.border,
      );
      this.progressDots.push(dot);
    }
    addView(this.container, 0, 44, 640, 1, COLORS.borderSoft);
  }

  private buildContent(): void {
    const panel = addPanel(this.container, CARD_X, CARD_Y, CARD_W, CARD_H, {
      fill: COLORS.panel,
      border: COLORS.borderSoft,
    });
    panel.inner.setChildOverflowVisible(false);

    addText(panel.inner, {
      x: 16,
      y: 10,
      width: 556,
      height: 26,
      size: FONT_SIZE.caption,
      bold: true,
      color: COLORS.orangeSoft,
      text: pick(this.step.title, this.language).toUpperCase(),
      wrap: false,
    });

    // The instruction box is fixed; pick the largest readable size that fits
    // (or split into pages). Vertical centring would clip both the first and
    // the last line of an overflowing block, so the text is top-aligned too.
    const layout = layoutInstruction(pick(this.step.instruction, this.language), {
      width: 552,
      height: 140,
      sizes: [FONT_SIZE.display - 6, 34, 30, 27, 24, 22],
      maxPages: 3,
    });
    this.instructionPages = layout.pages;
    this.instruction = addText(panel.inner, {
      x: 16,
      y: 44,
      width: 552,
      height: 140,
      size: layout.size,
      bold: true,
      align: TextAlign.TOP_LEFT,
      text: layout.pages[0] ?? "",
      wrap: true,
    });

    const tipText = this.step.tip ? pick(this.step.tip, this.language) : "";
    const tip = fitTextBlock(tipText ? `${text("tipPrefix", this.language)} · ${tipText}` : "", {
      width: 510,
      height: 40,
      sizes: [FONT_SIZE.small, FONT_SIZE.tiny, 12],
    });
    addText(panel.inner, {
      x: 16,
      y: 188,
      width: 510,
      height: 40,
      size: tip.size,
      color: COLORS.textMuted,
      align: TextAlign.TOP_LEFT,
      text: tip.text,
      wrap: true,
    });
    addIcon(panel.inner, this.step.icon, 548, 190, 28, { opacity: 0.9 });
  }

  update(state: AppState): void {
    if (this.progressDots.length > 0) this.progressDots[0]?.getValid();
    this.updateInstructionPage(state);
    this.updateTimers(state);
    this.updateModal(state);
    if (state.cooking) this.askHint.setText(text("askHint", this.language));
  }

  /** Map the up/down pager onto the instruction pages that did not fit at once. */
  private updateInstructionPage(state: AppState): void {
    const pageCount = this.instructionPages.length;
    const requested = state.cooking?.scrollPage ?? 0;
    const page = Math.min(requested, Math.max(0, pageCount - 1));
    if (page !== this.pageIndex) {
      this.pageIndex = page;
      const next = this.instructionPages[page] ?? "";
      if (this.instruction.getText() !== next) this.instruction.setText(next);
    }
    this.upHint?.setHidden(pageCount <= 1 || page <= 0);
    this.downHint?.setHidden(pageCount <= 1 || page >= pageCount - 1);
  }

  private updateTimers(state: AppState): void {
    const timers = visibleTimers(state).slice(0, 3);
    const ids = timers.map((timer) => timer.id).join("|");
    if (ids !== this.timerIds) {
      this.timerIds = ids;
      this.rebuildTimerRows(timers);
    }
    timers.forEach((timer, index) => {
      const row = this.timerRows[index];
      if (row) this.paintTimer(row, timer);
    });
  }

  private rebuildTimerRows(timers: readonly TimerState[]): void {
    while (this.timerContainer.getChildCount() > 0) {
      this.timerContainer.getChild(0).dispose(true);
    }
    this.timerRows.length = 0;
    timers.forEach((timer, index) => {
      const y = index * 48;
      const panel = addPanel(this.timerContainer, 24, y, 592, 44, {
        fill: COLORS.panelRaised,
        border: COLORS.borderSoft,
      });
      const clock = addIcon(panel.inner, "clock", 12, 11, 22);
      const check = addIcon(panel.inner, "check", 12, 11, 22);
      check?.setHidden(true);
      const label = addText(panel.inner, {
        x: 42,
        y: 2,
        width: 330,
        height: 22,
        size: FONT_SIZE.small,
        color: COLORS.text,
        text: pick(timer.label, this.language),
        wrap: false,
      });
      const value = addText(panel.inner, {
        x: 396,
        y: 4,
        width: 184,
        height: 28,
        size: FONT_SIZE.label,
        bold: true,
        align: TextAlign.RIGHT_MID,
        color: COLORS.yellow,
        text: formatClock(timer.remainingMs),
        wrap: false,
      });
      const hint = addText(panel.inner, {
        x: 42,
        y: 22,
        width: 380,
        height: 14,
        size: FONT_SIZE.tiny,
        color: COLORS.textFaint,
        text: text("timerIdleHint", this.language),
        wrap: false,
      });
      const bar = addProgressBar(panel.inner, 42, 39, 520, 3, COLORS.yellow, COLORS.borderSoft);
      this.timerRows.push({
        id: timer.id,
        outer: panel.outer,
        label,
        value,
        hint,
        bar,
        clock,
        check,
        fillColor: bar.fill,
      });
    });
  }

  private paintTimer(row: TimerRow, timer: TimerState): void {
    const ratio = timer.totalMs > 0 ? timer.remainingMs / timer.totalMs : 0;
    if (timer.status === "idle") {
      updateText(row.value, formatClock(timer.totalMs));
      updateColor(row.value, COLORS.yellow);
      updateText(row.hint, text("timerIdleHint", this.language));
      row.hint.setHidden(false);
      updateBackground(row.fillColor, COLORS.orangeDim);
      setProgress(row.bar, 1);
      row.check?.setHidden(true);
      row.clock?.setHidden(false);
      return;
    }
    if (timer.status === "running") {
      updateText(row.value, formatClock(timer.remainingMs));
      updateColor(row.value, timer.remainingMs <= 5_000 ? COLORS.red : COLORS.yellow);
      updateText(row.hint, "");
      row.hint.setHidden(true);
      updateBackground(row.fillColor, timer.remainingMs <= 5_000 ? COLORS.red : COLORS.orange);
      setProgress(row.bar, ratio);
      row.check?.setHidden(true);
      row.clock?.setHidden(false);
      return;
    }
    updateText(row.value, text("timerDone", this.language));
    updateColor(row.value, COLORS.green);
    updateText(row.hint, "");
    row.hint.setHidden(true);
    updateBackground(row.fillColor, COLORS.green);
    setProgress(row.bar, 1);
    row.check?.setHidden(false);
    row.clock?.setHidden(true);
  }

  private updateModal(state: AppState): void {
    const modal = state.cooking?.modal ?? null;
    if (!modal) {
      if (this.modal) {
        try {
          if (this.modal.overlay.getValid()) this.modal.overlay.dispose(true);
        } catch {
          // Already released with the screen.
        }
        this.modal = null;
      }
      return;
    }
    if (!this.modal) this.buildModal();
    if (!this.modal) return;
    updateText(this.modal.question, modal.question);
    if (modal.status === "answered") {
      this.modal.thinking.setHidden(true);
      this.modal.answer.setHidden(false);
      updateText(this.modal.answer, pick(modal.answer, this.language));
    } else {
      this.modal.thinking.setHidden(false);
      this.modal.answer.setHidden(true);
    }
  }

  private buildModal(): void {
    const overlay = addView(this.container, 0, 0, 640, 480, COLORS.overlay);
    const panel = addPanel(overlay, 40, 60, 560, 360, {
      fill: COLORS.panelRaised,
      border: COLORS.orange,
      borderWidth: 2,
    });
    addIcon(panel.inner, "chef-hat", 18, 14, 28);
    addText(panel.inner, {
      x: 54,
      y: 12,
      width: 300,
      height: 32,
      size: FONT_SIZE.body,
      bold: true,
      text: text("assistant", this.language),
    });
    addText(panel.inner, {
      x: 380,
      y: 14,
      width: 160,
      height: 26,
      size: FONT_SIZE.tiny,
      color: COLORS.textFaint,
      align: TextAlign.RIGHT_MID,
      text: text("assistantClose", this.language),
      wrap: false,
    });
    addView(panel.inner, 18, 50, 522, 1, COLORS.borderSoft);
    addText(panel.inner, {
      x: 18,
      y: 58,
      width: 522,
      height: 20,
      size: FONT_SIZE.tiny,
      color: COLORS.textFaint,
      text: text("assistantQuestion", this.language),
      wrap: false,
    });
    const question = addText(panel.inner, {
      x: 18,
      y: 80,
      width: 522,
      height: 40,
      size: FONT_SIZE.small,
      color: COLORS.textMuted,
      text: "",
      wrap: true,
    });
    const thinking = addView(panel.inner, 18, 132, 522, 76, COLORS.panelRaised);
    addText(thinking, {
      x: 10,
      y: 8,
      width: 320,
      height: 28,
      size: FONT_SIZE.body,
      color: COLORS.orangeSoft,
      text: text("assistantThinking", this.language),
      wrap: false,
    });
    for (let index = 0; index < 3; index += 1) {
      const dot = addView(thinking, 14 + index * 18, 48, 9, 9, COLORS.orangeSoft);
      pulseOpacity(dot, this.keeper, { min: 0.2, max: 1, durationMs: 700, delayMs: index * 160 });
    }
    const answer = addText(panel.inner, {
      x: 18,
      y: 132,
      width: 522,
      height: 176,
      size: FONT_SIZE.body,
      color: COLORS.text,
      text: "",
      wrap: true,
    });
    answer.setHidden(true);
    addText(panel.inner, {
      x: 18,
      y: 322,
      width: 522,
      height: 22,
      size: FONT_SIZE.tiny,
      color: COLORS.textFaint,
      align: TextAlign.CENTER,
      text: text("assistantClose", this.language),
      wrap: false,
    });
    popIn(panel.outer, this.keeper, { durationMs: 220, from: 0.94, translateY: 8 });
    this.modal = { overlay, answer, question, thinking };
  }
}

/** Loading screen: animated progress while recipe search, fetch and structuring run. */

import { TextAlign } from "@irisview/osx/fusionui";
import type { Image, Text, View, Widget } from "@irisview/osx/fusionui";

import { text } from "../model/i18n.ts";
import type { AppState, IconKey, LoadingPhase, UiLanguage } from "../model/types.ts";
import { fadeIn, popIn, pulseScale } from "./anim.ts";
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

const PHASES: readonly { key: LoadingPhase; label: { zh: string; en: string }; icon: IconKey }[] = [
  { key: "search", label: { zh: "搜索菜谱", en: "Search" }, icon: "sparkle" },
  { key: "fetch", label: { zh: "读取原文", en: "Read" }, icon: "leaf" },
  { key: "structure", label: { zh: "AI 结构化", en: "Structure" }, icon: "chef-hat" },
];

const TARGETS: Record<LoadingPhase, number> = {
  search: 0.18,
  fetch: 0.48,
  structure: 0.82,
  finish: 1,
};

interface StepRef {
  readonly outer: View;
  readonly inner: View;
  readonly dot: View;
  readonly label: Text;
}

export class LoadingScreen extends BaseScreen {
  private readonly title: Text;
  private readonly detail: Text;
  private readonly percent: Text;
  private readonly bar: ProgressBar;
  private readonly steps: StepRef[] = [];
  private progress = 0;
  private lastPhase: LoadingPhase | "" = "";

  constructor(parent: Widget, language: UiLanguage) {
    super(parent, language);
    const icon: Image | null = addIcon(this.container, "chef-hat", 284, 44, 72);
    if (icon) pulseScale(icon, this.keeper, { min: 0.96, max: 1.06, durationMs: 1_100 });

    this.title = addText(this.container, {
      x: 40,
      y: 136,
      width: 560,
      height: 42,
      size: FONT_SIZE.heading,
      bold: true,
      align: TextAlign.CENTER,
      text: text("loadingSearch", language),
      wrap: false,
    });
    this.detail = addText(this.container, {
      x: 40,
      y: 184,
      width: 560,
      height: 30,
      size: FONT_SIZE.body,
      color: COLORS.textMuted,
      align: TextAlign.CENTER,
      text: text("loadingHint", language),
      wrap: false,
    });

    this.bar = addProgressBar(this.container, 80, 232, 480, 10, COLORS.orange);
    this.percent = addText(this.container, {
      x: 480,
      y: 248,
      width: 116,
      height: 22,
      size: FONT_SIZE.caption,
      color: COLORS.orangeSoft,
      align: TextAlign.RIGHT_MID,
      text: "0%",
      wrap: false,
    });

    for (let index = 0; index < 3; index += 1) {
      const panel = addPanel(this.container, 72 + index * 172, 286, 160, 58, {
        fill: COLORS.panel,
        border: COLORS.borderSoft,
      });
      const dot = addView(panel.inner, 12, 24, 10, 10, COLORS.textFaint);
      const phase = PHASES[index] as (typeof PHASES)[number];
      addIcon(panel.inner, phase.icon, 30, 17, 24);
      const label = addText(panel.inner, {
        x: 60,
        y: 13,
        width: 96,
        height: 32,
        size: FONT_SIZE.caption,
        color: COLORS.textMuted,
        text: phase.label[language],
        wrap: false,
      });
      this.steps.push({ outer: panel.outer, inner: panel.inner, dot, label });
      popIn(panel.outer, this.keeper, { durationMs: 260, from: 0.94, translateY: 6 });
    }

    addText(this.container, {
      x: 40,
      y: 392,
      width: 560,
      height: 26,
      size: FONT_SIZE.small,
      color: COLORS.textMuted,
      align: TextAlign.CENTER,
      text: text("loadingHint", language),
      wrap: false,
    });

    fadeIn(this.container, this.keeper, { from: 0.15, translateY: 0, durationMs: 180 });
  }

  update(state: AppState): void {
    if (!state.loading) return;
    const phase = state.loading.phase;
    const phaseIndex =
      phase === "finish"
        ? 3
        : Math.max(
            0,
            PHASES.findIndex((item) => item.key === phase),
          );
    const target = TARGETS[phase];
    this.progress += (target - this.progress) * 0.16;
    if (target >= 1 && target - this.progress < 0.004) this.progress = 1;
    setProgress(this.bar, this.progress);
    updateText(this.percent, `${Math.round(this.progress * 100)}%`);
    updateText(this.title, phaseTitle(phase, this.language));
    updateText(this.detail, this.stateDetail(state, this.language));

    if (phase !== this.lastPhase) {
      this.lastPhase = phase;
      this.steps.forEach((step, index) => {
        const status = index < phaseIndex ? "done" : index === phaseIndex ? "active" : "pending";
        updateBackground(
          step.outer,
          status === "done"
            ? COLORS.green
            : status === "active"
              ? COLORS.orange
              : COLORS.borderSoft,
        );
        updateBackground(
          step.inner,
          status === "active"
            ? COLORS.panelFocus
            : status === "done"
              ? COLORS.panelRaised
              : COLORS.panel,
        );
        updateBackground(
          step.dot,
          status === "done" ? COLORS.green : status === "active" ? COLORS.orange : COLORS.textFaint,
        );
        updateColor(step.label, status === "pending" ? COLORS.textFaint : COLORS.text);
      });
    }
  }

  private stateDetail(state: AppState, language: UiLanguage): string {
    const detail = state.loading?.detail;
    if (!detail) return text("loadingHint", language);
    return language === "zh" ? detail.zh : detail.en;
  }
}

function phaseTitle(phase: LoadingPhase, language: UiLanguage): string {
  switch (phase) {
    case "search":
      return text("loadingSearch", language);
    case "fetch":
      return text("loadingFetch", language);
    case "structure":
      return text("loadingStructure", language);
    case "finish":
      return text("loadingFinish", language);
  }
}

/** Listening screen: simulated voice capture via the simulator text channel. */

import { TextAlign } from "@irisview/osx/fusionui";
import type { Image, View, Widget } from "@irisview/osx/fusionui";

import { pick, text } from "../model/i18n.ts";
import type { AppState, IconKey, UiLanguage } from "../model/types.ts";
import { fadeIn, pulseOpacity, pulseScale } from "./anim.ts";
import { BaseScreen } from "./screen.ts";
import { COLORS, FONT_SIZE } from "./theme.ts";
import { addIcon, addPanel, addText, addView } from "./widgets.ts";

interface WaveBar {
  readonly view: View;
  readonly phase: number;
  readonly base: number;
}

interface Example {
  readonly icon: IconKey;
  readonly label: { zh: string; en: string };
}

const EXAMPLES: readonly Example[] = [
  { icon: "tomato", label: { zh: "番茄炒蛋", en: "Tomato & Eggs" } },
  { icon: "meat", label: { zh: "可乐鸡翅", en: "Cola Wings" } },
  { icon: "vegetable", label: { zh: "酸辣土豆丝", en: "Potato Slivers" } },
];

export class ListeningScreen extends BaseScreen {
  private readonly mic: Image | null;
  private readonly bars: WaveBar[] = [];

  constructor(parent: Widget, language: UiLanguage) {
    super(parent, language);
    const halo = addView(this.container, 238, 48, 164, 164, COLORS.panel);
    halo.getLocalStyle().setBackgroundOpacity(0.55);
    this.mic = addIcon(this.container, "mic", 280, 74, 80);
    if (this.mic) {
      pulseOpacity(this.mic, this.keeper, { min: 0.55, max: 1, durationMs: 950 });
      pulseScale(this.mic, this.keeper, { min: 0.96, max: 1.05, durationMs: 1_200 });
    }
    for (let index = 0; index < 9; index += 1) {
      const height = 12 + (index % 4) * 7;
      const view = addView(this.container, 268 + index * 13, 166, 6, height, COLORS.teal);
      this.bars.push({ view, phase: index * 0.7, base: height });
    }

    addText(this.container, {
      x: 24,
      y: 266,
      width: 592,
      height: 50,
      size: FONT_SIZE.display,
      bold: true,
      align: TextAlign.CENTER,
      text: text("listeningTitle", language),
    });
    addText(this.container, {
      x: 60,
      y: 322,
      width: 520,
      height: 28,
      size: FONT_SIZE.body,
      color: COLORS.textMuted,
      align: TextAlign.CENTER,
      text: text("listeningSubtitle", language),
    });

    addText(this.container, {
      x: 24,
      y: 364,
      width: 592,
      height: 22,
      size: FONT_SIZE.caption,
      color: COLORS.textFaint,
      align: TextAlign.CENTER,
      text: text("listeningExampleLabel", language),
    });
    const totalWidth = 3 * 188 + 2 * 12;
    const startX = (640 - totalWidth) / 2;
    EXAMPLES.forEach((example, index) => {
      const panel = addPanel(this.container, startX + index * 200, 390, 188, 40, {
        fill: COLORS.panelRaised,
        border: COLORS.borderSoft,
      });
      addIcon(panel.inner, example.icon, 12, 9, 22);
      addText(panel.inner, {
        x: 40,
        y: 6,
        width: 136,
        height: 28,
        size: FONT_SIZE.caption,
        color: COLORS.textMuted,
        text: pick(example.label, language),
        wrap: false,
      });
      fadeIn(panel.outer, this.keeper, { translateY: 6, durationMs: 260 });
    });

    addText(this.container, {
      x: 24,
      y: 444,
      width: 592,
      height: 22,
      size: FONT_SIZE.tiny,
      color: COLORS.orangeSoft,
      align: TextAlign.CENTER,
      text: text("listeningCaveat", language),
      wrap: false,
    });
    fadeIn(this.container, this.keeper, { from: 0.2, translateY: 0, durationMs: 220 });
  }

  update(state: AppState): void {
    const elapsed = state.clockMs - state.listeningStartedAtMs;
    this.bars.forEach((bar) => {
      const wave = Math.sin(elapsed / 160 + bar.phase) * 0.5 + 0.5;
      const height = Math.round(bar.base + wave * 26);
      bar.view.setHeight(height);
      bar.view.setPositionY(166 + Math.round((38 - height) / 2));
    });
  }
}

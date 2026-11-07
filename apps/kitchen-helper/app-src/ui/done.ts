/** Completion screen with a light confetti celebration. */

import { TextAlign } from "@irisview/osx/fusionui";
import type { Text, View, Widget } from "@irisview/osx/fusionui";

import { formatClock, pick, text } from "../model/i18n.ts";
import type { AppState, DoneState, Recipe, UiLanguage } from "../model/types.ts";
import { popIn, pulseOpacity, pulseScale } from "./anim.ts";
import { BaseScreen } from "./screen.ts";
import { COLORS, FONT_SIZE } from "./theme.ts";
import { addIcon, addPanel, addText, addView } from "./widgets.ts";

interface Confetti {
  readonly view: View;
  readonly baseX: number;
  readonly speed: number;
  readonly phase: number;
  readonly sway: number;
}

const CONFETTI_COLORS = [
  COLORS.orange,
  COLORS.teal,
  COLORS.yellow,
  COLORS.green,
  COLORS.pink,
  COLORS.purple,
];

function seeded(seed: number): () => number {
  let value = seed % 2_147_483_647;
  if (value <= 0) value += 2_147_483_646;
  return () => {
    value = (value * 16_807) % 2_147_483_647;
    return value / 2_147_483_647;
  };
}

export class DoneScreen extends BaseScreen {
  private readonly recipe: Recipe | null;
  private readonly done: DoneState | null;
  private readonly confetti: Confetti[] = [];
  private readonly title: Text;
  private confettiHidden = false;

  constructor(parent: Widget, language: UiLanguage, state: AppState) {
    super(parent, language);
    this.recipe = state.recipe;
    this.done = state.done;

    const random = seeded((state.done?.confettiSeed ?? 7) + 13);
    for (let index = 0; index < 24; index += 1) {
      const color = CONFETTI_COLORS[
        index % CONFETTI_COLORS.length
      ] as (typeof COLORS)[keyof typeof COLORS];
      const width = 4 + Math.round(random() * 5);
      const height = 7 + Math.round(random() * 7);
      const view = addView(this.container, 0, 0, width, height, color);
      this.confetti.push({
        view,
        baseX: Math.round(random() * 620) + 10,
        speed: 34 + random() * 58,
        phase: random() * Math.PI * 2,
        sway: 6 + random() * 14,
      });
    }

    const dish = addIcon(this.container, "dish", 280, 34, 80);
    if (dish) pulseScale(dish, this.keeper, { min: 0.94, max: 1.02, durationMs: 1_300 });
    addIcon(this.container, "sparkle", 228, 54, 26, { opacity: 0.9 });
    addIcon(this.container, "sparkle", 398, 38, 18, { opacity: 0.8 });

    this.title = addText(this.container, {
      x: 24,
      y: 124,
      width: 592,
      height: 56,
      size: FONT_SIZE.display,
      bold: true,
      align: TextAlign.CENTER,
      color: COLORS.orangeSoft,
      text: text("doneTitle", language),
      wrap: false,
    });
    if (this.recipe) {
      addText(this.container, {
        x: 24,
        y: 184,
        width: 592,
        height: 40,
        size: FONT_SIZE.title,
        bold: true,
        align: TextAlign.CENTER,
        text: pick(this.recipe.title, language),
        wrap: false,
      });
    }
    addText(this.container, {
      x: 24,
      y: 228,
      width: 592,
      height: 28,
      size: FONT_SIZE.body,
      color: COLORS.textMuted,
      align: TextAlign.CENTER,
      text: text("doneSubtitle", language),
      wrap: false,
    });

    const stats: { label: string; icon: "clock" | "tap" }[] = [
      {
        label: text("doneTime", language, {
          time: formatClock(state.done?.cookingMs ?? 0),
        }),
        icon: "clock",
      },
      {
        label: text("doneSteps", language, { n: this.recipe?.steps.length ?? 0 }),
        icon: "tap",
      },
    ];
    stats.forEach((stat, index) => {
      const panel = addPanel(this.container, index === 0 ? 100 : 330, 268, 210, 58, {
        fill: COLORS.panelRaised,
        border: COLORS.borderSoft,
      });
      addIcon(panel.inner, stat.icon, 16, 16, 26);
      addText(panel.inner, {
        x: 50,
        y: 12,
        width: 150,
        height: 34,
        size: FONT_SIZE.small,
        color: COLORS.textMuted,
        text: stat.label,
        wrap: false,
      });
      popIn(panel.outer, this.keeper, { durationMs: 260, from: 0.94, translateY: 6 });
    });

    addText(this.container, {
      x: 24,
      y: 340,
      width: 592,
      height: 24,
      size: FONT_SIZE.caption,
      color: COLORS.textFaint,
      align: TextAlign.CENTER,
      text: text("doneConfettiHint", language),
      wrap: false,
    });

    const cta = addPanel(this.container, 24, 378, 592, 62, {
      fill: COLORS.panelFocus,
      border: COLORS.orange,
      borderWidth: 2,
    });
    addIcon(cta.inner, "chef-hat", 20, 17, 28);
    addText(cta.inner, {
      x: 58,
      y: 14,
      width: 470,
      height: 34,
      size: FONT_SIZE.label,
      bold: true,
      text: text("doneAgain", language),
    });
    addIcon(cta.inner, "arrow-right", 548, 18, 26);
    pulseOpacity(cta.outer, this.keeper, { min: 0.88, max: 1, durationMs: 1_200 });
    popIn(this.title, this.keeper, { durationMs: 340, from: 0.9, translateY: 8 });
  }

  update(state: AppState): void {
    const elapsed = Math.max(0, state.clockMs - (this.done?.finishedAtMs ?? 0));
    if (elapsed > 7_000) {
      if (!this.confettiHidden) {
        this.confettiHidden = true;
        this.confetti.forEach((piece) => piece.view.setHidden(true));
      }
      return;
    }
    this.confetti.forEach((piece, index) => {
      const fall = (index * 37 + elapsed * (piece.speed / 1_000)) % 560;
      const y = Math.round(fall - 40);
      const x = Math.round(piece.baseX + Math.sin(elapsed / 520 + piece.phase) * piece.sway);
      piece.view.setPosition([x, y, 0]);
    });
  }
}

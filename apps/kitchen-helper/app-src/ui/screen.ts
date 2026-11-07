/** Common screen lifecycle used by the renderer. */

import { View } from "@irisview/osx/fusionui";
import type { Widget } from "@irisview/osx/fusionui";

import type { AppState, UiLanguage } from "../model/types.ts";
import { PlaybackKeeper } from "./anim.ts";
import { COLORS } from "./theme.ts";
import { addView } from "./widgets.ts";

export interface ScreenView {
  readonly container: Widget;
  update(state: AppState): void;
  dispose(): void;
}

export abstract class BaseScreen implements ScreenView {
  readonly container: View;
  protected readonly keeper = new PlaybackKeeper();
  protected readonly language: UiLanguage;

  protected constructor(parent: Widget, language: UiLanguage) {
    this.language = language;
    this.container = addView(parent, 0, 0, 640, 480, COLORS.transparent);
  }

  abstract update(state: AppState): void;

  dispose(): void {
    this.keeper.clear();
    try {
      if (this.container.getValid()) this.container.dispose(true);
    } catch {
      // The window may already be gone during application teardown.
    }
  }
}

/** Screen router for the HUD. */

import { Board } from "@irisview/osx/fusionui";
import type { RootWidget } from "@irisview/osx/fusionui";

import type { AppState, UiLanguage } from "../model/types.ts";
import { tickAnimations } from "./anim.ts";
import { drawBackground } from "./chrome.ts";
import { CookingScreen } from "./cooking.ts";
import { DoneScreen } from "./done.ts";
import { ErrorScreen } from "./error.ts";
import { HomeScreen } from "./hero.ts";
import { ListeningScreen } from "./listening.ts";
import { LoadingScreen } from "./loading.ts";
import { PrepScreen } from "./prep.ts";
import { RecipeScreen } from "./recipe.ts";
import type { ScreenView } from "./screen.ts";

export class AppRenderer {
  private readonly base: Board;
  private screen: ScreenView | null = null;
  private screenKey = "";
  private readonly language: UiLanguage;

  constructor(root: RootWidget, language: UiLanguage) {
    this.language = language;
    // RootWidget only accepts a Board as its direct child.
    this.base = Board.create();
    this.base.setParent(root);
    this.base.setIgnoreLayout(true);
    this.base.setPosition([0, 0, 0]);
    this.base.setSize([640, 480, 0]);
    drawBackground(this.base);
  }

  render(state: AppState): void {
    const key = screenKey(state);
    if (key !== this.screenKey || !this.screen) {
      this.screen?.dispose();
      this.screen = this.createScreen(state);
      this.screenKey = key;
      this.screen.update(state);
      tickAnimations(state.clockMs);
      return;
    }
    this.screen.update(state);
    tickAnimations(state.clockMs);
  }

  private createScreen(state: AppState): ScreenView {
    switch (state.screen) {
      case "home":
        return new HomeScreen(this.base, this.language);
      case "listening":
        return new ListeningScreen(this.base, this.language);
      case "loading":
        return new LoadingScreen(this.base, this.language);
      case "recipe":
        if (state.recipe) return new RecipeScreen(this.base, this.language, state.recipe);
        return new HomeScreen(this.base, this.language);
      case "prep":
        return new PrepScreen(this.base, this.language, state);
      case "cooking":
        return new CookingScreen(this.base, this.language, state);
      case "done":
        return new DoneScreen(this.base, this.language, state);
      case "error":
        return new ErrorScreen(this.base, this.language, state);
    }
  }

  dispose(): void {
    this.screen?.dispose();
    this.screen = null;
    try {
      if (this.base.getValid()) this.base.dispose(true);
    } catch {
      // Window teardown already removed the tree.
    }
  }
}

function screenKey(state: AppState): string {
  switch (state.screen) {
    case "home":
      return "home";
    case "listening":
      return "listening";
    case "loading":
      return "loading";
    case "recipe":
      return `recipe:${state.recipe?.title.zh ?? ""}:${state.recipe?.source.extractedBy ?? ""}`;
    case "prep":
      return "prep";
    case "cooking":
      return `cooking:${state.cooking?.stepIndex ?? 0}`;
    case "done":
      return `done:${state.done?.finishedAtMs ?? 0}`;
    case "error":
      return `error:${state.error?.error.code ?? ""}:${state.error?.error.detail ?? ""}`;
  }
}

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { applicationDataDirectory, applicationDataPath } from "./application-data.ts";
import type { Localized } from "./model/types.ts";

export interface HistoryState {
  readonly completedCount: number;
  readonly lastDish: Localized | null;
}

const EMPTY_HISTORY: HistoryState = { completedCount: 0, lastDish: null };
const HISTORY_FILE = "kitchen-helper-history.json";

function historyPath(): string | null {
  return applicationDataPath(HISTORY_FILE);
}

/** Best-effort read; a missing or unreadable file simply means "first run". */
export function loadHistory(): HistoryState {
  const path = historyPath();
  if (!path) return EMPTY_HISTORY;
  try {
    if (!existsSync(path)) return EMPTY_HISTORY;
    const parsed = JSON.parse(readFileSync(path, "utf8")) as {
      completedCount?: unknown;
      lastDish?: { zh?: unknown; en?: unknown } | null;
    };
    const completedCount = Number.isInteger(parsed.completedCount)
      ? Math.max(0, Number(parsed.completedCount))
      : 0;
    const lastDish =
      parsed.lastDish &&
      typeof parsed.lastDish.zh === "string" &&
      typeof parsed.lastDish.en === "string"
        ? { zh: parsed.lastDish.zh, en: parsed.lastDish.en }
        : null;
    return { completedCount, lastDish };
  } catch {
    return EMPTY_HISTORY;
  }
}

/** Best-effort write; history must never break the cooking flow. */
export function saveHistory(history: HistoryState): void {
  const path = historyPath();
  const directory = applicationDataDirectory();
  if (!path || !directory) return;
  try {
    if (!existsSync(directory)) mkdirSync(directory, { recursive: true });
    writeFileSync(path, `${JSON.stringify(history)}\n`);
  } catch {
    // Read-only data directories are acceptable.
  }
}

export function recordCompletion(previous: HistoryState, dish: Localized): HistoryState {
  return { completedCount: previous.completedCount + 1, lastDish: dish };
}

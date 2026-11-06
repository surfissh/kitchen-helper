import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface PersistedState {
  cycles: number;
}

export function stateDirectory(): string {
  const directory = process.env.FUSIONUI_APP_DATA_DIR;
  if (!directory) {
    throw new Error("IrisView application data directory is unavailable");
  }
  return directory;
}

export function statePath(): string {
  return join(stateDirectory(), "kitchen-helper.json");
}

export function loadState(): PersistedState {
  try {
    const parsed = JSON.parse(readFileSync(statePath(), "utf8")) as Partial<PersistedState>;
    return { cycles: Number.isInteger(parsed.cycles) ? Number(parsed.cycles) : 0 };
  } catch {
    return { cycles: 0 };
  }
}

export function saveState(state: PersistedState): void {
  try {
    writeFileSync(statePath(), `${JSON.stringify(state)}\n`);
  } catch {
    // Persistence is best effort; a read-only data directory must not stop the
    // cooking timer.
  }
}

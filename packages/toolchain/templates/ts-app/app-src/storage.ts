import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface PersistedState {
  launches: number;
}

const DEFAULT_STATE: PersistedState = { launches: 0 };

/**
 * Application-owned files live in the private directory the Client exposes via
 * `FUSIONUI_APP_DATA_DIR`. Never derive a path from the install directory.
 */
export function stateDirectory(): string {
  const directory = process.env.FUSIONUI_APP_DATA_DIR;
  if (!directory) {
    throw new Error("IrisView application data directory is unavailable");
  }
  return directory;
}

export function statePath(): string {
  return join(stateDirectory(), "state.json");
}

export function loadState(): PersistedState {
  try {
    const parsed = JSON.parse(readFileSync(statePath(), "utf8")) as Partial<PersistedState>;
    return { launches: Number.isInteger(parsed.launches) ? Number(parsed.launches) : 0 };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function saveState(state: PersistedState): void {
  writeFileSync(statePath(), `${JSON.stringify(state)}\n`);
}

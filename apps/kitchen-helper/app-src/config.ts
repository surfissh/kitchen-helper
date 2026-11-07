/**
 * Runtime configuration for the Kitchen Helper MVP.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  DEEPSEEK API KEY — prefer the simulator state directory at runtime.  │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * The key is resolved at request time, in this order:
 *
 *  1. `DEEPSEEK_API_KEY` environment variable (handy for CI; never persisted);
 *  2. `deepseek-key.txt` in the application's private data directory, which
 *     lives inside the simulator state directory selected with `--state-dir`
 *     (by default `apps/kitchen-helper/sim-state`, see `application-data.ts`);
 *  3. the development placeholder below (compiled into the bundle — avoid).
 *
 * ⚠️ A key shipped inside a `.fuiapp` is readable by anyone who has the
 * package. The state-directory file never enters the bundle; a production app
 * should still exchange a short-lived token through a backend proxy.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { applicationDataDirectory, applicationDataPath } from "./application-data.ts";

/** File under the app's private data directory that may hold the API key. */
export const DEEPSEEK_KEY_FILE = "deepseek-key.txt";

/** Development-only placeholder; prefer the state-directory key file. */
export const DEEPSEEK_API_KEY = "";

/** DeepSeek OpenAI-compatible endpoint; override only for a compatible proxy. */
export const DEEPSEEK_API_BASE = "https://api.deepseek.com";

/** `deepseek-flash` is fast and good enough for recipe structuring. */
export const DEEPSEEK_MODEL = "deepseek-flash";

/**
 * Per-request network budget covering headers *and* the generated body.
 * Non-streaming chat completions deliver the body after generation, so the
 * timeout must be large enough for a long recipe to finish.
 */
export const DEEPSEEK_STRUCTURE_TIMEOUT_MS = 90_000;
export const DEEPSEEK_ASSISTANT_TIMEOUT_MS = 30_000;

/**
 * Output budget. The structuring prompt asks for a large bilingual JSON object;
 * the API's default 4K is easily exhausted (and JSON Output then blanks a
 * truncated payload, which used to surface as an "empty-response" error).
 */
export const DEEPSEEK_STRUCTURE_MAX_TOKENS = 8_192;
export const DEEPSEEK_ASSISTANT_MAX_TOKENS = 1_024;

/** HowToCook public site and repository. */
export const HOWTOCOOK_SITE = "https://howtocook.aiursoft.com";
export const HOWTOCOOK_REPO = "Anduin2017/HowToCook";
export const HOWTOCOOK_BRANCH = "master";

/** Network budget for one HowToCook HTTP request, in milliseconds. */
export const HOWTOCOOK_TIMEOUT_MS = 12_000;

/** Where the active key came from; logged at startup, never the key itself. */
export type DeepSeekKeySource = "env" | "file" | "config" | "none";

export interface DeepSeekKeyStatus {
  readonly source: DeepSeekKeySource;
  /** Absolute path of the runtime key file, when the app data directory exists. */
  readonly filePath: string | null;
}

/** Absolute path of the runtime key file inside the app's private data directory. */
export function deepSeekKeyFilePath(): string | null {
  return applicationDataPath(DEEPSEEK_KEY_FILE);
}

const KEY_FILE_TEMPLATE = `# Kitchen Helper — DeepSeek API key (runtime, never committed / never bundled)
#
# Paste the key on its own line below (blank lines and # comments are ignored),
# then restart the app. This file lives in the application's private data
# directory inside the simulator state directory (apps/kitchen-helper/sim-state,
# git-ignored) and is provided to the app through FUSIONUI_APP_DATA_DIR.
#
# Resolution order: DEEPSEEK_API_KEY env var -> this file -> config.ts placeholder.
#
# sk-paste-your-key-here
`;

/**
 * Seed an explanatory template next to where the key is expected, so the state
 * directory is self-documenting on a fresh checkout. Never overwrites an
 * existing file, so a pasted key is preserved.
 */
export function ensureDeepSeekKeyTemplate(): void {
  const path = deepSeekKeyFilePath();
  const directory = applicationDataDirectory();
  if (!path || !directory || existsSync(path)) return;
  try {
    mkdirSync(directory, { recursive: true });
    writeFileSync(path, KEY_FILE_TEMPLATE);
  } catch {
    // A read-only data directory is acceptable: the key stays unconfigured.
  }
}

/**
 * Read the first usable line of the runtime key file.
 *
 * Blank lines and `#` comments are skipped, which lets the seeded file carry
 * instructions next to the pasted key. Missing or unreadable files simply mean
 * "no key configured".
 */
function readDeepSeekKeyFile(): string {
  const path = deepSeekKeyFilePath();
  if (!path) return "";
  try {
    const text = readFileSync(path, "utf8").replace(/^\uFEFF/, "");
    for (const line of text.split(/\r?\n/)) {
      const value = line.trim();
      if (value.length > 0 && !value.startsWith("#")) return value;
    }
  } catch {
    // A missing file is the normal "not configured yet" case.
  }
  return "";
}

export function deepSeekKeyStatus(): DeepSeekKeyStatus {
  const filePath = deepSeekKeyFilePath();
  const fromEnv = typeof process !== "undefined" ? process.env.DEEPSEEK_API_KEY : undefined;
  if (fromEnv && fromEnv.trim()) return { source: "env", filePath };
  if (readDeepSeekKeyFile()) return { source: "file", filePath };
  if (DEEPSEEK_API_KEY.trim()) return { source: "config", filePath };
  return { source: "none", filePath };
}

/**
 * Resolve the active DeepSeek API key at call time so a key placed in the
 * state directory is picked up on the next launch without rebuilding.
 */
export function resolveDeepSeekKey(): string {
  const fromEnv = typeof process !== "undefined" ? process.env.DEEPSEEK_API_KEY : undefined;
  const env = fromEnv ? fromEnv.trim() : "";
  if (env) return env;
  const file = readDeepSeekKeyFile();
  if (file) return file;
  return DEEPSEEK_API_KEY.trim();
}

export function hasDeepSeekKey(): boolean {
  return resolveDeepSeekKey().length > 0;
}

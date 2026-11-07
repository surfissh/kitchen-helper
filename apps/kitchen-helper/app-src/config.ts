/**
 * Runtime configuration for the Kitchen Helper MVP.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  DEEPSEEK API KEY PLACEHOLDER — paste your key below for development. │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * You can either paste a key into `DEEPSEEK_API_KEY` or export the
 * `DEEPSEEK_API_KEY` environment variable before launching the simulator.
 * The environment variable wins.
 *
 * ⚠️ A key shipped inside a `.fuiapp` is readable by anyone who has the
 * package. This placeholder is for local MVP testing only; a production app
 * must exchange a short-lived token through a backend proxy.
 */
export const DEEPSEEK_API_KEY = "";

/** DeepSeek OpenAI-compatible endpoint; override only for a compatible proxy. */
export const DEEPSEEK_API_BASE = "https://api.deepseek.com";

/** `deepseek-chat` is fast and good enough for recipe structuring. */
export const DEEPSEEK_MODEL = "deepseek-chat";

/** Network budget for one chat completion, in milliseconds. */
export const DEEPSEEK_TIMEOUT_MS = 45_000;

/** HowToCook public site and repository. */
export const HOWTOCOOK_SITE = "https://howtocook.aiursoft.com";
export const HOWTOCOOK_REPO = "Anduin2017/HowToCook";
export const HOWTOCOOK_BRANCH = "master";

/** Network budget for one HowToCook HTTP request, in milliseconds. */
export const HOWTOCOOK_TIMEOUT_MS = 12_000;

export function resolveDeepSeekKey(): string {
  const fromEnv = typeof process !== "undefined" ? process.env.DEEPSEEK_API_KEY : undefined;
  const key = (fromEnv && fromEnv.trim()) || DEEPSEEK_API_KEY.trim();
  return key;
}

export function hasDeepSeekKey(): boolean {
  return resolveDeepSeekKey().length > 0;
}

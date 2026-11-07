/**
 * Access to the application's private data directory.
 *
 * Per the IrisView "simulator data directory" guide, the `--state-dir` launch
 * option only chooses the simulator's whole isolated state area; applications
 * must never parse it or build a host path themselves. The Host gives every
 * application its own private directory through `FUSIONUI_APP_DATA_DIR`, and
 * `applicationDataPath()` is the only supported way to address files inside it.
 * The path therefore follows the state directory wherever the simulator is
 * started from, including a project-local state directory.
 */

import { isAbsolute, join, normalize, sep } from "node:path";

/** Absolute private data directory of this application, or null when unavailable. */
export function applicationDataDirectory(): string | null {
  const directory = process.env.FUSIONUI_APP_DATA_DIR;
  if (!directory || !isAbsolute(directory)) return null;
  return directory;
}

/**
 * Resolve a relative file inside the private data directory.
 *
 * Returns null when the data directory is unavailable or the path is absolute
 * or escapes the private directory.
 */
export function applicationDataPath(relativePath: string): string | null {
  const directory = applicationDataDirectory();
  if (!directory) return null;
  if (!relativePath || isAbsolute(relativePath)) return null;
  const normalized = normalize(relativePath);
  if (normalized === ".." || normalized.startsWith(`..${sep}`)) return null;
  return join(directory, normalized);
}

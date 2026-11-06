import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { inspectKitIntegrity, repairKitIntegrity } from "../compat/integrity.ts";
import { describeHost, isSupportedHost, loadKitIdentity, readHostInfo } from "../kit.ts";
import {
  ensureStateRoot,
  findKitRoot,
  managedNode,
  stateRoot,
  toolchainCacheRoot,
} from "../paths.ts";
import { CliError, log, readJson, runOnce, writeJson } from "../util.ts";

export interface Context {
  kitRoot: string;
  identity: ReturnType<typeof loadKitIdentity>;
  host: ReturnType<typeof readHostInfo>;
  supportedHost: boolean;
  stateRoot: string;
  node: ReturnType<typeof managedNode>;
}

export interface PrepareOptions {
  kit?: string;
}

export function prepare(options: PrepareOptions = {}): Context {
  const kitRoot = findKitRoot(options.kit);
  const identity = loadKitIdentity(kitRoot);
  const host = readHostInfo();
  const supportedHost = isSupportedHost(host);
  let node: ReturnType<typeof managedNode>;
  try {
    node = managedNode(identity.nodeVersion);
  } catch (error) {
    throw new CliError(
      `${(error as Error).message}\n(host: ${describeHost(host)}; kit: ${kitRoot})`,
    );
  }
  const root = stateRoot();
  ensureStateRoot(root);
  return { kitRoot, identity, host, supportedHost, stateRoot: root, node };
}

export function pythonAvailable(): string {
  const python = process.env.IRISVIEW_PYTHON ?? "python3";
  const result = runOnce(python, ["--version"], { allowFailure: true });
  if (result.code !== 0) {
    throw new CliError(
      `Python 3 is required by the IrisView SDK but \`${python}\` is unavailable.`,
    );
  }
  return `${python}: ${result.stdout.trim() || result.stderr.trim()}`;
}

/**
 * Make the vendored Kit self-consistent and prepare the simulator state root.
 *
 * Returns true when the Kit had to be repaired. Repairs are only triggered by
 * stale digests, which are expected in this Developer Kit build because its
 * JavaScript/JSON files were reformatted after packaging.
 */
export function ensureRuntimeReady(context: Context, options: { repair?: boolean } = {}): boolean {
  const cache = toolchainCacheRoot();
  const report = inspectKitIntegrity(context.kitRoot, cache);
  if (report.consistent) return false;
  if (options.repair === false) {
    throw new CliError(
      "Developer Kit integrity metadata is stale:\n" +
        report.issues
          .map((issue) => `  - ${issue.area}/${issue.file}: ${issue.detail}`)
          .join("\n") +
        "\nRun `ivt doctor --fix` or allow the toolchain to repair it.",
    );
  }
  log.warn(
    `Developer Kit integrity metadata is stale (${report.issues.length} issue(s)); ` +
      "recomputing declared digests to match the shipped bytes",
  );
  const repaired = repairKitIntegrity(context.kitRoot, cache);
  if (repaired.changedFiles.length > 0) {
    log.info(
      `repaired ${repaired.changedFiles.length} metadata file(s); ` +
        `originals backed up under ${repaired.backupDirectory ?? "the kit"}`,
    );
  }
  return true;
}

export function displayAvailable(): { available: boolean; detail: string } {
  const display = process.env.DISPLAY ?? "";
  const wayland = process.env.WAYLAND_DISPLAY ?? "";
  return {
    available: Boolean(display || wayland),
    detail: display || wayland || "DISPLAY and WAYLAND_DISPLAY are unset",
  };
}

export function xvfbAvailable(): boolean {
  const result = runOnce("xvfb-run", ["--help"], { allowFailure: true });
  return result.code === 0;
}

export interface ArtifactRecord {
  path: string;
  applicationId: string;
  versionCode: number;
  sha256: string;
  createdAt: string;
}

export function artifactDirectory(projectRoot: string): string {
  return join(projectRoot, "artifacts");
}

export function latestRecordPath(projectRoot: string): string {
  return join(projectRoot, ".ivt", "latest.json");
}

export function writeLatestRecord(projectRoot: string, record: ArtifactRecord): void {
  writeJson(latestRecordPath(projectRoot), record);
}

/** Find the most recent .fuiapp package for `--latest`. */
export function findLatestArtifact(start: string): string {
  const candidates: Array<{ path: string; mtime: number }> = [];
  const recordPath = join(start, ".ivt", "latest.json");
  if (existsSync(recordPath)) {
    try {
      const record = readJson<ArtifactRecord>(recordPath);
      if (existsSync(record.path)) return record.path;
    } catch {
      // Fall through to a directory scan.
    }
  }
  const roots = [join(start, "artifacts"), start, join(start, "..")];
  for (const root of roots) {
    const directory = join(root, "artifacts");
    if (!existsSync(directory)) continue;
    for (const entry of readdirSync(directory).sort()) {
      if (!entry.endsWith(".fuiapp")) continue;
      const path = join(directory, entry);
      candidates.push({ path, mtime: statSync(path).mtimeMs });
    }
  }
  candidates.sort((left, right) => right.mtime - left.mtime);
  if (candidates.length === 0) {
    throw new CliError(
      `no .fuiapp package found under ${start}. Run \`ivt package\` first or pass a package path.`,
    );
  }
  return (candidates[0] as { path: string }).path;
}

export function resolvePackageArgument(
  positional: string | undefined,
  useLatest: boolean,
  projectRoot?: string,
): string {
  if (positional) {
    if (!existsSync(positional))
      throw new CliError(`application package does not exist: ${positional}`);
    return positional;
  }
  if (!useLatest) {
    throw new CliError("missing application package path (or pass --latest)");
  }
  return findLatestArtifact(projectRoot ?? process.cwd());
}

export function requireProjectDirectory(text: string): string {
  const directory = resolve(text);
  if (!existsSync(directory)) throw new CliError(`project directory does not exist: ${directory}`);
  return directory;
}

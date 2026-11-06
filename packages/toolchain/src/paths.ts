import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CliError, ensureDir, isDirectory, readText, runOnce, writeIfChanged } from "./util.ts";

/** `packages/toolchain` */
export const toolchainRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
/** The workspace checkout that contains this toolchain. */
export const workspaceRoot = resolve(toolchainRoot, "..", "..");

const KIT_PATTERN = /^IrisView-Developer-Kit-v?(\d+\.\d+\.\d+)$/;
const KIT_NAME_PREFIX = "IrisView-Developer-Kit-";

export interface KitCandidate {
  root: string;
  version: string;
}

function kitVersion(root: string): string | null {
  const name = root.split("/").pop() ?? "";
  const match = KIT_PATTERN.exec(name);
  if (match) return match[1] as string;
  if (!name.startsWith(KIT_NAME_PREFIX)) return null;
  return name.slice(KIT_NAME_PREFIX.length);
}

function isKit(root: string): boolean {
  return (
    existsSync(join(root, "bin", "irisview")) &&
    existsSync(join(root, "DEVELOPER_KIT_INFO.json")) &&
    existsSync(join(root, "sdk", "fusionui-app-sdk", "fusionui_sdk.py"))
  );
}

function compareVersions(left: string, right: string): number {
  const a = left.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const b = right.split(".").map((part) => Number.parseInt(part, 10) || 0);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/**
 * Locate the packaged IrisView Developer Kit.
 *
 * Order: explicit option, environment, parent directories of the working
 * directory, the workspace root, then conventional user install locations.
 * When several kits are present the highest version wins.
 */
export function findKitRoot(explicit?: string): string {
  const requested =
    explicit ?? process.env.IRISVIEW_KIT_ROOT ?? process.env.FUSIONUI_DEVELOPER_KIT_ROOT;
  if (requested) {
    const root = resolve(requested);
    if (!isKit(root)) {
      throw new CliError(`IRISVIEW_KIT_ROOT does not point at an IrisView Developer Kit: ${root}`);
    }
    return root;
  }

  const candidates: KitCandidate[] = [];
  const searchRoots = new Set<string>();
  let current = resolve(process.cwd());
  for (;;) {
    searchRoots.add(current);
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  searchRoots.add(workspaceRoot);
  searchRoots.add(join(homedir(), "IrisView", "LLVISION"));
  searchRoots.add(join(homedir(), "IrisView"));
  searchRoots.add(homedir());

  for (const directory of searchRoots) {
    if (!isDirectory(directory)) continue;
    let entries: string[];
    try {
      entries = readdirSync(directory).filter((name) => name.startsWith(KIT_NAME_PREFIX));
    } catch {
      continue;
    }
    for (const name of entries) {
      const root = join(directory, name);
      if (!isKit(root)) continue;
      const version = kitVersion(root);
      if (!version) continue;
      candidates.push({ root, version });
    }
  }

  if (candidates.length === 0) {
    throw new CliError(
      "IrisView Developer Kit not found. Set IRISVIEW_KIT_ROOT to the unpacked kit " +
        "(the directory containing bin/irisview).",
    );
  }
  candidates.sort((left, right) => compareVersions(right.version, left.version));
  return (candidates[0] as KitCandidate).root;
}

/** Runtime state directory used for simulator data and toolchain caches. */
export function stateRoot(): string {
  const configured = process.env.IRISVIEW_STATE_DIR;
  return configured ? resolve(configured) : join(workspaceRoot, ".state", "simulator");
}

export function toolchainCacheRoot(): string {
  return join(workspaceRoot, ".state", "cache");
}

/**
 * Installed application code is executed by the Client's Node runtime. When
 * the state directory lives inside a `"type": "module"` package scope, Node
 * would treat the bundled CommonJS `index.js` as ESM. A marker package.json in
 * the state root pins the scope to CommonJS, matching a normal Ubuntu home
 * directory.
 */
export function ensureStateRoot(root: string): string {
  ensureDir(root);
  const marker = join(root, "package.json");
  if (!existsSync(marker)) {
    writeIfChanged(marker, `${JSON.stringify({ type: "commonjs", private: true }, null, 2)}\n`);
  }
  return root;
}

export function npmConfigDir(): string {
  const directory = join(toolchainCacheRoot(), "npm");
  ensureDir(directory);
  for (const name of ["user.npmrc", "global.npmrc"]) {
    const path = join(directory, name);
    if (!existsSync(path)) writeIfChanged(path, "");
  }
  return directory;
}

export interface ManagedNode {
  /** Directory containing the node and npm executables. */
  binDir: string;
  node: string;
  version: string;
  source: string;
}

function nodeVersionOf(nodePath: string): string | null {
  try {
    const result = runOnce(nodePath, ["--version"], { allowFailure: true, timeoutMs: 10_000 });
    if (result.code !== 0) return null;
    return result.stdout.trim().replace(/^v/, "");
  } catch {
    return null;
  }
}

/**
 * Resolve the exact Node.js 24.13.0 distribution the Developer Kit expects.
 *
 * Vite+ manages runtimes under `~/.local/share/vite-plus/js_runtime`; a
 * developer can also point `IRISVIEW_NODE_BIN` at a compatible installation.
 */
export function managedNode(requiredVersion = "24.13.0"): ManagedNode {
  const override = process.env.IRISVIEW_NODE_BIN;
  if (override) {
    const candidate = resolve(override);
    const node = isDirectory(candidate) ? join(candidate, "node") : candidate;
    const version = nodeVersionOf(node);
    if (version !== requiredVersion) {
      throw new CliError(
        `IRISVIEW_NODE_BIN must point at Node.js ${requiredVersion}, found ${version ?? "unusable"}`,
      );
    }
    return { binDir: dirname(node), node, version, source: "IRISVIEW_NODE_BIN" };
  }

  const versionFile = join(workspaceRoot, ".node-version");
  const wanted = requiredVersion || (existsSync(versionFile) ? readText(versionFile).trim() : "");
  const layouts: Array<{ binDir: string; source: string }> = [
    {
      binDir: join(homedir(), ".local", "share", "vite-plus", "js_runtime", "node", wanted, "bin"),
      source: "Vite+ managed runtime",
    },
    {
      binDir: join(homedir(), ".nvm", "versions", "node", `v${wanted}`, "bin"),
      source: "nvm",
    },
    {
      binDir: join(
        homedir(),
        ".local",
        "share",
        "fnm",
        "node-versions",
        `v${wanted}`,
        "installation",
        "bin",
      ),
      source: "fnm",
    },
    {
      binDir: join("/usr", "local", "bin"),
      source: "system",
    },
  ];
  for (const layout of layouts) {
    const node = join(layout.binDir, "node");
    if (!existsSync(node)) continue;
    const version = nodeVersionOf(node);
    if (version !== wanted) continue;
    return { binDir: layout.binDir, node, version: wanted, source: layout.source };
  }

  const currentVersion = nodeVersionOf(process.execPath);
  if (currentVersion === wanted) {
    return {
      binDir: dirname(process.execPath),
      node: process.execPath,
      version: wanted,
      source: "current PATH",
    };
  }

  throw new CliError(
    `Node.js ${wanted} is required by the Developer Kit but was not found.\n` +
      "Install it with `vp env` (the repository pins .node-version), nvm/fnm, or set\n" +
      `IRISVIEW_NODE_BIN to the bin directory that contains Node.js ${wanted}.`,
  );
}

export function kitRelativePath(projectRoot: string, kitRoot: string): string {
  const value = relative(projectRoot, kitRoot).split("\\").join("/");
  return value.startsWith(".") ? value : `./${value}`;
}

export function pathExists(path: string): boolean {
  return existsSync(path);
}

export function readFileIfExists(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

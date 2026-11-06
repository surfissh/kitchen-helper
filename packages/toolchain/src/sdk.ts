import { existsSync } from "node:fs";
import { join } from "node:path";

import {
  hostCompatScript,
  hostOverrideEnabled,
  isSupportedHost,
  pythonCommand,
  readHostInfo,
} from "./kit.ts";
import { ensureStateRoot, managedNode, npmConfigDir, stateRoot } from "./paths.ts";
import { CliError, ensureDir, runInteractive, runOnce, truncate } from "./util.ts";

export interface SdkRunOptions {
  kitRoot: string;
  cwd?: string;
  /** Interactive sessions inherit stdio so Ctrl+C reaches the SDK. */
  interactive?: boolean;
  /** Extra environment appended to the compatibility environment. */
  env?: Record<string, string | undefined>;
  /** Forward the caller's stdout/stderr instead of capturing. */
  echo?: boolean;
}

export class SdkCommandError extends CliError {
  readonly stdout: string;
  readonly stderr: string;
  readonly parsed: unknown;

  constructor(message: string, stdout: string, stderr: string, parsed: unknown, exitCode = 1) {
    super(message, exitCode);
    this.name = "SdkCommandError";
    this.stdout = stdout;
    this.stderr = stderr;
    this.parsed = parsed;
  }
}

/**
 * Environment for the Python SDK.
 *
 * Besides pinning Node.js/npm to the exact versions declared by the Kit, this
 * isolates npm configuration (the developer's user npmrc may emit warnings to
 * stdout, which the Kit parses), keeps Python bytecode out of the immutable
 * Kit, and enables the unsupported-host override on non-Ubuntu desktop Linux.
 */
export function sdkEnvironment(
  kitRoot: string,
  extra: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  const node = managedNode();
  const npm = npmConfigDir();
  const host = readHostInfo();
  const override = hostOverrideEnabled() && !isSupportedHost(host);
  const tempRoot = join(stateRoot(), "tmp");
  const sandboxHome = join(stateRoot(), "home");
  ensureDir(tempRoot);
  ensureDir(sandboxHome);
  ensureStateRoot(stateRoot());

  const env: Record<string, string | undefined> = {
    ...process.env,
    // Keep Default Kit state inside the project-local state root so that
    // `run` and `state` agree and a read-only home directory cannot break the
    // session. Set IRISVIEW_SYSTEM_HOME=1 to use the real home directory.
    HOME: process.env.IRISVIEW_SYSTEM_HOME === "1" ? process.env.HOME : sandboxHome,
    PYTHONDONTWRITEBYTECODE: "1",
    FUSIONUI_DEVELOPER_KIT_ROOT: kitRoot,
    PATH: `${node.binDir}:${process.env.PATH ?? ""}`,
    NPM_CONFIG_USERCONFIG: join(npm, "user.npmrc"),
    NPM_CONFIG_GLOBALCONFIG: join(npm, "global.npmrc"),
    NPM_CONFIG_UPDATE_NOTIFIER: "false",
    TMPDIR: tempRoot,
    LANG: process.env.LANG ?? "C.UTF-8",
  };
  if (override) {
    env.IRISVIEW_ALLOW_UNSUPPORTED_HOST = host.id;
  } else {
    delete env.IRISVIEW_ALLOW_UNSUPPORTED_HOST;
  }
  for (const [key, value] of Object.entries(extra)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
  return env;
}

function sdkCommand(args: readonly string[]): { command: string; argv: string[] } {
  return {
    command: pythonCommand(),
    argv: [hostCompatScript(), ...args],
  };
}

function parseSdkJson(stdout: string): unknown {
  const lines = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index] as string;
    if (!line.startsWith("{")) continue;
    try {
      return JSON.parse(line) as unknown;
    } catch {
      // Keep looking: the SDK may print progress lines first.
    }
  }
  return null;
}

/** Run an SDK command and return its parsed JSON result. */
export async function runSdk<T = Record<string, unknown>>(
  args: readonly string[],
  options: SdkRunOptions,
): Promise<T> {
  const env = sdkEnvironment(options.kitRoot, options.env);
  const { command, argv } = sdkCommand(args);
  ensureDir(join(stateRoot(), "tmp"));

  if (options.interactive === true) {
    const code = await runInteractive(command, argv, { cwd: options.cwd, env });
    if (code !== 0) {
      throw new SdkCommandError(`IrisView session exited with status ${code}`, "", "", null, code);
    }
    return {} as T;
  }

  const result = runOnce(command, argv, { cwd: options.cwd, env, allowFailure: true });
  const parsed = parseSdkJson(result.stdout);
  if (options.echo === true) {
    if (result.stdout.trim()) console.log(result.stdout.trim());
    if (result.stderr.trim()) console.error(result.stderr.trim());
  }
  if (result.code !== 0) {
    const message =
      result.stderr.trim() ||
      (parsed ? JSON.stringify(parsed) : result.stdout.trim()) ||
      `SDK command failed with exit ${result.code}`;
    throw new SdkCommandError(
      truncate(message, 4000),
      result.stdout,
      result.stderr,
      parsed,
      result.code,
    );
  }
  if (parsed === null) {
    throw new SdkCommandError(
      `SDK command produced no JSON result: irisview ${args.join(" ")}`,
      result.stdout,
      result.stderr,
      null,
      1,
    );
  }
  return parsed as T;
}

/** Run an SDK command without requiring a JSON result (for `--dry-run` etc). */
export async function runSdkPassthrough(
  args: readonly string[],
  options: SdkRunOptions,
): Promise<number> {
  const env = sdkEnvironment(options.kitRoot, options.env);
  const { command, argv } = sdkCommand(args);
  return runInteractive(command, argv, { cwd: options.cwd, env });
}

export function sdkDocHint(kitRoot: string): string {
  return join(kitRoot, "bin", "irisview");
}

export function sdkInstalled(kitRoot: string): boolean {
  return existsSync(join(kitRoot, "sdk", "fusionui-app-sdk", "fusionui_sdk.py"));
}

export function nodePinEnvironment(kitRoot: string): Record<string, string | undefined> {
  // Exposed for tests: the SDK requires these variables to be present.
  return sdkEnvironment(kitRoot);
}

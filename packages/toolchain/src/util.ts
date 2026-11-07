import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

/** Error type whose message is presented to the user without a stack trace. */
export class CliError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

const color = process.stdout.isTTY === true;
const paint = (code: string, text: string): string =>
  color ? `\u001b[${code}m${text}\u001b[0m` : text;

export const style = {
  bold: (text: string) => paint("1", text),
  dim: (text: string) => paint("2", text),
  red: (text: string) => paint("31", text),
  green: (text: string) => paint("32", text),
  yellow: (text: string) => paint("33", text),
  blue: (text: string) => paint("34", text),
  cyan: (text: string) => paint("36", text),
};

const silent = (): boolean => process.env.IRISVIEW_QUIET === "1";
const verbose = (): boolean => process.env.IRISVIEW_VERBOSE === "1";

export const log = {
  step(message: string): void {
    if (!silent()) console.log(`${style.cyan("▸")} ${message}`);
  },
  info(message: string): void {
    if (!silent()) console.log(`  ${message}`);
  },
  detail(message: string): void {
    if (!silent() && verbose()) console.log(`  ${style.dim(message)}`);
  },
  ok(message: string): void {
    if (!silent()) console.log(`${style.green("✓")} ${message}`);
  },
  warn(message: string): void {
    if (!silent()) console.log(`${style.yellow("!")} ${message}`);
  },
  error(message: string): void {
    console.error(`${style.red("✗")} ${message}`);
  },
  plain(message: string): void {
    if (!silent()) console.log(message);
  },
};

export interface RunOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
  input?: string;
  allowFailure?: boolean;
  timeoutMs?: number;
}

export interface RunResult {
  code: number;
  signal: string | null;
  stdout: string;
  stderr: string;
}

/** Run a child process and capture its output. */
export function runOnce(
  command: string,
  args: readonly string[] = [],
  options: RunOptions = {},
): RunResult {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    encoding: "utf8",
    input: options.input,
    timeout: options.timeoutMs,
  });
  const stdout = typeof result.stdout === "string" ? result.stdout : "";
  const stderr = typeof result.stderr === "string" ? result.stderr : "";
  const code = result.status ?? (result.error ? 1 : 0);
  if (code !== 0 && !options.allowFailure) {
    const detail = (stderr || stdout).trim();
    throw new CliError(
      `${command} ${args.join(" ")} failed (exit ${code})${detail ? `:\n${detail}` : ""}`,
      code,
    );
  }
  return { code, signal: result.signal ?? null, stdout, stderr };
}

/**
 * Run a long-lived, interactive child (the simulator session). Ctrl+C is
 * forwarded so the SDK can tear down its own process group cleanly.
 */
export function runInteractive(
  command: string,
  args: readonly string[] = [],
  options: RunOptions = {},
): Promise<number> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: "inherit",
    });
    let settled = false;
    const forward = (): void => {
      try {
        child.kill("SIGINT");
      } catch {
        /* the child may already be gone */
      }
    };
    process.on("SIGINT", forward);
    process.on("SIGTERM", forward);
    child.on("error", (error) => {
      process.off("SIGINT", forward);
      process.off("SIGTERM", forward);
      if (!settled) {
        settled = true;
        rejectPromise(new CliError(`cannot start ${command}: ${error.message}`));
      }
    });
    child.on("exit", (code, signal) => {
      process.off("SIGINT", forward);
      process.off("SIGTERM", forward);
      if (settled) return;
      settled = true;
      resolvePromise(code ?? (signal ? 130 : 1));
    });
  });
}

export function sha256Bytes(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

export function sha256File(path: string): string {
  return sha256Bytes(readFileSync(path));
}

export function readText(path: string): string {
  return readFileSync(path, "utf8");
}

export function readJson<T = unknown>(path: string): T {
  return JSON.parse(readText(path)) as T;
}

export function writeJson(path: string, value: unknown, indent = 2): void {
  ensureDir(dirname(path));
  writeFileSync(path, `${JSON.stringify(value, null, indent)}\n`);
}

export function writeText(path: string, data: string): void {
  ensureDir(dirname(path));
  writeFileSync(path, data);
}

const encoder = new TextEncoder();

/** UTF-8 encode without depending on the Node Buffer global type. */
export function utf8(text: string): Uint8Array {
  return encoder.encode(text);
}

/** Write a file only when its bytes differ; returns true when it changed. */
export function writeIfChanged(path: string, data: string | Uint8Array): boolean {
  const next = typeof data === "string" ? utf8(data) : data;
  if (existsSync(path)) {
    const current = readFileSync(path);
    if (current.length === next.length && sha256Bytes(current) === sha256Bytes(next)) {
      return false;
    }
  }
  ensureDir(dirname(path));
  writeFileSync(path, next);
  return true;
}

export function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

export function exists(path: string): boolean {
  return existsSync(path);
}

export function isDirectory(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory();
}

export function isFile(path: string): boolean {
  return existsSync(path) && statSync(path).isFile();
}

export function removeTree(path: string): void {
  rmSync(path, { recursive: true, force: true });
}

export function copyTree(source: string, destination: string): void {
  cpSync(source, destination, { recursive: true });
}

export function listFiles(root: string, options: { skip?: string[] } = {}): string[] {
  const skip = new Set(options.skip ?? []);
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (skip.has(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) files.push(path);
    }
  };
  if (existsSync(root) && isDirectory(root)) visit(root);
  return files.sort();
}

export function relativeTo(root: string, path: string): string {
  return relative(resolve(root), resolve(path)).split("\\").join("/");
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

export function truncate(text: string, limit = 2000): string {
  const trimmed = text.trim();
  return trimmed.length <= limit ? trimmed : `${trimmed.slice(0, limit)}\n…`;
}

export type FlagType = "boolean" | "string" | "string[]";

export interface FlagSpec {
  type: FlagType;
  alias?: string;
  description: string;
  valueHint?: string;
}

export interface ParsedFlags {
  positionals: string[];
  flags: Record<string, string | boolean | string[]>;
}

/**
 * Small, dependency-free flag parser. Supports `--name value`, `--name=value`,
 * repeated flags for `string[]`, boolean flags and `-a` aliases.
 */
export function parseFlags(args: readonly string[], specs: Record<string, FlagSpec>): ParsedFlags {
  const byAlias = new Map<string, string>();
  for (const [name, spec] of Object.entries(specs)) {
    if (spec.alias) byAlias.set(spec.alias, name);
  }
  const flags: Record<string, string | boolean | string[]> = {};
  for (const [name, spec] of Object.entries(specs)) {
    flags[name] = spec.type === "string[]" ? [] : spec.type === "boolean" ? false : "";
  }
  const positionals: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index] as string;
    if (!argument.startsWith("-") || argument === "-") {
      positionals.push(argument);
      continue;
    }
    if (argument === "--") {
      positionals.push(...args.slice(index + 1));
      break;
    }
    const body = argument.replace(/^--?/, "");
    const equals = body.indexOf("=");
    const rawName = equals === -1 ? body : body.slice(0, equals);
    const name = byAlias.get(rawName) ?? rawName;
    const spec = specs[name];
    if (!spec) throw new CliError(`unknown option: ${argument}`, 2);
    if (spec.type === "boolean") {
      if (equals !== -1) throw new CliError(`option --${name} does not take a value`, 2);
      flags[name] = true;
      continue;
    }
    const value = equals !== -1 ? body.slice(equals + 1) : args[(index += 1)];
    if (value === undefined) throw new CliError(`option --${name} requires a value`, 2);
    if (spec.type === "string[]") {
      (flags[name] as string[]).push(value);
    } else {
      flags[name] = value;
    }
  }
  return { positionals, flags };
}

export function flagString(parsed: ParsedFlags, name: string): string | undefined {
  const value = parsed.flags[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function flagBoolean(parsed: ParsedFlags, name: string): boolean {
  return parsed.flags[name] === true;
}

export function flagList(parsed: ParsedFlags, name: string): string[] {
  const value = parsed.flags[name];
  return Array.isArray(value) ? value : [];
}

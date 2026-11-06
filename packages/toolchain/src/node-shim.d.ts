/**
 * Minimal Node.js type surface for this workspace.
 *
 * The repository intentionally has no `@types/node` dependency so that the
 * toolchain stays installable in the offline Developer Kit environment. These
 * declarations cover exactly the APIs the toolchain uses; application
 * developers can add `@types/node` for the full surface.
 */

declare const process: {
  env: Record<string, string | undefined>;
  argv: string[];
  execPath: string;
  platform: string;
  arch: string;
  version: string;
  pid: number;
  exitCode: number | undefined;
  cwd(): string;
  chdir(directory: string): void;
  exit(code?: number): never;
  on(event: string, listener: (...args: any[]) => void): void;
  off(event: string, listener: (...args: any[]) => void): void;
  stdout: { write(data: string): boolean; isTTY?: boolean };
  stderr: { write(data: string): boolean; isTTY?: boolean };
  stdin: {
    isTTY?: boolean;
    on(event: "data", listener: (chunk: Uint8Array) => void): void;
    setEncoding(encoding: string): void;
  };
};

declare const console: {
  log(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
};

declare function setTimeout(callback: () => void, milliseconds?: number): unknown;
declare function clearTimeout(handle: unknown): void;
declare const URL: {
  new (input: string): { pathname: string; protocol: string; href: string };
};

interface ImportMeta {
  readonly dirname: string;
  readonly filename: string;
  readonly url: string;
}

declare module "node:fs" {
  export interface Stats {
    isFile(): boolean;
    isDirectory(): boolean;
    isSymbolicLink(): boolean;
    size: number;
    mode: number;
    mtimeMs: number;
  }
  export interface Dirent {
    name: string;
    isFile(): boolean;
    isDirectory(): boolean;
    isSymbolicLink(): boolean;
  }
  export interface ReaddirOptions {
    withFileTypes: true;
  }
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function readFileSync(path: string): Uint8Array;
  export function writeFileSync(path: string, data: string | Uint8Array): void;
  export function existsSync(path: string): boolean;
  export function statSync(path: string): Stats;
  export function lstatSync(path: string): Stats;
  export function readdirSync(path: string): string[];
  export function readdirSync(path: string, options: ReaddirOptions): Dirent[];
  export function mkdirSync(path: string, options?: { recursive?: boolean }): string | undefined;
  export function rmSync(path: string, options?: { recursive?: boolean; force?: boolean }): void;
  export function copyFileSync(source: string, destination: string): void;
  export function cpSync(
    source: string,
    destination: string,
    options?: { recursive?: boolean },
  ): void;
  export function chmodSync(path: string, mode: number): void;
  export function realpathSync(path: string): string;
}

declare module "node:path" {
  export function join(...parts: string[]): string;
  export function resolve(...parts: string[]): string;
  export function dirname(path: string): string;
  export function basename(path: string, suffix?: string): string;
  export function extname(path: string): string;
  export function relative(from: string, to: string): string;
  export function isAbsolute(path: string): boolean;
  export function normalize(path: string): string;
  export const sep: string;
}

declare module "node:child_process" {
  export interface SpawnOptions {
    cwd?: string;
    env?: Record<string, string | undefined>;
    stdio?: "inherit" | "pipe" | "ignore" | ("inherit" | "pipe" | "ignore")[];
    shell?: boolean;
    detached?: boolean;
  }
  export interface PipeStream {
    on(event: "data", listener: (chunk: Uint8Array | string) => void): void;
    setEncoding(encoding: string): void;
    pipe(destination: unknown): void;
  }
  export interface ChildProcess {
    pid?: number;
    exitCode: number | null;
    signalCode: string | null;
    killed: boolean;
    stdout: PipeStream | null;
    stderr: PipeStream | null;
    stdin: { write(data: string): void; end(): void } | null;
    on(event: "exit", listener: (code: number | null, signal: string | null) => void): this;
    on(event: "error", listener: (error: Error) => void): this;
    kill(signal?: string): boolean;
  }
  export function spawn(
    command: string,
    args?: readonly string[],
    options?: SpawnOptions,
  ): ChildProcess;
  export interface SpawnSyncOptions {
    cwd?: string;
    env?: Record<string, string | undefined>;
    encoding?: "utf8";
    input?: string;
    timeout?: number;
  }
  export interface SpawnSyncReturns {
    status: number | null;
    signal: string | null;
    stdout: string;
    stderr: string;
    error?: Error;
  }
  export function spawnSync(
    command: string,
    args?: readonly string[],
    options?: SpawnSyncOptions,
  ): SpawnSyncReturns;
}

declare module "node:crypto" {
  export interface Hash {
    update(data: string | Uint8Array, inputEncoding?: string): Hash;
    digest(encoding: "hex"): string;
    digest(): Uint8Array;
  }
  export function createHash(algorithm: string): Hash;
}

declare module "node:os" {
  export function homedir(): string;
  export function tmpdir(): string;
  export function platform(): string;
  export function arch(): string;
  export function release(): string;
}

declare module "node:url" {
  export function fileURLToPath(url: string | URL): string;
  export function pathToFileURL(path: string): URL;
}

declare module "node:module" {
  export interface Require {
    (id: string): any;
    resolve(id: string, options?: { paths?: string[] }): string;
  }
  export function createRequire(filename: string | URL): Require;
  export const builtinModules: string[];
}

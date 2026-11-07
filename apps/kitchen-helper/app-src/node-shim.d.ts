/**
 * Minimal runtime declarations for this application.
 * Add `@types/node` as a dev dependency if the full Node.js surface is needed.
 */

declare const process: {
  env: Record<string, string | undefined>;
  platform: string;
  cwd(): string;
};

/** The Client loads the bundle as a CommonJS module, so `__dirname` is `src/`. */
declare const __dirname: string;

declare module "node:fs" {
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function writeFileSync(path: string, data: string): void;
  export function existsSync(path: string): boolean;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void;
  export function mkdtempSync(prefix: string): string;
  export function rmSync(path: string, options?: { recursive?: boolean; force?: boolean }): void;
}

declare module "node:buffer" {
  export class Buffer {
    static from(data: string, encoding: "base64"): Buffer;
    toString(encoding: "utf8"): string;
  }
}

declare module "node:path" {
  export function join(...parts: string[]): string;
  export function dirname(path: string): string;
  export function isAbsolute(path: string): boolean;
  export function normalize(path: string): string;
  export const sep: string;
}

declare module "node:os" {
  export function tmpdir(): string;
}

declare module "node:test" {
  export function test(name: string, callback: () => void | Promise<void>): void;
  export function describe(name: string, callback: () => void): void;
  export function it(name: string, callback: () => void | Promise<void>): void;
}

declare module "node:assert/strict" {
  const assert: {
    equal(actual: unknown, expected: unknown, message?: string): void;
    notEqual(actual: unknown, expected: unknown, message?: string): void;
    deepEqual(actual: unknown, expected: unknown, message?: string): void;
    ok(value: unknown, message?: string): void;
    throws(fn: () => unknown, message?: string): void;
    rejects(promise: Promise<unknown>, error?: unknown, message?: string): Promise<void>;
    match(value: string, pattern: RegExp, message?: string): void;
  };
  export default assert;
}

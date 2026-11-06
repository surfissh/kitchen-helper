/**
 * Minimal runtime declarations for generated applications.
 *
 * The template intentionally does not require `@types/node`; add it as a dev
 * dependency when the application needs the full Node.js type surface.
 */

declare const process: {
  env: Record<string, string | undefined>;
  platform: string;
  cwd(): string;
};

declare module "node:fs" {
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function writeFileSync(path: string, data: string): void;
  export function existsSync(path: string): boolean;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void;
}

declare module "node:path" {
  export function join(...parts: string[]): string;
  export function dirname(path: string): string;
  export function isAbsolute(path: string): boolean;
  export function normalize(path: string): string;
}

declare module "node:test" {
  export function test(name: string, callback: () => void | Promise<void>): void;
  export function describe(name: string, callback: () => void): void;
  export function it(name: string, callback: () => void | Promise<void>): void;
}

declare module "node:assert/strict" {
  const assert: {
    equal(actual: unknown, expected: unknown, message?: string): void;
    deepEqual(actual: unknown, expected: unknown, message?: string): void;
    ok(value: unknown, message?: string): void;
    throws(fn: () => unknown, message?: string): void;
  };
  export default assert;
}

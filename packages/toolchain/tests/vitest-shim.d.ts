/**
 * Minimal Vitest surface used by the toolchain tests. The workspace runs
 * Vitest through Vite+; this declaration keeps `tsc` independent of the
 * transitive Vitest typings.
 */

declare module "vitest" {
  export interface Expectation {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toContain(expected: unknown): void;
    toMatch(expected: string | RegExp): void;
    toBeGreaterThan(expected: number): void;
    toBeGreaterThanOrEqual(expected: number): void;
    toBeLessThan(expected: number): void;
    toThrow(expected?: string | RegExp): void;
    not: Expectation;
  }
  export function describe(name: string, callback: () => void): void;
  export function it(name: string, callback: () => void | Promise<void>): void;
  export function test(name: string, callback: () => void | Promise<void>): void;
  export function beforeEach(callback: () => void | Promise<void>): void;
  export function afterEach(callback: () => void | Promise<void>): void;
  export function expect(actual: unknown): Expectation;
}

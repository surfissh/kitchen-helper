import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import type { ProjectLayout } from "./project.ts";
import { CliError, ensureDir, removeTree, runOnce, truncate, writeText } from "./util.ts";

const requireFromToolchain = createRequire(import.meta.url);

/** Built-in modules kept as runtime `require()` calls by the bundler. */
const NODE_BUILTINS = [
  "assert",
  "buffer",
  "child_process",
  "crypto",
  "events",
  "fs",
  "http",
  "https",
  "net",
  "os",
  "path",
  "perf_hooks",
  "process",
  "stream",
  "string_decoder",
  "timers",
  "tty",
  "url",
  "util",
  "v8",
  "vm",
  "worker_threads",
  "zlib",
];

/** Modules supplied by the IrisView Client at runtime. */
const CLIENT_MODULES = [
  /^@irisview\/osx(?:\/.*)?$/,
  /^FusionUISimulatorBinding$/,
  /^@fusionui\/.*$/,
];

const BUILD_STAGING = ".ivt-build";

function resolveTypeScriptCli(): string {
  try {
    const packageJsonPath = requireFromToolchain.resolve("typescript/package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      bin?: Record<string, string>;
    };
    const bin = packageJson.bin?.tsc;
    if (bin) {
      const path = join(dirname(packageJsonPath), bin);
      if (existsSync(path)) return path;
    }
  } catch {
    // Fall through to the workspace binary lookup.
  }
  for (const candidate of [
    join(process.cwd(), "node_modules", "typescript", "bin", "tsc"),
    join(dirname(process.execPath), "..", "lib", "node_modules", "typescript", "bin", "tsc"),
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  throw new CliError(
    "TypeScript compiler not found. Install it in the application project " +
      "(`npm install --save-dev typescript`) or run the toolchain from the workspace.",
  );
}

export interface TypecheckResult {
  ok: boolean;
  output: string;
  command: string;
}

/** Run `tsc --noEmit` against the application's generated tsconfig. */
export function typecheckProject(project: ProjectLayout): TypecheckResult {
  if (!existsSync(project.tsconfigPath)) {
    throw new CliError(
      `application tsconfig.json is missing: ${project.tsconfigPath}\n` +
        "Re-scaffold the project with `ivt new` or add a tsconfig that maps " +
        "@irisview/osx/* to the Developer Kit public API declarations.",
    );
  }
  const compiler = resolveTypeScriptCli();
  const result = runOnce(process.execPath, [compiler, "-p", project.tsconfigPath, "--noEmit"], {
    cwd: project.root,
    allowFailure: true,
  });
  return {
    ok: result.code === 0,
    output: `${result.stdout}${result.stderr}`.trim(),
    command: `tsc -p ${project.tsconfigPath}`,
  };
}

export interface BundleResult {
  bundlePath: string;
  bytes: number;
}

/**
 * Bundle `app-src/index.ts` into the single CommonJS entry the Client loads.
 *
 * Client modules and Node built-ins stay external: the Client provides them.
 * The application's own modules and any third-party runtime libraries are
 * bundled into `src/index.js`.
 */
export async function bundleProject(project: ProjectLayout): Promise<BundleResult> {
  const staging = join(project.root, BUILD_STAGING);
  removeTree(staging);
  ensureDir(staging);

  const { build } = await import("vite");
  await build({
    configFile: false,
    publicDir: false,
    logLevel: "warn",
    root: project.root,
    build: {
      target: "node24",
      minify: false,
      emptyOutDir: true,
      outDir: staging,
      lib: {
        entry: project.entry,
        formats: ["cjs"],
        fileName: () => "index.js",
      },
      rollupOptions: {
        external: [
          ...CLIENT_MODULES,
          ...NODE_BUILTINS.map((name) => new RegExp(`^${name}$`)),
          /^node:/,
        ],
        output: {
          entryFileNames: "index.js",
          exports: "auto",
        },
      },
    },
  });

  const built = join(staging, "index.js");
  if (!existsSync(built)) {
    throw new CliError(`bundler did not produce ${built}`);
  }
  const bundle = readFileSync(built, "utf8");
  ensureDir(project.sourceDirectory);
  writeText(project.bundlePath, bundle);
  removeTree(staging);
  return { bundlePath: project.bundlePath, bytes: bundle.length };
}

export interface AppBuildResult {
  typecheck: TypecheckResult;
  bundle: BundleResult;
}

/** Typecheck then bundle. The packaged `src/index.js` is replaced. */
export async function buildProject(project: ProjectLayout): Promise<AppBuildResult> {
  const typecheck = typecheckProject(project);
  if (!typecheck.ok) {
    throw new CliError(`type check failed:\n${truncate(typecheck.output, 8000)}`);
  }
  const bundle = await bundleProject(project);
  return { typecheck, bundle };
}

/** Run the project's own `node --test` TypeScript/JavaScript test files. */
export function runProjectTests(
  project: ProjectLayout,
  nodeBinary?: string,
): { ok: boolean; output: string; files: string[] } {
  const tests = collectTestFiles(project.root);
  if (tests.length === 0) {
    return { ok: true, output: "no application tests found", files: [] };
  }
  const result = runOnce(nodeBinary ?? process.execPath, ["--test", ...tests], {
    cwd: project.root,
    allowFailure: true,
    env: { ...process.env, IRISVIEW_APP_ROOT: project.root },
  });
  return {
    ok: result.code === 0,
    output: `${result.stdout}${result.stderr}`.trim(),
    files: tests,
  };
}

export function collectTestFiles(root: string): string[] {
  const results: string[] = [];
  const visit = (directory: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(directory);
    } catch {
      return;
    }
    for (const entry of entries.sort()) {
      if (entry === "node_modules" || entry === "dist" || entry.startsWith(".")) continue;
      const path = join(directory, entry);
      const info = statSync(path);
      if (info.isDirectory()) visit(path);
      else if (entry.endsWith(".test.ts") || entry.endsWith(".test.js")) results.push(path);
    }
  };
  visit(join(root, "tests"));
  return results;
}

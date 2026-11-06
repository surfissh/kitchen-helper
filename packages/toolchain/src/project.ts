import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { CliError, isDirectory, readJson, writeJson } from "./util.ts";

export interface ProjectConfig {
  schemaVersion: 1;
  manifest: string;
  sourceDirectory: string;
  outputDirectory: string;
}

export interface AppManifest {
  schemaVersion: 1;
  id: string;
  version: string;
  versionCode: number;
  displayName: { en: string; "zh-CN"?: string };
  role: "ordinary" | "specialized";
  controlProfile: string;
  capabilities: string[];
  minimumHostVersion: number;
}

export interface ProjectLayout {
  root: string;
  configPath: string;
  config: ProjectConfig;
  manifestPath: string;
  manifest: AppManifest;
  /** Authored TypeScript entry point (toolchain convention). */
  appSourceDirectory: string;
  entry: string;
  /** Packaged source directory copied by the SDK. */
  sourceDirectory: string;
  outputDirectory: string;
  tsconfigPath: string;
  /** Where the bundled CommonJS entry is written. */
  bundlePath: string;
}

const CONFIG_FIELDS = ["manifest", "outputDirectory", "schemaVersion", "sourceDirectory"] as const;
const APP_ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const VERSION = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export function isApplicationId(value: string): boolean {
  return APP_ID.test(value);
}

/** Resolve a project directory (defaults to the current working directory). */
export function findProject(argument?: string): ProjectLayout {
  const root = resolve(argument ?? process.cwd());
  if (!isDirectory(root)) {
    throw new CliError(`application project does not exist: ${root}`);
  }
  return loadProject(root);
}

export function loadProject(rootArgument: string): ProjectLayout {
  const root = resolve(rootArgument);
  const configPath = join(root, "fusionui.config.json");
  if (!existsSync(configPath)) {
    throw new CliError(
      `not an IrisView application project (missing fusionui.config.json): ${root}\n` +
        "Create one with `ivt new <directory> --id <application.id>`.",
    );
  }
  const raw = readJson<Record<string, unknown>>(configPath);
  const unknown = Object.keys(raw).filter(
    (key) => !(CONFIG_FIELDS as readonly string[]).includes(key),
  );
  const missing = CONFIG_FIELDS.filter((key) => !(key in raw));
  if (unknown.length > 0 || missing.length > 0) {
    throw new CliError(
      `invalid fusionui.config.json fields: ${[
        ...missing.map((key) => `missing ${key}`),
        ...unknown.map((key) => `unknown ${key}`),
      ].join(", ")}`,
    );
  }
  if (raw.schemaVersion !== 1) {
    throw new CliError(
      `unsupported fusionui.config.json schemaVersion: ${String(raw.schemaVersion)}`,
    );
  }
  const config: ProjectConfig = {
    schemaVersion: 1,
    manifest: String(raw.manifest),
    sourceDirectory: String(raw.sourceDirectory),
    outputDirectory: String(raw.outputDirectory),
  };
  const manifestPath = join(root, config.manifest);
  if (!existsSync(manifestPath)) {
    throw new CliError(`application manifest is missing: ${manifestPath}`);
  }
  const manifestRaw = readJson<Record<string, unknown>>(manifestPath);
  const manifest = validateManifest(manifestRaw, manifestPath);

  const sourceDirectory = join(root, config.sourceDirectory);
  const bundlePath = join(sourceDirectory, "index.js");
  const appSourceDirectory = join(root, "app-src");
  const entry = join(appSourceDirectory, "index.ts");

  if (!existsSync(join(sourceDirectory, "XRManifest.xml"))) {
    throw new CliError(`packaged source must contain XRManifest.xml: ${sourceDirectory}`);
  }
  if (!existsSync(appSourceDirectory)) {
    throw new CliError(
      `TypeScript entry directory is missing: ${appSourceDirectory}\n` +
        "This toolchain builds app-src/index.ts into src/index.js. " +
        "Keep XRManifest.xml and packaged assets under src/.",
    );
  }

  return {
    root,
    configPath,
    config,
    manifestPath,
    manifest,
    appSourceDirectory,
    entry,
    sourceDirectory,
    outputDirectory: join(root, config.outputDirectory),
    tsconfigPath: join(root, "tsconfig.json"),
    bundlePath,
  };
}

export function validateManifest(raw: Record<string, unknown>, path: string): AppManifest {
  const id = String(raw.id ?? "");
  if (!isApplicationId(id)) {
    throw new CliError(`application id must use lowercase dot or dash-separated tokens: ${path}`);
  }
  const version = String(raw.version ?? "");
  if (!VERSION.test(version)) {
    throw new CliError(`application version must contain three integers: ${path}`);
  }
  if (!Number.isInteger(raw.versionCode) || (raw.versionCode as number) < 1) {
    throw new CliError(`application versionCode must be a positive integer: ${path}`);
  }
  const displayName = raw.displayName as Record<string, unknown> | undefined;
  if (!displayName || typeof displayName.en !== "string" || displayName.en.length === 0) {
    throw new CliError(`application displayName.en is required: ${path}`);
  }
  if (raw.schemaVersion !== 1) {
    throw new CliError(
      `unsupported application manifest schemaVersion: ${String(raw.schemaVersion)}`,
    );
  }
  return {
    schemaVersion: 1,
    id,
    version,
    versionCode: raw.versionCode as number,
    displayName: {
      en: displayName.en,
      ...(typeof displayName["zh-CN"] === "string" ? { "zh-CN": displayName["zh-CN"] } : {}),
    },
    role: (raw.role === "specialized" ? "specialized" : "ordinary") as AppManifest["role"],
    controlProfile: String(raw.controlProfile ?? "generic"),
    capabilities: Array.isArray(raw.capabilities) ? raw.capabilities.map(String) : [],
    minimumHostVersion: Number(raw.minimumHostVersion ?? 1),
  };
}

export function readManifestText(project: ProjectLayout): Record<string, unknown> {
  return JSON.parse(readFileSync(project.manifestPath, "utf8")) as Record<string, unknown>;
}

/** Increment `versionCode` in-place; used by `ivt version bump`. */
export function bumpVersionCode(project: ProjectLayout): AppManifest {
  const raw = readManifestText(project);
  raw.versionCode = (Number(raw.versionCode) || 0) + 1;
  const next = validateManifest(raw, project.manifestPath);
  writeManifest(project, next);
  return next;
}

function writeManifest(project: ProjectLayout, manifest: AppManifest): void {
  // Preserve the authored key order and only replace the value.
  const raw = readManifestText(project);
  raw.versionCode = manifest.versionCode;
  writeJson(project.manifestPath, raw);
}

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { isApplicationId } from "./project.ts";
import { CliError, ensureDir, isDirectory, runOnce, writeText } from "./util.ts";

export interface ScaffoldOptions {
  directory: string;
  id: string;
  name: string;
  nameZh?: string;
  kitRoot: string;
  initializeGit?: boolean;
}

export interface ScaffoldResult {
  directory: string;
  applicationId: string;
  files: string[];
  git: { initialized: boolean; revision: string | null };
}

const templateDirectory = join(import.meta.dirname, "..", "templates", "ts-app");

function templatePath(name: string): string {
  return join(templateDirectory, name);
}

function render(content: string, values: Record<string, string>): string {
  let result = content;
  for (const [key, value] of Object.entries(values)) {
    result = result.split(`__${key}__`).join(value);
  }
  return result;
}

export function discoverTemplateFiles(): string[] {
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory).sort()) {
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) visit(path);
      else files.push(relative(templateDirectory, path));
    }
  };
  visit(templateDirectory);
  return files;
}

/**
 * Create a TypeScript IrisView application from the bundled template.
 *
 * The generated project keeps authored TypeScript in `app-src/`, the packaged
 * CommonJS entry in `src/index.js`, and resources/`XRManifest.xml` under
 * `src/`, matching the Developer Kit's "prebuilt JavaScript" contract.
 */
export function scaffoldProject(options: ScaffoldOptions): ScaffoldResult {
  if (!isApplicationId(options.id)) {
    throw new CliError(
      "application id must use lowercase dot or dash-separated tokens (for example com.example.recipe)",
    );
  }
  if (!existsSync(templateDirectory)) {
    throw new CliError(`bundled template is missing: ${templateDirectory}`);
  }
  const directory = options.directory;
  const resolved = join(directory);
  if (existsSync(resolved)) {
    if (!isDirectory(resolved))
      throw new CliError(`destination exists and is not a directory: ${resolved}`);
    if (readdirSync(resolved).length > 0)
      throw new CliError(`destination is not empty: ${resolved}`);
  }
  ensureDir(resolved);

  const kitRelative = relative(resolved, options.kitRoot).split("\\").join("/");
  const kitPath = kitRelative.startsWith(".") ? kitRelative : `./${kitRelative}`;
  const nameZh = options.nameZh ?? options.name;
  const values: Record<string, string> = {
    APP_ID: options.id,
    APP_NAME: options.name,
    APP_NAME_ZH: nameZh,
    APP_NAME_XML: escapeXml(options.name),
    KIT_PATH: kitPath,
  };

  const written: string[] = [];
  for (const relativePath of discoverTemplateFiles()) {
    const source = templatePath(relativePath);
    const destination = relativePath.endsWith(".tpl")
      ? join(resolved, relativePath.slice(0, -".tpl".length))
      : join(resolved, relativePath);
    const content = render(readFileSync(source, "utf8"), values);
    writeText(destination, content);
    written.push(relativePath.slice(0, -".tpl".length));
  }

  const git =
    options.initializeGit === false
      ? { initialized: false, revision: null }
      : initializeGitRepository(resolved);
  return { directory: resolved, applicationId: options.id, files: written, git };
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function initializeGitRepository(directory: string): {
  initialized: boolean;
  revision: string | null;
} {
  const existing = runOnce("git", ["-C", directory, "rev-parse", "--show-toplevel"], {
    allowFailure: true,
  });
  if (existing.code === 0 && existing.stdout.trim() !== "") {
    const head = runOnce("git", ["-C", directory, "rev-parse", "--verify", "HEAD"], {
      allowFailure: true,
    });
    return { initialized: false, revision: head.code === 0 ? head.stdout.trim() : null };
  }
  const init = runOnce("git", ["init", "--initial-branch=main", directory], { allowFailure: true });
  if (init.code !== 0) return { initialized: false, revision: null };
  runOnce("git", ["-C", directory, "add", "--", "."], { allowFailure: true });
  const commit = runOnce(
    "git",
    [
      "-C",
      directory,
      "-c",
      "user.name=IrisView TypeScript Toolchain",
      "-c",
      "user.email=irisview-toolchain@localhost",
      "-c",
      "core.hooksPath=/dev/null",
      "commit",
      "--no-gpg-sign",
      "-m",
      "chore: initialize IrisView TypeScript application",
    ],
    { allowFailure: true },
  );
  const head = runOnce("git", ["-C", directory, "rev-parse", "--verify", "HEAD"], {
    allowFailure: true,
  });
  return {
    initialized: commit.code === 0,
    revision: head.code === 0 ? head.stdout.trim() : null,
  };
}

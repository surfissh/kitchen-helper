import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { sha256File } from "../util.ts";
import { buildProject } from "../build.ts";
import { findProject } from "../project.ts";
import { runSdk, runSdkPassthrough } from "../sdk.ts";
import { CliError, ensureDir, log } from "../util.ts";
import {
  artifactDirectory,
  ensureRuntimeReady,
  resolvePackageArgument,
  writeLatestRecord,
  type ArtifactRecord,
  type Context,
} from "./shared.ts";

export interface RunOptions {
  package?: string;
  latest: boolean;
  project?: string;
  profile: "release" | "diagnostic";
  displayMode: "mono" | "stereo";
  audioMode: "desktop" | "silent";
  port: number;
  /** Isolated simulator state directory; unset means the Kit's shared state. */
  stateDir?: string;
  allowDebugReplace: boolean;
  dryRun: boolean;
}

/** Append the optional isolated state directory to an SDK `run` argument list. */
function appendStateDir(args: string[], options: RunOptions): void {
  if (options.stateDir) args.push("--state-dir", options.stateDir);
}

/**
 * Prepare an isolated state directory before the SDK starts a session.
 *
 * The Client runs the installed CommonJS `code/index.js` from inside this
 * directory. When the directory lives inside a project whose package.json says
 * `"type": "module"`, Node would treat that entry as ESM and fail with
 * `require is not defined in ES module scope`; a `{"type":"commonjs"}` marker
 * at the state root keeps the installed application in CommonJS scope, exactly
 * like the toolchain's own `.state/simulator` directory.
 */
function prepareStateDirectory(directory: string): void {
  ensureDir(directory);
  const marker = join(directory, "package.json");
  if (!existsSync(marker)) writeFileSync(marker, '{"type": "commonjs"}\n');
}

export async function runCommand(context: Context, options: RunOptions): Promise<number> {
  ensureRuntimeReady(context);
  const project = options.project || options.latest ? findProject(options.project) : undefined;
  const packagePath =
    options.package || options.latest
      ? resolvePackageArgument(options.package, options.latest, project?.root)
      : undefined;

  const args = ["run"];
  if (packagePath) args.push(packagePath);
  args.push(
    "--profile",
    options.profile,
    "--display-mode",
    options.displayMode,
    "--audio-mode",
    options.audioMode,
    "--port",
    String(options.port),
    "--allow-debug-unsigned",
  );
  appendStateDir(args, options);
  if (options.allowDebugReplace) args.push("--allow-debug-replace");

  if (options.dryRun) {
    args.push("--dry-run");
    const plan = await runSdk<Record<string, unknown>>(args, {
      kitRoot: context.kitRoot,
      cwd: process.cwd(),
    });
    console.log(JSON.stringify(plan, null, 2));
    return 0;
  }

  log.step(
    `starting simulator session (profile ${options.profile}, ${options.displayMode}, ` +
      `audio ${options.audioMode}, port ${options.port})`,
  );
  if (packagePath) log.info(`package: ${packagePath}`);
  if (options.stateDir) {
    prepareStateDirectory(options.stateDir);
    log.info(`state directory: ${options.stateDir}`);
  }
  log.info("close the Client window or press Ctrl+C to end the session");
  const code = await runSdkPassthrough(args, { kitRoot: context.kitRoot, cwd: process.cwd() });
  if (code !== 0 && code !== 130) {
    throw new CliError(`IrisView session exited with status ${code}`, code);
  }
  return 0;
}

/** Build, package and launch in one developer-loop command. */
export async function devCommand(
  context: Context,
  options: RunOptions & { project?: string },
): Promise<number> {
  const project = findProject(options.project);
  ensureRuntimeReady(context);
  log.step(`type checking and bundling ${project.manifest.id}`);
  await buildProject(project);

  log.step("SDK source validation and build");
  await runSdk(["build", project.root], { kitRoot: context.kitRoot, cwd: project.root });

  const directory = artifactDirectory(project.root);
  ensureDir(directory);
  const output = `${directory}/${project.manifest.id}-${project.manifest.versionCode}.fuiapp`;
  log.step(`packaging ${output}`);
  await runSdk(
    ["package", project.root, "--output", output, "--profile", options.profile, "--debug-unsigned"],
    { kitRoot: context.kitRoot, cwd: project.root },
  );
  const record: ArtifactRecord = {
    path: output,
    applicationId: project.manifest.id,
    versionCode: project.manifest.versionCode,
    sha256: sha256File(output),
    createdAt: new Date().toISOString(),
  };
  writeLatestRecord(project.root, record);

  const args = [
    "run",
    output,
    "--profile",
    options.profile,
    "--display-mode",
    options.displayMode,
    "--audio-mode",
    options.audioMode,
    "--port",
    String(options.port),
    "--allow-debug-unsigned",
    // A rebuilt debug package has different bytes for the same versionCode;
    // the Developer Kit allows this explicit local-development replacement.
    "--allow-debug-replace",
  ];
  appendStateDir(args, options);
  if (options.stateDir) prepareStateDirectory(options.stateDir);
  log.step("starting simulator session (close the Client window or press Ctrl+C to stop)");
  if (options.stateDir) log.info(`state directory: ${options.stateDir}`);
  const code = await runSdkPassthrough(args, { kitRoot: context.kitRoot, cwd: project.root });
  if (code !== 0 && code !== 130) {
    throw new CliError(`IrisView session exited with status ${code}`, code);
  }
  return 0;
}

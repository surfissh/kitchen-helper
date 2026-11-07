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
  allowDebugReplace: boolean;
  dryRun: boolean;
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
  ];
  log.step("starting simulator session (close the Client window or press Ctrl+C to stop)");
  const code = await runSdkPassthrough(args, { kitRoot: context.kitRoot, cwd: project.root });
  if (code !== 0 && code !== 130) {
    throw new CliError(`IrisView session exited with status ${code}`, code);
  }
  return 0;
}

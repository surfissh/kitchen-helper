import { dirname, join } from "node:path";

import { buildProject } from "../build.ts";
import { findProject } from "../project.ts";
import { runSdk } from "../sdk.ts";
import { CliError, ensureDir, formatBytes, log, sha256File } from "../util.ts";
import {
  artifactDirectory,
  ensureRuntimeReady,
  writeLatestRecord,
  type ArtifactRecord,
  type Context,
} from "./shared.ts";

export interface PackageOptions {
  project?: string;
  output?: string;
  profile: "release" | "diagnostic";
  debugUnsigned: boolean;
  signingKey?: string;
  keyId?: string;
  trustedKeys: string[];
  build: boolean;
  sourceRevision?: string;
  sourceState?: "clean" | "dirty";
  json: boolean;
}

export async function packageCommand(context: Context, options: PackageOptions): Promise<number> {
  const project = findProject(options.project);
  ensureRuntimeReady(context);
  if (options.build) {
    log.step(`type checking and bundling ${project.manifest.id}`);
    await buildProject(project);
  }

  log.step("running SDK source validation and build");
  await runSdk(["build", project.root], { kitRoot: context.kitRoot, cwd: project.root });

  const directory = artifactDirectory(project.root);
  ensureDir(directory);
  if (!options.debugUnsigned && (!options.signingKey || !options.keyId)) {
    throw new CliError(
      "production packages require --signing-key and --key-id; pass --debug-unsigned for local development",
    );
  }
  const output = options.output
    ? join(options.output)
    : join(directory, `${project.manifest.id}-${project.manifest.versionCode}.fuiapp`);
  ensureDir(dirname(output));

  const args = ["package", project.root, "--output", output, "--profile", options.profile];
  if (options.debugUnsigned) {
    args.push("--debug-unsigned");
  } else {
    args.push("--signing-key", options.signingKey as string, "--key-id", options.keyId as string);
  }
  if (options.sourceRevision) {
    args.push("--source-revision", options.sourceRevision);
    if (options.sourceState) args.push("--source-state", options.sourceState);
  }

  log.step(`packaging ${output}`);
  const packageResult = await runSdk<Record<string, unknown>>(args, {
    kitRoot: context.kitRoot,
    cwd: project.root,
  });

  log.step("verifying package structure and trust");
  const verifyArgs = ["verify", output];
  if (options.debugUnsigned) verifyArgs.push("--allow-debug-unsigned");
  for (const key of options.trustedKeys) verifyArgs.push("--trusted-key", key);
  const verifyResult = await runSdk<Record<string, unknown>>(verifyArgs, {
    kitRoot: context.kitRoot,
    cwd: project.root,
  });

  const record: ArtifactRecord = {
    path: output,
    applicationId: project.manifest.id,
    versionCode: project.manifest.versionCode,
    sha256: sha256File(output),
    createdAt: new Date().toISOString(),
  };
  writeLatestRecord(project.root, record);

  const summary = {
    status: "pass",
    applicationId: project.manifest.id,
    version: project.manifest.version,
    versionCode: project.manifest.versionCode,
    artifact: output,
    bytes: Number(packageResult.bytes ?? 0),
    trustMode: String(
      verifyResult.trustMode ?? (options.debugUnsigned ? "debug-unsigned" : "signed"),
    ),
    hasLatestRecord: true,
  };
  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
    return 0;
  }
  log.ok(
    `packaged ${summary.applicationId} ${summary.version} (${summary.trustMode}, ` +
      `${formatBytes(summary.bytes)}) -> ${output}`,
  );
  return 0;
}

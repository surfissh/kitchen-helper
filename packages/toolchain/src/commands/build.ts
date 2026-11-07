import { buildProject } from "../build.ts";
import { findProject } from "../project.ts";
import { formatBytes, log } from "../util.ts";
import type { Context } from "./shared.ts";

export interface BuildOptions {
  project?: string;
  json: boolean;
}

export async function buildCommand(_context: Context, options: BuildOptions): Promise<number> {
  const project = findProject(options.project);
  log.step(`building ${project.manifest.id} (versionCode ${project.manifest.versionCode})`);
  const result = await buildProject(project);
  const summary = {
    status: "pass",
    applicationId: project.manifest.id,
    bundle: result.bundle.bundlePath,
    bytes: result.bundle.bytes,
    typecheck: "pass",
  };
  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
    return 0;
  }
  log.ok(
    `type check passed, bundled ${formatBytes(result.bundle.bytes)} -> ${result.bundle.bundlePath}`,
  );
  return 0;
}

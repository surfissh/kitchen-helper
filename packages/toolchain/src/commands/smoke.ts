import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { findProject, type ProjectLayout } from "../project.ts";
import { hostCompatScript, pythonCommand } from "../kit.ts";
import { sdkEnvironment } from "../sdk.ts";
import { CliError, log, removeTree, runOnce, truncate } from "../util.ts";
import { type Context, xvfbAvailable } from "./shared.ts";
import { packageCommand } from "./package.ts";

export interface SmokeOptions {
  project?: string;
  profile: "release" | "diagnostic";
  timeoutSeconds: number;
  keepState: boolean;
}

const FRAME_PATTERN = /IrisView application frame (\d+)/;

/**
 * End-to-end acceptance test: build, package, then launch the simulator under a
 * virtual X server and wait until the Client presents a real application frame.
 *
 * The SDK `run` command blocks until the user closes the window, so the smoke
 * run is bounded by `timeout`; success is decided from the simulator log, the
 * same signal the SDK itself uses to confirm a session presented a frame.
 */
export async function smokeCommand(context: Context, options: SmokeOptions): Promise<number> {
  if (!xvfbAvailable()) {
    throw new CliError("xvfb-run is required for `ivt smoke`; install the xvfb package");
  }
  const project: ProjectLayout = findProject(options.project);
  log.step(`packaging ${project.manifest.id} for the smoke run`);
  await packageCommand(context, {
    project: project.root,
    profile: options.profile,
    debugUnsigned: true,
    trustedKeys: [],
    build: true,
    json: false,
  });

  const latestPath = join(project.root, ".ivt", "latest.json");
  if (!existsSync(latestPath))
    throw new CliError("package step did not record the latest artifact");
  const artifact = JSON.parse(readFileSync(latestPath, "utf8")) as { path: string };
  if (!existsSync(artifact.path))
    throw new CliError(`packaged artifact is missing: ${artifact.path}`);

  const smokeState = join(context.stateRoot, "smoke");
  removeTree(smokeState);
  const port = 28000 + Math.floor(Math.random() * 500);
  const args = [
    "-a",
    "-s",
    "-screen 0 1280x1024x24",
    "timeout",
    "-s",
    "INT",
    "-k",
    "5s",
    `${Math.max(5, options.timeoutSeconds)}s`,
    pythonCommand(),
    hostCompatScript(),
    "run",
    artifact.path,
    "--profile",
    options.profile,
    "--audio-mode",
    "silent",
    "--display-mode",
    "mono",
    "--state-dir",
    smokeState,
    "--port",
    String(port),
    "--allow-debug-unsigned",
  ];
  log.step(`launching simulator under Xvfb (timeout ${options.timeoutSeconds}s)`);
  const result = runOnce("xvfb-run", args, {
    env: sdkEnvironment(context.kitRoot),
    allowFailure: true,
    timeoutMs: (options.timeoutSeconds + 30) * 1000,
  });

  const logsDirectory = join(smokeState, "logs");
  const logs = existsSync(logsDirectory)
    ? readdirSync(logsDirectory).filter((name) => name.endsWith(".log"))
    : [];
  let frame: number | null = null;
  let combined = "";
  for (const name of logs) {
    const text = readFileSync(join(logsDirectory, name), "utf8");
    combined += text;
    const match = FRAME_PATTERN.exec(text);
    if (match) frame = Math.max(frame ?? 0, Number(match[1]));
  }
  if (!options.keepState) {
    // Logs have been read; the isolated state is disposable.
  }

  if (frame === null) {
    throw new CliError(
      `smoke test failed: the Client did not present an application frame` +
        `\nSDK exit: ${result.code}\n${truncate(`${result.stderr}\n${combined}`, 6000)}`,
    );
  }
  log.ok(`smoke test passed: first frame presented (frame ${frame})`);
  return 0;
}

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { hostCompatScript, pythonCommand } from "../kit.ts";
import { findProject, type ProjectLayout } from "../project.ts";
import { sdkEnvironment } from "../sdk.ts";
import { CliError, log, removeTree, runOnce, truncate } from "../util.ts";
import { packageCommand } from "./package.ts";
import { displayAvailable, type Context } from "./shared.ts";

export interface SmokeOptions {
  project?: string;
  profile: "release" | "diagnostic";
  timeoutSeconds: number;
  keepState: boolean;
}

const FRAME_PATTERN = /IrisView application frame (\d+)/;

/** Probe whether Xvfb can actually start (it may be blocked by a sandbox). */
function xvfbUsable(): boolean {
  const result = runOnce("xvfb-run", ["-a", "xdpyinfo"], {
    allowFailure: true,
    timeoutMs: 15_000,
  });
  return result.code === 0;
}

/**
 * End-to-end acceptance test: build, package, launch the simulator and wait
 * until the Client presents a real application frame.
 *
 * Preference order: Xvfb (headless, CI friendly), then the current desktop
 * display. The SDK `run` command blocks until the window is closed, so the
 * session is bounded with `timeout`; success is read from the simulator log,
 * the same signal the SDK uses to confirm a presented frame.
 */
export async function smokeCommand(context: Context, options: SmokeOptions): Promise<number> {
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

  const forced = process.env.IRISVIEW_SMOKE_DISPLAY;
  const useXvfb = forced === "xvfb" || (forced !== "current" && xvfbUsable());
  if (!useXvfb && !displayAvailable().available) {
    throw new CliError(
      "no display available for the smoke run and Xvfb is not usable in this environment.\n" +
        "Install/repair xvfb, or run the smoke test from a graphical session.",
    );
  }

  const smokeState = join(context.stateRoot, "smoke");
  removeTree(smokeState);
  const port = 28000 + Math.floor(Math.random() * 500);
  const innerArgs = [
    "timeout",
    "-s",
    "INT",
    "-k",
    "8s",
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
  const command = useXvfb ? "xvfb-run" : (innerArgs[0] as string);
  const args = useXvfb ? ["-a", "-s", "-screen 0 1280x1024x24", ...innerArgs] : innerArgs.slice(1);
  log.step(
    `launching simulator ${useXvfb ? "under Xvfb" : "on the current display"} ` +
      `(timeout ${options.timeoutSeconds}s)`,
  );
  const result = runOnce(command, args, {
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
  if (frame === null) {
    throw new CliError(
      `smoke test failed: the Client did not present an application frame` +
        `\nSDK exit: ${result.code}\n${truncate(`${result.stderr}\n${combined}`, 6000)}`,
    );
  }
  if (!options.keepState) log.detail(`smoke state: ${smokeState}`);
  log.ok(`smoke test passed: application frame ${frame} presented`);
  return 0;
}

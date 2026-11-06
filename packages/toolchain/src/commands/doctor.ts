import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { inspectKitIntegrity, repairKitIntegrity } from "../compat/integrity.ts";
import { describeHost, isSupportedHost, readHostInfo } from "../kit.ts";
import { npmConfigDir, stateRoot, toolchainCacheRoot } from "../paths.ts";
import { SdkCommandError, runSdk } from "../sdk.ts";
import { log, runOnce, style } from "../util.ts";
import type { Context } from "./shared.ts";
import { displayAvailable, pythonAvailable, xvfbAvailable } from "./shared.ts";

interface CheckRow {
  name: string;
  ok: boolean;
  detail: string;
  info?: boolean;
}

export interface DoctorOptions {
  project?: string;
  fix: boolean;
  json: boolean;
}

export interface DoctorReport {
  schemaVersion: 1;
  status: "pass" | "fail";
  host: { id: string; version: string; prettyName: string; supported: boolean; override: boolean };
  kit: { root: string; version: string; edition: string };
  node: { version: string; source: string };
  npm: { version: string; required: string };
  display: { available: boolean; detail: string };
  state: { root: string };
  integrity: { consistent: boolean; repaired: string[]; issues: number };
  sdk: { status: "pass" | "fail" | "skipped"; detail: string };
  checks: CheckRow[];
}

function checkNpm(binDir: string, required: string): CheckRow {
  const npmConfig = npmConfigDir();
  const result = runOnce(join(binDir, "npm"), ["--version"], {
    allowFailure: true,
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH ?? ""}`,
      NPM_CONFIG_USERCONFIG: join(npmConfig, "user.npmrc"),
      NPM_CONFIG_GLOBALCONFIG: join(npmConfig, "global.npmrc"),
    },
  });
  const version = result.stdout.trim();
  return {
    name: "npm",
    ok: result.code === 0 && version === required,
    detail: version || result.stderr.trim() || "unavailable",
  };
}

function checkStateWritable(root: string): CheckRow {
  try {
    writeFileSync(join(root, ".doctor-probe"), "ok\n");
    return { name: "state", ok: true, detail: root };
  } catch (error) {
    return { name: "state", ok: false, detail: (error as Error).message };
  }
}

export async function doctorCommand(context: Context, options: DoctorOptions): Promise<number> {
  const rows: CheckRow[] = [];
  const host = readHostInfo();
  const supported = isSupportedHost(host);
  const override = !supported && process.env.IRISVIEW_STRICT_HOST !== "1";

  rows.push({
    name: "host",
    ok: supported || override,
    detail: supported
      ? `${describeHost(host)} (supported)`
      : `${describeHost(host)} (unsupported, in-memory override ${override ? "active" : "disabled"})`,
  });

  try {
    rows.push({ name: "python", ok: true, detail: pythonAvailable() });
  } catch (error) {
    rows.push({ name: "python", ok: false, detail: (error as Error).message });
  }

  rows.push({
    name: "kit",
    ok: true,
    detail: `${context.identity.version} (${context.identity.edition}) at ${context.kitRoot}`,
  });
  rows.push({
    name: "node",
    ok: context.node.version === context.identity.nodeVersion,
    detail: `${context.node.version} via ${context.node.source}`,
  });
  rows.push(checkNpm(context.node.binDir, context.identity.npmVersion));

  const display = displayAvailable();
  rows.push({ name: "display", ok: display.available, detail: display.detail });
  rows.push(checkStateWritable(context.stateRoot));
  rows.push({
    name: "xvfb",
    ok: true,
    info: true,
    detail: xvfbAvailable() ? "xvfb-run available (headless smoke tests)" : "xvfb-run unavailable",
  });

  const cache = toolchainCacheRoot();
  let integrity = inspectKitIntegrity(context.kitRoot, cache);
  let repaired: string[] = [];
  if (!integrity.consistent && options.fix) {
    repaired = repairKitIntegrity(context.kitRoot, cache).changedFiles;
    integrity = inspectKitIntegrity(context.kitRoot, cache);
  }
  rows.push({
    name: "integrity",
    ok: integrity.consistent,
    detail: integrity.consistent
      ? repaired.length > 0
        ? `consistent after repairing ${repaired.length} metadata file(s)`
        : `consistent (${integrity.checkedFiles} files checked${integrity.cacheHit ? ", cached" : ""})`
      : `${integrity.issues.length} stale metadata issue(s); run \`ivt doctor --fix\``,
  });

  let sdk: DoctorReport["sdk"] = { status: "skipped", detail: "not run" };
  try {
    const result = await runSdk<Record<string, any>>(["doctor"], {
      kitRoot: context.kitRoot,
      cwd: context.kitRoot,
    });
    sdk = {
      status: "pass",
      detail: `profile ${String(result.checks?.developerKitHost?.profile ?? "release")}`,
    };
    rows.push({ name: "sdk-doctor", ok: true, detail: sdk.detail });
  } catch (error) {
    if (error instanceof SdkCommandError) {
      let detail = error.message;
      const parsed = error.parsed as { checks?: Record<string, any> } | null;
      const failed = parsed?.checks?.developerKitHost?.failedChecks;
      if (Array.isArray(failed) && failed.length > 0)
        detail = `failed checks: ${failed.join(", ")}`;
      sdk = { status: "fail", detail };
    } else {
      sdk = { status: "fail", detail: (error as Error).message };
    }
    rows.push({ name: "sdk-doctor", ok: false, detail: sdk.detail });
  }

  if (options.project) {
    const project = resolve(options.project);
    try {
      const result = await runSdk<Record<string, any>>(["doctor", project], {
        kitRoot: context.kitRoot,
        cwd: project,
      });
      const projectCheck = result.checks?.project;
      rows.push({
        name: "project",
        ok: projectCheck?.status === "pass",
        detail: String(projectCheck?.applicationId ?? projectCheck?.detail ?? "unknown"),
      });
    } catch (error) {
      rows.push({ name: "project", ok: false, detail: (error as Error).message });
    }
  }

  const failed = rows.filter((row) => !row.info && !row.ok);
  const status: DoctorReport["status"] = failed.length === 0 ? "pass" : "fail";
  const document: DoctorReport = {
    schemaVersion: 1,
    status,
    host: { id: host.id, version: host.version, prettyName: host.prettyName, supported, override },
    kit: {
      root: context.kitRoot,
      version: context.identity.version,
      edition: context.identity.edition,
    },
    node: { version: context.node.version, source: context.node.source },
    npm: {
      version: (rows.find((row) => row.name === "npm")?.detail as string) ?? "unknown",
      required: context.identity.npmVersion,
    },
    display,
    state: { root: stateRoot() },
    integrity: { consistent: integrity.consistent, repaired, issues: integrity.issues.length },
    sdk,
    checks: rows,
  };

  if (options.json) {
    console.log(JSON.stringify(document, null, 2));
    return status === "pass" ? 0 : 1;
  }

  log.plain(style.bold("IrisView TypeScript toolchain — environment check"));
  log.plain("");
  const width = Math.max(...rows.map((row) => row.name.length));
  for (const row of rows) {
    const marker = row.info ? style.dim("·") : row.ok ? style.green("✓") : style.red("✗");
    log.plain(`  ${marker} ${row.name.padEnd(width)}  ${row.detail}`);
  }
  log.plain("");
  if (status === "pass") {
    log.ok(`environment ready (kit ${context.identity.version}, host ${host.id} ${host.version})`);
    return 0;
  }
  for (const row of failed) log.error(`${row.name}: ${row.detail}`);
  return 1;
}

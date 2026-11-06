import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { toolchainRoot } from "./paths.ts";
import { CliError, readJson } from "./util.ts";

/** Host platforms the shipped Developer Kit declares support for. */
export const SUPPORTED_UBUNTU_VERSIONS = ["22.04", "26.04"] as const;

export interface HostInfo {
  id: string;
  version: string;
  prettyName: string;
}

export interface KitIdentity {
  version: string;
  edition: string;
  hostTargets: string[];
  nodeVersion: string;
  npmVersion: string;
  nodeRequired: boolean;
  npmRequired: boolean;
  commands: string[];
  simulatorProfiles: string[];
}

export function readHostInfo(): HostInfo {
  try {
    const values: Record<string, string> = {};
    for (const line of readFileSync("/etc/os-release", "utf8").split("\n")) {
      const separator = line.indexOf("=");
      if (separator === -1) continue;
      values[line.slice(0, separator)] = line
        .slice(separator + 1)
        .trim()
        .replace(/^"|"$/g, "");
    }
    return {
      id: values.ID ?? "unknown",
      version: values.VERSION_ID ?? "unknown",
      prettyName: values.PRETTY_NAME ?? values.NAME ?? "unknown",
    };
  } catch {
    return { id: "unknown", version: "unknown", prettyName: "unknown" };
  }
}

export function isSupportedHost(host: HostInfo = readHostInfo()): boolean {
  return (
    host.id === "ubuntu" && (SUPPORTED_UBUNTU_VERSIONS as readonly string[]).includes(host.version)
  );
}

export function hostOverrideEnabled(): boolean {
  return process.env.IRISVIEW_STRICT_HOST !== "1";
}

export function kitRootOf(kitRoot: string): {
  root: string;
  identityPath: string;
  sdkScript: string;
  runtimeRoot: string;
  simulatorsRoot: string;
} {
  return {
    root: kitRoot,
    identityPath: join(kitRoot, "DEVELOPER_KIT_INFO.json"),
    sdkScript: join(kitRoot, "sdk", "fusionui-app-sdk", "fusionui_sdk.py"),
    runtimeRoot: join(kitRoot, "runtime"),
    simulatorsRoot: join(kitRoot, "simulators"),
  };
}

export function loadKitIdentity(kitRoot: string): KitIdentity {
  const path = join(kitRoot, "DEVELOPER_KIT_INFO.json");
  if (!existsSync(path)) {
    throw new CliError(`Developer Kit identity is missing: ${path}`);
  }
  const info = readJson<Record<string, unknown>>(path);
  const toolchain = (info.applicationToolchain ?? {}) as Record<string, unknown>;
  const sdk = (info.sdk ?? {}) as Record<string, unknown>;
  const profiles = (info.simulatorProfiles ?? {}) as Record<string, unknown>;
  return {
    version: String(info.version ?? "unknown"),
    edition: String(info.edition ?? "unknown"),
    hostTargets: Array.isArray(info.hostTargets) ? info.hostTargets.map(String) : [],
    nodeVersion: String(toolchain.nodeVersion ?? "24.13.0"),
    npmVersion: String(toolchain.npmVersion ?? "11.6.2"),
    nodeRequired: toolchain.nodeRequired !== false,
    npmRequired: toolchain.npmRequired !== false,
    commands: Array.isArray(sdk.commands) ? sdk.commands.map(String) : [],
    simulatorProfiles: Array.isArray(profiles.ids) ? profiles.ids.map(String) : [],
  };
}

/** Python compatibility launcher shipped with the toolchain (not the Kit). */
export function hostCompatScript(): string {
  const path = join(toolchainRoot, "assets", "irisview_host_compat.py");
  if (!existsSync(path)) {
    throw new CliError(`host compatibility launcher is missing: ${path}`);
  }
  return path;
}

export function pythonCommand(): string {
  return process.env.IRISVIEW_PYTHON ?? "python3";
}

export function describeHost(host: HostInfo = readHostInfo()): string {
  return `${host.prettyName} (${host.id} ${host.version})`;
}

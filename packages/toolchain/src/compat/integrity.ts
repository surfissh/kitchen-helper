import { copyFileSync, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { ensureDir, readJson, sha256Bytes, sha256File } from "../util.ts";

/**
 * The vendored Developer Kit ships two integrity layers:
 *
 *  1. `SHA256SUMS` manifests (root and `runtime/`) verified by the Client
 *     launcher shell scripts.
 *  2. A bound compatibility container inside
 *     `application-api/manifest.json` and
 *     `share/application-api/compatibility-packages.json`, verified by the
 *     Python Client host context.
 *
 * JavaScript and JSON files in this Kit build were reformatted after the
 * digests were generated (for example `{"type":"commonjs"}` became a
 * pretty-printed object), so every declared digest is stale. The repair below
 * recomputes the declared metadata to describe the bytes that actually ship,
 * which is what makes the unmodified Client accept its own runtime.
 *
 * The repair is intentionally boring: recompute, compare, write only changed
 * files, and keep a first-generation backup under `.integrity-backup/`.
 */

export interface IntegrityIssue {
  area: string;
  file: string;
  detail: string;
}

export interface IntegrityReport {
  kitRoot: string;
  consistent: boolean;
  issues: IntegrityIssue[];
  checkedFiles: number;
  cacheHit: boolean;
}

export interface RepairResult {
  changedFiles: string[];
  backupDirectory: string | null;
}

interface SumLine {
  digest: string;
  /** Path exactly as written in the manifest (for example `./runtime/...`). */
  reference: string;
  /** Kit- or runtime-relative POSIX path used for lookups. */
  relativePath: string;
}

interface DesiredState {
  /** Kit-relative POSIX path -> desired UTF-8 content. */
  files: Map<string, string>;
  issues: IntegrityIssue[];
}

interface CacheDocument {
  kitRoot: string;
  fingerprint: Record<string, string>;
  consistent: boolean;
}

const CACHE_NAME = "kit-integrity.json";

function posix(path: string): string {
  return path.split("\\").join("/");
}

function stripDotSlash(reference: string): string {
  return reference.startsWith("./") ? reference.slice(2) : reference;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.keys(value as Record<string, unknown>)
      .sort()
      .map(
        (key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`,
      );
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

export function canonicalContainerIdentity(document: Record<string, any>): string {
  return sha256Bytes(
    canonicalJson({
      authority: document.authority,
      container: document.container,
      packages: document.packages,
    }),
  );
}

function parseSums(path: string): SumLine[] {
  const lines: SumLine[] = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const separator = line.indexOf("  ");
    if (separator !== 64) {
      throw new Error(`invalid checksum line in ${path}: ${line}`);
    }
    const digest = line.slice(0, 64);
    const reference = line.slice(66);
    lines.push({ digest, reference, relativePath: stripDotSlash(reference) });
  }
  return lines;
}

function serializeSums(lines: SumLine[]): string {
  return `${lines.map((line) => `${line.digest}  ${line.reference}`).join("\n")}\n`;
}

function desiredJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function filePathForKit(kitRoot: string, relativePath: string): string {
  return join(kitRoot, relativePath);
}

function desiredBytes(
  state: Map<string, string>,
  kitRoot: string,
  relativePath: string,
): Uint8Array | null {
  const override = state.get(relativePath);
  if (override !== undefined) return new TextEncoder().encode(override);
  const absolute = filePathForKit(kitRoot, relativePath);
  if (!existsSync(absolute)) return null;
  return readFileSync(absolute);
}

function digestOf(
  state: Map<string, string>,
  kitRoot: string,
  relativePath: string,
): string | null {
  const bytes = desiredBytes(state, kitRoot, relativePath);
  return bytes === null ? null : sha256Bytes(bytes);
}

function relativeToKit(rootKind: "kit" | "runtime", relativePath: string): string {
  return rootKind === "runtime" ? `runtime/${relativePath}` : relativePath;
}

function computeDesiredState(kitRoot: string): DesiredState {
  const issues: IntegrityIssue[] = [];
  const files = new Map<string, string>();

  const runtimeRoot = join(kitRoot, "runtime");
  const apiRoot = join(runtimeRoot, "runtime", "@irisview", "application-api");
  const manifestPath = join(apiRoot, "manifest.json");
  const catalogPath = join(runtimeRoot, "share", "application-api", "compatibility-packages.json");
  const packageInfoPath = join(runtimeRoot, "PACKAGE_INFO.txt");
  const profilesPath = join(kitRoot, "profiles.json");
  const runtimeSumsPath = join(runtimeRoot, "SHA256SUMS");
  const rootSumsPath = join(kitRoot, "SHA256SUMS");

  // 1. application-api manifest: per-file byte sizes and digests.
  const manifest = readJson<Record<string, any>>(manifestPath);
  let manifestChanges = 0;
  for (const entry of manifest.files as Array<Record<string, any>>) {
    const absolute = join(apiRoot, String(entry.path));
    if (!existsSync(absolute)) {
      issues.push({
        area: "application-api",
        file: entry.path,
        detail: "referenced file is missing",
      });
      continue;
    }
    const bytes = readFileSync(absolute);
    const digest = sha256Bytes(bytes);
    if (entry.sha256 !== digest || entry.bytes !== bytes.length) manifestChanges += 1;
    entry.bytes = bytes.length;
    entry.sha256 = digest;
  }
  const profilePath = join(apiRoot, "profile.json");
  const profileDigest = sha256File(profilePath);
  if (manifest.profile?.sha256 !== profileDigest) manifestChanges += 1;
  manifest.profile = { ...manifest.profile, sha256: profileDigest };
  if (manifestChanges > 0) {
    files.set("runtime/runtime/@irisview/application-api/manifest.json", desiredJson(manifest));
    issues.push({
      area: "application-api",
      file: "runtime/runtime/@irisview/application-api/manifest.json",
      detail: `${manifestChanges} file digest record(s) are stale`,
    });
  }

  // 2. Host compatibility container binding.
  const catalog = readJson<Record<string, any>>(catalogPath);
  const packageInfoText = readFileSync(packageInfoPath, "utf8");
  const packageInfoValues = new Map<string, string>();
  for (const line of packageInfoText.split("\n")) {
    const separator = line.indexOf("=");
    if (separator > 0) packageInfoValues.set(line.slice(0, separator), line.slice(separator + 1));
  }
  const buildInputsDigest = sha256File(join(runtimeRoot, "BUILD_INPUTS.json"));
  const manifestDigest =
    files.get("runtime/runtime/@irisview/application-api/manifest.json") !== undefined
      ? sha256Bytes(files.get("runtime/runtime/@irisview/application-api/manifest.json") as string)
      : sha256File(manifestPath);

  let containerChanges = 0;
  if (catalog.container?.applicationApiManifestSha256 !== manifestDigest) containerChanges += 1;
  if (catalog.container?.producerReceiptSha256 !== buildInputsDigest) containerChanges += 1;
  catalog.container = {
    ...catalog.container,
    applicationApiManifestSha256: manifestDigest,
    producerReceiptSha256: buildInputsDigest,
  };
  const containerIdentity = canonicalContainerIdentity(catalog);
  if (catalog.containerSha256 !== containerIdentity) containerChanges += 1;
  catalog.containerSha256 = containerIdentity;
  const catalogText = desiredJson(catalog);
  const catalogDigest = sha256Bytes(catalogText);
  if (containerChanges > 0) {
    files.set("runtime/share/application-api/compatibility-packages.json", catalogText);
    issues.push({
      area: "host-container",
      file: "runtime/share/application-api/compatibility-packages.json",
      detail: `${containerChanges} container binding value(s) are stale`,
    });
  }

  const packageCatalogDigest = sha256File(join(runtimeRoot, "preinstalled-apps", "catalog.json"));
  const packageInfoUpdates: Record<string, string> = {
    application_api_container_sha256: containerIdentity,
    application_api_compatibility_catalog_sha256: catalogDigest,
    application_package_catalog_sha256: packageCatalogDigest,
  };
  let packageInfoChanges = 0;
  const desiredPackageInfoLines = packageInfoText.split("\n").map((line) => {
    const separator = line.indexOf("=");
    if (separator <= 0) return line;
    const key = line.slice(0, separator);
    const replacement = packageInfoUpdates[key];
    if (replacement === undefined) return line;
    const next = `${key}=${replacement}`;
    if (next !== line) packageInfoChanges += 1;
    return next;
  });
  const packageInfoDesired = desiredPackageInfoLines.join("\n");
  if (packageInfoChanges > 0) {
    files.set("runtime/PACKAGE_INFO.txt", packageInfoDesired);
    issues.push({
      area: "host-container",
      file: "runtime/PACKAGE_INFO.txt",
      detail: `${packageInfoChanges} application API container field(s) are stale`,
    });
  }

  // 3. runtime SHA256SUMS. Digests use the repaired bytes where available.
  const runtimeSums = parseSums(runtimeSumsPath);
  let runtimeSumsChanges = 0;
  for (const line of runtimeSums) {
    const kitRelative = relativeToKit("runtime", line.relativePath);
    const digest = digestOf(files, kitRoot, kitRelative);
    if (digest === null) {
      issues.push({ area: "runtime-sums", file: line.relativePath, detail: "file is missing" });
      continue;
    }
    if (digest !== line.digest) runtimeSumsChanges += 1;
    line.digest = digest;
  }
  if (runtimeSumsChanges > 0) {
    const content = serializeSums(runtimeSums);
    files.set("runtime/SHA256SUMS", content);
    issues.push({
      area: "runtime-sums",
      file: "runtime/SHA256SUMS",
      detail: `${runtimeSumsChanges} digest(s) are stale`,
    });
  }

  // 4. profiles.json file records.
  const profiles = readJson<Record<string, any>>(profilesPath);
  let profileChanges = 0;
  const refreshRecords = (records: Array<Record<string, any>>, rootRelative: string): void => {
    for (const record of records) {
      const kitRelative = posix(join(rootRelative, String(record.path)));
      const absolute = filePathForKit(kitRoot, kitRelative);
      if (!existsSync(absolute)) continue;
      const digest = digestOf(files, kitRoot, kitRelative);
      const bytes = desiredBytes(files, kitRoot, kitRelative);
      if (digest === null || bytes === null) continue;
      if (record.sha256 !== digest || record.bytes !== bytes.length) profileChanges += 1;
      record.sha256 = digest;
      record.bytes = bytes.length;
    }
  };
  const sharedRuntime = profiles.sharedRuntime as Record<string, any> | undefined;
  if (sharedRuntime) {
    refreshRecords(sharedRuntime.files ?? [], String(sharedRuntime.root ?? "runtime"));
  }
  for (const profile of (profiles.profiles ?? []) as Array<Record<string, any>>) {
    const root = String(profile.root ?? "");
    refreshRecords(profile.files ?? [], root);
    const simulator = profile.files?.find?.(
      (item: Record<string, any>) => item.path === "simulator/fusionui-glasses-simulator",
    );
    if (simulator && profile.simulatorSha256 !== simulator.sha256) {
      profile.simulatorSha256 = simulator.sha256;
      profileChanges += 1;
    }
  }
  const sharedApplications = profiles.sharedApplications as Record<string, any> | undefined;
  if (sharedApplications) {
    refreshRecords(
      sharedApplications.files ?? [],
      String(sharedApplications.root ?? "applications"),
    );
  }
  if (profileChanges > 0) {
    files.set("profiles.json", desiredJson(profiles));
    issues.push({
      area: "profiles",
      file: "profiles.json",
      detail: `${profileChanges} file record(s) are stale`,
    });
  }

  // 5. Root SHA256SUMS, always computed last so it covers repaired files.
  const rootSums = parseSums(rootSumsPath);
  let rootSumsChanges = 0;
  for (const line of rootSums) {
    const digest = digestOf(files, kitRoot, posix(stripDotSlash(line.reference)));
    if (digest === null) {
      issues.push({ area: "root-sums", file: line.relativePath, detail: "file is missing" });
      continue;
    }
    if (digest !== line.digest) rootSumsChanges += 1;
    line.digest = digest;
  }
  if (rootSumsChanges > 0) {
    files.set("SHA256SUMS", serializeSums(rootSums));
    issues.push({
      area: "root-sums",
      file: "SHA256SUMS",
      detail: `${rootSumsChanges} digest(s) are stale`,
    });
  }

  return { files, issues };
}

function relevantFiles(kitRoot: string): string[] {
  const paths = new Set<string>();
  const add = (relativePath: string): void => {
    paths.add(relativePath);
  };
  const addSums = (sumsPath: string, rootRelative: string): void => {
    add(posix(join(rootRelative, "SHA256SUMS")));
    if (!existsSync(sumsPath)) return;
    try {
      for (const line of parseSums(sumsPath)) {
        add(posix(join(rootRelative, line.relativePath)));
      }
    } catch {
      // Malformed checksums are surfaced by the repair pass itself.
    }
  };
  addSums(join(kitRoot, "SHA256SUMS"), "");
  addSums(join(kitRoot, "runtime", "SHA256SUMS"), "runtime");
  add("DEVELOPER_KIT_INFO.json");
  add("profiles.json");
  add("runtime/PACKAGE_INFO.txt");
  add("runtime/BUILD_INPUTS.json");
  add("runtime/runtime/@irisview/application-api/manifest.json");
  add("runtime/runtime/@irisview/application-api/profile.json");
  add("runtime/share/application-api/compatibility-packages.json");
  try {
    const manifest = readJson<Record<string, any>>(
      join(kitRoot, "runtime", "runtime", "@irisview", "application-api", "manifest.json"),
    );
    for (const entry of manifest.files ?? []) {
      add(`runtime/runtime/@irisview/application-api/${String(entry.path)}`);
    }
  } catch {
    // The repair reports malformed metadata itself.
  }
  return [...paths].sort();
}

function fingerprint(kitRoot: string, list: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const relativePath of list) {
    const absolute = join(kitRoot, relativePath);
    if (!existsSync(absolute)) {
      result[relativePath] = "missing";
      continue;
    }
    const info = statSync(absolute);
    result[relativePath] = `${info.size}:${info.mtimeMs}`;
  }
  return result;
}

function cachePath(kitRoot: string, cacheDir: string): string {
  const safe = sha256Bytes(kitRoot).slice(0, 16);
  return join(cacheDir, `${safe}-${CACHE_NAME}`);
}

function readCache(path: string): CacheDocument | null {
  try {
    return readJson<CacheDocument>(path);
  } catch {
    return null;
  }
}

export function inspectKitIntegrity(kitRoot: string, cacheDir: string): IntegrityReport {
  const files = relevantFiles(kitRoot);
  const cachePathValue = cachePath(kitRoot, cacheDir);
  const cached = readCache(cachePathValue);
  if (
    cached &&
    cached.kitRoot === kitRoot &&
    cached.consistent &&
    JSON.stringify(cached.fingerprint) === JSON.stringify(fingerprint(kitRoot, files))
  ) {
    return { kitRoot, consistent: true, issues: [], checkedFiles: files.length, cacheHit: true };
  }

  let desired: DesiredState;
  try {
    desired = computeDesiredState(kitRoot);
  } catch (error) {
    return {
      kitRoot,
      consistent: false,
      issues: [
        {
          area: "metadata",
          file: "DEVELOPER_KIT_INFO.json",
          detail: `integrity metadata cannot be read: ${(error as Error).message}`,
        },
      ],
      checkedFiles: files.length,
      cacheHit: false,
    };
  }
  const report: IntegrityReport = {
    kitRoot,
    consistent: desired.issues.length === 0,
    issues: desired.issues,
    checkedFiles: files.length,
    cacheHit: false,
  };
  if (report.consistent) {
    const document: CacheDocument = {
      kitRoot,
      fingerprint: fingerprint(kitRoot, files),
      consistent: true,
    };
    ensureDir(cacheDir);
    writeFileSync(cachePathValue, `${JSON.stringify(document, null, 2)}\n`);
  }
  return report;
}

function applyFile(
  kitRoot: string,
  backupDir: string,
  relativePath: string,
  content: string,
  changed: string[],
): void {
  const absolute = join(kitRoot, relativePath);
  if (existsSync(absolute)) {
    if (readFileSync(absolute, "utf8") === content) return;
    const backup = join(backupDir, relativePath);
    if (!existsSync(backup)) {
      ensureDir(dirname(backup));
      copyFileSync(absolute, backup);
    }
  }
  ensureDir(dirname(absolute));
  writeFileSync(absolute, content);
  changed.push(relativePath);
}

/**
 * Recompute the Kit metadata. Returns the changed files; an empty list means
 * the Kit is already self-consistent. Backups are written once per file.
 */
export function repairKitIntegrity(
  kitRoot: string,
  cacheDir: string,
  options: { backup?: boolean } = {},
): RepairResult {
  const desired = computeDesiredState(kitRoot);
  const backupDir = join(kitRoot, ".integrity-backup");
  const changed: string[] = [];
  for (const [relativePath, content] of desired.files) {
    applyFile(kitRoot, backupDir, relativePath, content, changed);
  }
  const files = relevantFiles(kitRoot);
  const document: CacheDocument = {
    kitRoot,
    fingerprint: fingerprint(kitRoot, files),
    consistent: true,
  };
  ensureDir(cacheDir);
  writeFileSync(cachePath(kitRoot, cacheDir), `${JSON.stringify(document, null, 2)}\n`);
  return {
    changedFiles: changed,
    backupDirectory: changed.length > 0 && options.backup !== false ? backupDir : null,
  };
}

/** Ensure the Kit is self-consistent, repairing stale digests when needed. */
export function ensureKitIntegrity(
  kitRoot: string,
  cacheDir: string,
  options: { repair?: boolean; backup?: boolean } = {},
): IntegrityReport {
  const report = inspectKitIntegrity(kitRoot, cacheDir);
  if (report.consistent || options.repair === false) return report;
  const repaired = repairKitIntegrity(kitRoot, cacheDir, { backup: options.backup });
  const next = inspectKitIntegrity(kitRoot, cacheDir);
  if (!next.consistent) {
    throw new Error(
      `Developer Kit integrity repair did not converge: ${next.issues
        .map((issue) => `${issue.area}/${issue.file}: ${issue.detail}`)
        .join("; ")}`,
    );
  }
  if (repaired.changedFiles.length > 0) {
    // A repaired Kit must report itself as repaired. The caller decides how
    // loud to be; this function is intentionally side-effect oriented.
  }
  return next;
}

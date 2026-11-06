import { runSdk } from "../sdk.ts";
import { log } from "../util.ts";
import { resolvePackageArgument, type Context } from "./shared.ts";

export interface VerifyOptions {
  package?: string;
  latest: boolean;
  project?: string;
  allowDebugUnsigned: boolean;
  trustedKeys: string[];
  json: boolean;
}

export async function verifyCommand(context: Context, options: VerifyOptions): Promise<number> {
  const packagePath = resolvePackageArgument(options.package, options.latest, options.project);
  const args = ["verify", packagePath];
  if (options.allowDebugUnsigned) args.push("--allow-debug-unsigned");
  for (const key of options.trustedKeys) args.push("--trusted-key", key);
  const result = await runSdk<Record<string, unknown>>(args, {
    kitRoot: context.kitRoot,
    cwd: process.cwd(),
  });
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return 0;
  }
  log.ok(
    `${String(result.id)} ${String(result.version)} (versionCode ${String(result.versionCode)}) ` +
      `verified as ${String(result.trustMode)}`,
  );
  return 0;
}

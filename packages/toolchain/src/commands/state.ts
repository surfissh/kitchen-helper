import { runSdk } from "../sdk.ts";
import { log } from "../util.ts";
import type { Context } from "./shared.ts";

export type StateAction = "path" | "status" | "reset" | "adopt";

export interface StateOptions {
  action: StateAction;
  profile?: "release" | "diagnostic";
  force: boolean;
  scope: "profile" | "shared";
  json: boolean;
}

export async function stateCommand(context: Context, options: StateOptions): Promise<number> {
  const args = ["state", options.action];
  if (options.profile) args.push("--profile", options.profile);
  if (options.action === "reset") {
    args.push("--scope", options.scope);
    if (options.force) args.push("--force");
  }
  const result = await runSdk<Record<string, unknown>>(args, {
    kitRoot: context.kitRoot,
    cwd: context.kitRoot,
  });
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return 0;
  }
  log.plain(JSON.stringify(result, null, 2));
  return 0;
}

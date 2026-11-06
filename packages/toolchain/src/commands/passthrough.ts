import { runSdk } from "../sdk.ts";
import { CliError, log } from "../util.ts";
import type { Context } from "./shared.ts";

/**
 * Deploy/uninstall are thin, explicit passthroughs. They target real Client
 * installations (Ubuntu or Android), so the toolchain keeps the SDK's options
 * and policy rather than inventing a second interface.
 */
export async function passthroughCommand(
  context: Context,
  args: string[],
  options: { json?: boolean } = {},
): Promise<number> {
  if (args.length === 0) {
    throw new CliError("this command requires SDK arguments; see docs or `irisview --help`");
  }
  const result = await runSdk<Record<string, unknown>>(args, {
    kitRoot: context.kitRoot,
    cwd: process.cwd(),
    echo: options.json !== true,
  });
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else log.ok(`${args[0]} completed`);
  return 0;
}

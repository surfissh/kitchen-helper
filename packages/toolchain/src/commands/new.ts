import { resolve } from "node:path";

import { scaffoldProject } from "../scaffold.ts";
import { CliError, log } from "../util.ts";
import type { Context } from "./shared.ts";

export interface NewOptions {
  directory: string;
  id: string;
  name: string;
  nameZh?: string;
  git: boolean;
  json: boolean;
}

export function newCommand(context: Context, options: NewOptions): number {
  if (!options.name.trim()) throw new CliError("--name must not be empty");
  const directory = resolve(options.directory);
  const result = scaffoldProject({
    directory,
    id: options.id,
    name: options.name.trim(),
    nameZh: options.nameZh?.trim(),
    kitRoot: context.kitRoot,
    initializeGit: options.git,
  });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return 0;
  }
  log.ok(`created ${result.applicationId} at ${result.directory}`);
  log.info(
    `${result.files.length} files written${result.git.initialized ? ", git repository initialized" : ""}`,
  );
  log.plain("");
  log.plain("Next steps:");
  log.plain(`  cd ${result.directory}`);
  log.plain("  ivt build");
  log.plain("  ivt test");
  log.plain("  ivt package");
  log.plain("  ivt run --latest");
  return 0;
}

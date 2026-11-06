import { buildProject, runProjectTests } from "../build.ts";
import { findProject } from "../project.ts";
import { runSdk } from "../sdk.ts";
import { CliError, log, truncate } from "../util.ts";
import { ensureRuntimeReady, type Context } from "./shared.ts";

export interface TestOptions {
  project?: string;
  json: boolean;
}

export async function testCommand(context: Context, options: TestOptions): Promise<number> {
  const project = findProject(options.project);
  log.step(`type checking and bundling ${project.manifest.id}`);
  const build = await buildProject(project);

  log.step("running application tests");
  const tests = runProjectTests(project, context.node.node);
  if (!tests.ok) {
    throw new CliError(`application tests failed:\n${truncate(tests.output, 8000)}`);
  }

  log.step("running Developer Kit source validation");
  const sdkResult = await runSdk<Record<string, unknown>>(["test", project.root], {
    kitRoot: context.kitRoot,
    cwd: project.root,
  });
  ensureRuntimeReady(context);

  const summary = {
    status: "pass",
    applicationId: project.manifest.id,
    typecheck: "pass",
    bundleBytes: build.bundle.bytes,
    unitTests: { files: tests.files.length, output: tests.output },
    sdk: sdkResult,
  };
  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
    return 0;
  }
  log.ok(
    `type check passed; ${tests.files.length} test file(s) passed; SDK validated ` +
      `${String(sdkResult.javascriptChecked ?? "?")} JavaScript file(s)`,
  );
  return 0;
}

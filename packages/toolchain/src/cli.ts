#!/usr/bin/env node
import {
  CliError,
  flagBoolean,
  flagList,
  flagString,
  log,
  parseFlags,
  style,
  type FlagSpec,
  type ParsedFlags,
} from "./util.ts";
import { prepare, type Context } from "./commands/shared.ts";
import { doctorCommand } from "./commands/doctor.ts";
import { newCommand } from "./commands/new.ts";
import { buildCommand } from "./commands/build.ts";
import { testCommand } from "./commands/test.ts";
import { packageCommand } from "./commands/package.ts";
import { runCommand, devCommand } from "./commands/run.ts";
import { verifyCommand } from "./commands/verify.ts";
import { stateCommand, type StateAction } from "./commands/state.ts";
import { smokeCommand } from "./commands/smoke.ts";
import { passthroughCommand } from "./commands/passthrough.ts";

const TOOLCHAIN_VERSION = "0.1.0";

interface Globals {
  kit?: string;
  json: boolean;
  verbose: boolean;
  quiet: boolean;
  help: boolean;
  version: boolean;
}

interface CommandDefinition {
  summary: string;
  usage: string;
  details?: string;
  run: (context: Context, args: string[], globals: Globals) => Promise<number>;
}

function extractGlobals(argv: string[]): { globals: Globals; command?: string; rest: string[] } {
  const globals: Globals = {
    json: false,
    verbose: false,
    quiet: false,
    help: false,
    version: false,
  };
  const rest: string[] = [];
  let command: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] as string;
    switch (argument) {
      case "--json":
        globals.json = true;
        break;
      case "--verbose":
        globals.verbose = true;
        break;
      case "--quiet":
        globals.quiet = true;
        break;
      case "--help":
      case "-h":
        globals.help = true;
        break;
      case "--version":
      case "-V":
        globals.version = true;
        break;
      case "--kit": {
        const value = argv[(index += 1)];
        if (!value) throw new CliError("--kit requires a directory", 2);
        globals.kit = value;
        break;
      }
      default: {
        if (argument.startsWith("--kit=")) {
          globals.kit = argument.slice("--kit=".length);
        } else if (command === undefined && !argument.startsWith("-")) {
          command = argument;
        } else {
          rest.push(argument);
        }
      }
    }
  }
  return { globals, command, rest };
}

function specs(
  entries: Record<string, { type: "boolean" | "string" | "string[]"; description: string }>,
): Record<string, FlagSpec> {
  return entries;
}

function printHelp(commands: Record<string, CommandDefinition>): void {
  log.plain(style.bold("ivt — TypeScript toolchain for IrisView AR glasses applications"));
  log.plain("");
  log.plain("Usage: ivt <command> [options]");
  log.plain("");
  log.plain("Commands:");
  const width = Math.max(...Object.keys(commands).map((name) => name.length));
  for (const [name, definition] of Object.entries(commands)) {
    log.plain(`  ${name.padEnd(width)}  ${definition.summary}`);
  }
  log.plain("");
  log.plain("Global options:");
  log.plain("  --kit <dir>     IrisView Developer Kit root (default: auto-detect)");
  log.plain("  --json          machine-readable output");
  log.plain("  --verbose       extra detail");
  log.plain("  --quiet         suppress progress output");
  log.plain("  -h, --help      show help for a command");
  log.plain("  -V, --version   print the toolchain version");
  log.plain("");
  log.plain("Run `ivt <command> --help` for command-specific options.");
}

function commandHelp(name: string, definition: CommandDefinition): void {
  log.plain(style.bold(`ivt ${name}`));
  log.plain("");
  log.plain(`Usage: ${definition.usage}`);
  log.plain("");
  log.plain(definition.summary);
  if (definition.details) {
    log.plain("");
    log.plain(definition.details);
  }
}

function parseCommandFlags(args: string[], flagSpecs: Record<string, FlagSpec>): ParsedFlags {
  return parseFlags(args, flagSpecs);
}

function commonProject(parsed: ParsedFlags): string | undefined {
  return flagString(parsed, "project") ?? parsed.positionals[0];
}

const COMMANDS: Record<string, CommandDefinition> = {
  doctor: {
    summary: "check the host, Kit, pinned Node.js/npm and repair stale Kit integrity metadata",
    usage: "ivt doctor [project] [--fix|--no-fix] [--json]",
    details:
      "On Fedora and other non-Ubuntu hosts the SDK's Ubuntu-only host predicate is\n" +
      "overridden in memory (IRISVIEW_ALLOW_UNSUPPORTED_HOST). Set IRISVIEW_STRICT_HOST=1\n" +
      "to disable that override and see the unmodified check.",
    run: async (context, args, globals) => {
      const parsed = parseCommandFlags(
        args,
        specs({
          fix: { type: "boolean", description: "repair stale Kit integrity metadata (default)" },
          "no-fix": { type: "boolean", description: "report stale Kit metadata without repairing" },
          project: { type: "string", description: "optional application project to validate" },
        }),
      );
      if (globals.help) {
        commandHelp("doctor", COMMANDS.doctor as CommandDefinition);
        return 0;
      }
      const project = flagString(parsed, "project") ?? parsed.positionals[0];
      return doctorCommand(context, {
        project,
        fix: flagBoolean(parsed, "fix") || !flagBoolean(parsed, "no-fix"),
        json: globals.json,
      });
    },
  },
  new: {
    summary: "create a TypeScript application project",
    usage:
      "ivt new <directory> --id <application.id> --name <english name> [--name-zh <name>] [--no-git]",
    run: async (context, args, globals) => {
      const parsed = parseCommandFlags(
        args,
        specs({
          id: { type: "string", description: "application id (lowercase dot/dash)" },
          name: { type: "string", description: "English display name" },
          "name-zh": { type: "string", description: "Chinese display name" },
          "no-git": { type: "boolean", description: "do not initialize a Git repository" },
        }),
      );
      if (globals.help) {
        commandHelp("new", COMMANDS.new as CommandDefinition);
        return 0;
      }
      const directory = parsed.positionals[0];
      if (!directory) throw new CliError("missing destination directory", 2);
      const id = flagString(parsed, "id");
      const name = flagString(parsed, "name");
      if (!id) throw new CliError("missing --id", 2);
      if (!name) throw new CliError("missing --name", 2);
      return newCommand(context, {
        directory,
        id,
        name,
        nameZh: flagString(parsed, "name-zh"),
        git: !flagBoolean(parsed, "no-git"),
        json: globals.json,
      });
    },
  },
  build: {
    summary: "type check app-src and bundle it into src/index.js",
    usage: "ivt build [project] [--json]",
    run: async (context, args, globals) => {
      const parsed = parseCommandFlags(
        args,
        specs({ project: { type: "string", description: "application project directory" } }),
      );
      if (globals.help) {
        commandHelp("build", COMMANDS.build as CommandDefinition);
        return 0;
      }
      return buildCommand(context, { project: commonProject(parsed), json: globals.json });
    },
  },
  test: {
    summary: "type check, run application tests and Developer Kit source validation",
    usage: "ivt test [project] [--json]",
    run: async (context, args, globals) => {
      const parsed = parseCommandFlags(
        args,
        specs({ project: { type: "string", description: "application project directory" } }),
      );
      if (globals.help) {
        commandHelp("test", COMMANDS.test as CommandDefinition);
        return 0;
      }
      return testCommand(context, { project: commonProject(parsed), json: globals.json });
    },
  },
  package: {
    summary: "build a .fuiapp application package",
    usage:
      "ivt package [project] [--output <file>] [--profile release|diagnostic] [--signed --signing-key <pem> --key-id <id>] [--no-build]",
    run: async (context, args, globals) => {
      const parsed = parseCommandFlags(
        args,
        specs({
          project: { type: "string", description: "application project directory" },
          output: { type: "string", description: "output .fuiapp path" },
          profile: { type: "string", description: "release (default) or diagnostic" },
          "debug-unsigned": {
            type: "boolean",
            description: "produce a debug-unsigned package (default)",
          },
          signed: { type: "boolean", description: "produce a signed package" },
          "signing-key": { type: "string", description: "publisher private key (PEM)" },
          "key-id": { type: "string", description: "publisher key id" },
          "trusted-key": { type: "string[]", description: "trusted-key id=path for verification" },
          "no-build": { type: "boolean", description: "reuse the existing src/index.js" },
          "source-revision": { type: "string", description: "explicit Git revision" },
          "source-state": {
            type: "string",
            description: "clean or dirty (with --source-revision)",
          },
        }),
      );
      if (globals.help) {
        commandHelp("package", COMMANDS.package as CommandDefinition);
        return 0;
      }
      const signed = flagBoolean(parsed, "signed");
      const sourceState = flagString(parsed, "source-state");
      if (sourceState !== undefined && sourceState !== "clean" && sourceState !== "dirty") {
        throw new CliError("--source-state must be clean or dirty", 2);
      }
      const profile = flagString(parsed, "profile") ?? "release";
      if (profile !== "release" && profile !== "diagnostic") {
        throw new CliError("--profile must be release or diagnostic", 2);
      }
      return packageCommand(context, {
        project: commonProject(parsed),
        output: flagString(parsed, "output"),
        profile,
        debugUnsigned: !signed,
        signingKey: flagString(parsed, "signing-key"),
        keyId: flagString(parsed, "key-id"),
        trustedKeys: flagList(parsed, "trusted-key"),
        build: !flagBoolean(parsed, "no-build"),
        sourceRevision: flagString(parsed, "source-revision"),
        sourceState,
        json: globals.json,
      });
    },
  },
  verify: {
    summary: "verify a .fuiapp package",
    usage: "ivt verify [package] [--latest] [--allow-debug-unsigned] [--trusted-key <id=path>]",
    run: async (context, args, globals) => {
      const parsed = parseCommandFlags(
        args,
        specs({
          latest: { type: "boolean", description: "use the most recently packaged artifact" },
          project: { type: "string", description: "project that owns the artifact" },
          "allow-debug-unsigned": {
            type: "boolean",
            description: "accept debug-unsigned packages",
          },
          "trusted-key": { type: "string[]", description: "trusted-key id=path" },
        }),
      );
      if (globals.help) {
        commandHelp("verify", COMMANDS.verify as CommandDefinition);
        return 0;
      }
      return verifyCommand(context, {
        package: parsed.positionals[0],
        latest: flagBoolean(parsed, "latest"),
        project: flagString(parsed, "project"),
        allowDebugUnsigned: flagBoolean(parsed, "allow-debug-unsigned"),
        trustedKeys: flagList(parsed, "trusted-key"),
        json: globals.json,
      });
    },
  },
  run: {
    summary: "install a package in the simulator and run it",
    usage:
      "ivt run [package] [--latest] [--project <dir>] [--profile release|diagnostic] [--display-mode mono|stereo] [--audio-mode desktop|silent] [--port <n>]",
    run: async (context, args, globals) => {
      const parsed = parseRunFlags(args);
      if (globals.help) {
        commandHelp("run", COMMANDS.run as CommandDefinition);
        return 0;
      }
      return runCommand(context, runOptions(parsed));
    },
  },
  dev: {
    summary: "build, package and run in one step",
    usage: "ivt dev [project] [--profile ...] [--display-mode ...] [--audio-mode ...]",
    run: async (context, args, globals) => {
      const parsed = parseRunFlags(args);
      if (globals.help) {
        commandHelp("dev", COMMANDS.dev as CommandDefinition);
        return 0;
      }
      return devCommand(context, {
        ...runOptions(parsed),
        project: flagString(parsed, "project") ?? parsed.positionals[0],
      });
    },
  },
  smoke: {
    summary: "headless end-to-end acceptance run (build, package, present a frame under Xvfb)",
    usage: "ivt smoke [project] [--profile release|diagnostic] [--timeout <seconds>]",
    run: async (context, args, globals) => {
      const parsed = parseCommandFlags(
        args,
        specs({
          project: { type: "string", description: "application project directory" },
          profile: { type: "string", description: "release or diagnostic" },
          timeout: { type: "string", description: "simulator run timeout in seconds" },
          "keep-state": { type: "boolean", description: "keep smoke test state" },
        }),
      );
      if (globals.help) {
        commandHelp("smoke", COMMANDS.smoke as CommandDefinition);
        return 0;
      }
      const profile = flagString(parsed, "profile") ?? "release";
      if (profile !== "release" && profile !== "diagnostic") {
        throw new CliError("--profile must be release or diagnostic", 2);
      }
      const timeout = Number(flagString(parsed, "timeout") ?? "45");
      return smokeCommand(context, {
        project: commonProject(parsed),
        profile,
        timeoutSeconds: Number.isFinite(timeout) && timeout > 0 ? timeout : 45,
        keepState: flagBoolean(parsed, "keep-state"),
      });
    },
  },
  state: {
    summary: "inspect or reset simulator state",
    usage:
      "ivt state <path|status|reset|adopt> [--profile release|diagnostic] [--scope profile|shared] [--force]",
    run: async (context, args, globals) => {
      const parsed = parseCommandFlags(
        args,
        specs({
          profile: { type: "string", description: "release or diagnostic" },
          scope: { type: "string", description: "profile or shared (reset)" },
          force: { type: "boolean", description: "confirm destructive reset" },
        }),
      );
      if (globals.help) {
        commandHelp("state", COMMANDS.state as CommandDefinition);
        return 0;
      }
      const action = parsed.positionals[0] as StateAction | undefined;
      if (!action || !["path", "status", "reset", "adopt"].includes(action)) {
        throw new CliError("state requires one of: path, status, reset, adopt", 2);
      }
      const profile = flagString(parsed, "profile");
      if (profile !== undefined && profile !== "release" && profile !== "diagnostic") {
        throw new CliError("--profile must be release or diagnostic", 2);
      }
      const scope = flagString(parsed, "scope") ?? "profile";
      if (scope !== "profile" && scope !== "shared") {
        throw new CliError("--scope must be profile or shared", 2);
      }
      return stateCommand(context, {
        action,
        profile,
        force: flagBoolean(parsed, "force"),
        scope,
        json: globals.json,
      });
    },
  },
  deploy: {
    summary: "install a package on an Ubuntu or Android Client (SDK passthrough)",
    usage: "ivt deploy <package> --host ubuntu|android [SDK options]",
    run: async (context, args, globals) => {
      if (globals.help) {
        commandHelp("deploy", COMMANDS.deploy as CommandDefinition);
        return 0;
      }
      return passthroughCommand(context, ["deploy", ...args], { json: globals.json });
    },
  },
  uninstall: {
    summary: "remove an application from a Client (SDK passthrough)",
    usage: "ivt uninstall <application-id> --host ubuntu|android [SDK options]",
    run: async (context, args, globals) => {
      if (globals.help) {
        commandHelp("uninstall", COMMANDS.uninstall as CommandDefinition);
        return 0;
      }
      return passthroughCommand(context, ["uninstall", ...args], { json: globals.json });
    },
  },
};

function parseRunFlags(args: string[]): ParsedFlags {
  return parseFlags(
    args,
    specs({
      latest: { type: "boolean", description: "run the most recently packaged artifact" },
      project: { type: "string", description: "application project directory" },
      profile: { type: "string", description: "release (default) or diagnostic" },
      "display-mode": { type: "string", description: "mono (default) or stereo" },
      "audio-mode": { type: "string", description: "desktop (default) or silent" },
      port: { type: "string", description: "simulator TCP port (default 28045)" },
      "allow-debug-replace": {
        type: "boolean",
        description: "replace an installed debug app with the same versionCode",
      },
      "dry-run": {
        type: "boolean",
        description: "print the launch plan without starting the simulator",
      },
    }),
  );
}

function runOptions(parsed: ParsedFlags) {
  const profile = flagString(parsed, "profile") ?? "release";
  if (profile !== "release" && profile !== "diagnostic") {
    throw new CliError("--profile must be release or diagnostic", 2);
  }
  const displayMode = flagString(parsed, "display-mode") ?? "mono";
  if (displayMode !== "mono" && displayMode !== "stereo") {
    throw new CliError("--display-mode must be mono or stereo", 2);
  }
  const audioMode = flagString(parsed, "audio-mode") ?? "desktop";
  if (audioMode !== "desktop" && audioMode !== "silent") {
    throw new CliError("--audio-mode must be desktop or silent", 2);
  }
  const port = Number(flagString(parsed, "port") ?? "28045");
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new CliError("--port must be an integer between 1024 and 65535", 2);
  }
  return {
    package: parsed.positionals[0],
    latest: flagBoolean(parsed, "latest"),
    project: flagString(parsed, "project"),
    profile: profile as "release" | "diagnostic",
    displayMode: displayMode as "mono" | "stereo",
    audioMode: audioMode as "desktop" | "silent",
    port,
    allowDebugReplace:
      flagBoolean(parsed, "allow-debug-replace") || !flagBoolean(parsed, "no-replace"),
    dryRun: flagBoolean(parsed, "dry-run"),
  };
}

async function main(argv: string[]): Promise<number> {
  const { globals, command, rest } = extractGlobals(argv);
  if (globals.verbose) process.env.IRISVIEW_VERBOSE = "1";
  if (globals.quiet) process.env.IRISVIEW_QUIET = "1";
  if (globals.version) {
    log.plain(TOOLCHAIN_VERSION);
    return 0;
  }
  if (command === undefined) {
    printHelp(COMMANDS);
    return globals.help ? 0 : 1;
  }
  const definition = COMMANDS[command];
  if (!definition) {
    log.error(`unknown command: ${command}`);
    printHelp(COMMANDS);
    return 2;
  }
  if (globals.help) {
    commandHelp(command, definition);
    return 0;
  }
  const context = prepare({ kit: globals.kit });
  return definition.run(context, rest, globals);
}

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    if (error instanceof CliError) {
      log.error(error.message);
      process.exitCode = error.exitCode;
      return;
    }
    log.error((error as Error).message);
    if (process.env.IRISVIEW_VERBOSE === "1") console.error((error as Error).stack);
    process.exitCode = 1;
  });

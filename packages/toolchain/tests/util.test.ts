import { describe, expect, it } from "vitest";

import {
  flagBoolean,
  flagList,
  flagString,
  parseFlags,
  sha256Bytes,
  sha256File,
  writeIfChanged,
} from "../src/util.ts";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

describe("parseFlags", () => {
  it("parses boolean, string and repeated flags", () => {
    const parsed = parseFlags(
      ["--latest", "--project", "apps/demo", "--trusted-key", "a=1", "--trusted-key", "b=2"],
      {
        latest: { type: "boolean", description: "" },
        project: { type: "string", description: "" },
        "trusted-key": { type: "string[]", description: "" },
      },
    );
    expect(flagBoolean(parsed, "latest")).toBe(true);
    expect(flagString(parsed, "project")).toBe("apps/demo");
    expect(flagList(parsed, "trusted-key")).toEqual(["a=1", "b=2"]);
  });

  it("supports --name=value", () => {
    const parsed = parseFlags(["--profile=diagnostic", "demo"], {
      profile: { type: "string", description: "", alias: "p" },
    });
    expect(flagString(parsed, "profile")).toBe("diagnostic");
    expect(parsed.positionals).toEqual(["demo"]);
  });

  it("supports short aliases", () => {
    const parsed = parseFlags(["-p", "release"], {
      profile: { type: "string", description: "", alias: "p" },
    });
    expect(flagString(parsed, "profile")).toBe("release");
  });

  it("rejects unknown flags", () => {
    expect(() => parseFlags(["--nope"], {})).toThrow("unknown option");
  });
});

describe("hashing", () => {
  it("hashes text deterministically", () => {
    expect(sha256Bytes("hello")).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });

  it("hashes a file and rewrites only when content changes", () => {
    const path = join(process.cwd(), ".state", "cache", `test-write-${Date.now()}.txt`);
    rmSync(path, { force: true });
    expect(writeIfChanged(path, "first")).toBe(true);
    expect(writeIfChanged(path, "first")).toBe(false);
    expect(readFileSync(path, "utf8")).toBe("first");
    expect(sha256File(path)).toBe(sha256Bytes("first"));
    expect(existsSync(path)).toBe(true);
    rmSync(path, { force: true });
  });
});

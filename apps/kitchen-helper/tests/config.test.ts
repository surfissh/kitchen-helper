import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { applicationDataPath } from "../app-src/application-data.ts";
import {
  DEEPSEEK_KEY_FILE,
  deepSeekKeyFilePath,
  deepSeekKeyStatus,
  ensureDeepSeekKeyTemplate,
  resolveDeepSeekKey,
} from "../app-src/config.ts";

const DATA_ENV = "FUSIONUI_APP_DATA_DIR";
const KEY_ENV = "DEEPSEEK_API_KEY";

/** Run `body` with a fresh private data directory and a clean key environment. */
function withTempDataDir(body: (directory: string) => void): void {
  const previousData = process.env[DATA_ENV];
  const previousKey = process.env[KEY_ENV];
  const directory = mkdtempSync(join(tmpdir(), "kitchen-helper-key-"));
  try {
    delete process.env[KEY_ENV];
    process.env[DATA_ENV] = directory;
    body(directory);
  } finally {
    if (previousData === undefined) delete process.env[DATA_ENV];
    else process.env[DATA_ENV] = previousData;
    if (previousKey === undefined) delete process.env[KEY_ENV];
    else process.env[KEY_ENV] = previousKey;
    rmSync(directory, { recursive: true, force: true });
  }
}

test("a fresh data directory gets an explanatory key-file template", () => {
  withTempDataDir((directory) => {
    ensureDeepSeekKeyTemplate();
    const path = join(directory, DEEPSEEK_KEY_FILE);
    assert.ok(applicationDataPath(DEEPSEEK_KEY_FILE));
    assert.equal(existsSync(path), true);
    // The template only contains comments, so it does not configure a key.
    assert.equal(deepSeekKeyStatus().source, "none");
    assert.equal(resolveDeepSeekKey(), "");
  });
});

test("seeding never overwrites a pasted key", () => {
  withTempDataDir((directory) => {
    const path = join(directory, DEEPSEEK_KEY_FILE);
    writeFileSync(path, "sk-keep-me\n");
    ensureDeepSeekKeyTemplate();
    assert.equal(resolveDeepSeekKey(), "sk-keep-me");
  });
});

test("the key is read from the application data directory at call time", () => {
  withTempDataDir((directory) => {
    assert.equal(deepSeekKeyStatus().source, "none");
    assert.equal(resolveDeepSeekKey(), "");

    const path = applicationDataPath(DEEPSEEK_KEY_FILE);
    assert.ok(path);
    writeFileSync(path as string, "# paste the key below this line\n\n  sk-from-state-dir  \n");

    const status = deepSeekKeyStatus();
    assert.equal(status.source, "file");
    assert.equal(status.filePath, join(directory, DEEPSEEK_KEY_FILE));
    assert.equal(deepSeekKeyFilePath(), join(directory, DEEPSEEK_KEY_FILE));
    assert.equal(resolveDeepSeekKey(), "sk-from-state-dir");
  });
});

test("the environment variable wins over the state-directory key file", () => {
  withTempDataDir((directory) => {
    writeFileSync(join(directory, DEEPSEEK_KEY_FILE), "sk-from-file\n");
    process.env[KEY_ENV] = "sk-from-env";
    assert.equal(deepSeekKeyStatus().source, "env");
    assert.equal(resolveDeepSeekKey(), "sk-from-env");
  });
});

test("comment-only or blank key files mean no key is configured", () => {
  withTempDataDir((directory) => {
    writeFileSync(join(directory, DEEPSEEK_KEY_FILE), "# only a comment\n\n   \n");
    assert.equal(deepSeekKeyStatus().source, "none");
    assert.equal(resolveDeepSeekKey(), "");
  });
});

test("application data paths may not escape the private directory", () => {
  withTempDataDir(() => {
    assert.equal(applicationDataPath("../escape.txt"), null);
    assert.equal(applicationDataPath("/absolute.txt"), null);
    assert.equal(applicationDataPath(""), null);
  });
});

test("without an application data directory no key file is used", () => {
  const previousData = process.env[DATA_ENV];
  const previousKey = process.env[KEY_ENV];
  try {
    delete process.env[DATA_ENV];
    delete process.env[KEY_ENV];
    assert.equal(deepSeekKeyFilePath(), null);
    assert.equal(deepSeekKeyStatus().source, "none");
  } finally {
    if (previousData === undefined) delete process.env[DATA_ENV];
    else process.env[DATA_ENV] = previousData;
    if (previousKey === undefined) delete process.env[KEY_ENV];
    else process.env[KEY_ENV] = previousKey;
  }
});

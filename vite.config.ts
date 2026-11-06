import { defineConfig } from "vite-plus";

/**
 * The Developer Kit and the platform documentation bundle are vendored,
 * read-only inputs. Never format or lint them: their internal SHA-256
 * manifests describe the shipped bytes and reformatting breaks the runtime
 * integrity checks (see docs/fedora-compatibility.md).
 */
const ignored = [
  "IrisView-Developer-Kit-v1.0.0/**",
  "IrisView-Platform-Alpha-中英双语版-v3/**",
  ".state/**",
  ".sandbox/**",
  ".tmp/**",
  "node_modules/**",
  "**/dist/**",
  "apps/kitchen-helper/src/index.js",
];

export default defineConfig({
  fmt: {
    ignorePatterns: ignored,
  },
  lint: {
    ignorePatterns: ignored,
  },
  staged: {
    "*": "vp check --fix",
  },
  test: {
    include: ["packages/toolchain/tests/**/*.test.ts"],
  },
  run: {
    tasks: {
      "toolchain:check": "tsc -p packages/toolchain/tsconfig.json",
      "toolchain:test": "vp test packages/toolchain/tests",
      doctor: "node packages/toolchain/src/cli.ts doctor",
      "app:build": "node packages/toolchain/src/cli.ts build apps/kitchen-helper",
      "app:test": "node packages/toolchain/src/cli.ts test apps/kitchen-helper",
      "app:package": "node packages/toolchain/src/cli.ts package apps/kitchen-helper",
      "app:run": "node packages/toolchain/src/cli.ts run --latest --project apps/kitchen-helper",
      "app:smoke": "node packages/toolchain/src/cli.ts smoke apps/kitchen-helper",
    },
  },
});

import { describe, expect, it } from "vitest";

import { isApplicationId } from "../src/project.ts";
import { discoverTemplateFiles } from "../src/scaffold.ts";
import { findKitRoot, workspaceRoot } from "../src/paths.ts";

describe("application ids", () => {
  it("accepts lowercase dot and dash separated ids", () => {
    expect(isApplicationId("com.example.recipe")).toBe(true);
    expect(isApplicationId("partner-weather")).toBe(true);
    expect(isApplicationId("example.hello")).toBe(true);
  });

  it("rejects invalid ids", () => {
    expect(isApplicationId("Com.Example")).toBe(false);
    expect(isApplicationId("example_hello")).toBe(false);
    expect(isApplicationId("example..hello")).toBe(false);
    expect(isApplicationId("")).toBe(false);
  });
});

describe("bundled template", () => {
  it("contains the TypeScript application files", () => {
    const files = discoverTemplateFiles();
    expect(files).toContain("app-src/index.ts");
    expect(files).toContain("app-src/app.ts");
    expect(files).toContain("src/XRManifest.xml.tpl");
    expect(files).toContain("FusionUIApp.json.tpl");
    expect(files).toContain("tests/app.test.ts");
  });
});

describe("kit discovery", () => {
  it("finds the vendored kit from the workspace", () => {
    const kit = findKitRoot();
    expect(kit.startsWith(workspaceRoot)).toBe(true);
    expect(kit).toContain("IrisView-Developer-Kit-");
  });
});

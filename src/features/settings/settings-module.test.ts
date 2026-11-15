import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadedModules } from "../../lazy/lazy-module";
import { openSettingsDialog, settingsFeature } from "./lazy";

/**
 * The module's contract: the one dependency, pinned exactly; the one lazy
 * registry name; the one entry function later tasks wire (the spec's
 * "Produces"). Nothing at startup imports Base UI - the module loads on
 * first use (lazy.ts's dynamic import is the only way in).
 */
const pkg = JSON.parse(
  readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
) as Record<string, Record<string, string>>;

describe("the settings features module", () => {
  it("pins @base-ui/react at exactly 1.9.0, no range", () => {
    expect(pkg.dependencies["@base-ui/react"]).toBe("1.9.0");
  });

  it("registers one lazy module, settings-features, loaded on demand", async () => {
    expect(loadedModules()).not.toContain("settings-features");
    await settingsFeature.load();
    expect(loadedModules()).toContain("settings-features");
  });

  it("opens through openSettingsDialog, the single entry", async () => {
    expect(typeof openSettingsDialog).toBe("function");
    await expect(openSettingsDialog()).resolves.toBeUndefined();
  });
});

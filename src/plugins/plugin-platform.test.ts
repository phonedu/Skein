import { describe, expect, it, vi } from "vitest";
import type { PluginManifest } from "./store/manifest-types";

// The platform flags are read at each call, so one file covers all three.
const here = vi.hoisted(() => ({ android: false, ios: false }));

vi.mock("../platform/capabilities", () => ({
  get isAndroidApp() {
    return here.android;
  },
  get isIOSApp() {
    return here.ios;
  },
}));
vi.mock("../platform/window-chrome", () => ({
  platformName: () => (here.android ? "android" : "ios"),
}));

import { runsHere } from "./plugin-platform";

const withPlatforms = (...platforms: PluginManifest["platforms"][number][]) =>
  ({ platforms }) as unknown as PluginManifest;

describe("where a plugin runs", () => {
  it("takes a plugin that names Android on an Android phone", () => {
    here.android = true;
    here.ios = false;
    expect(runsHere(withPlatforms("android"))).toBe(true);
    // One made for iOS's web view runs in Android's as well.
    expect(runsHere(withPlatforms("ios"))).toBe(true);
    expect(runsHere(withPlatforms("desktop"))).toBe(false);
  });

  it("takes an iOS plugin on iOS, and no Android-only one there", () => {
    here.android = false;
    here.ios = true;
    expect(runsHere(withPlatforms("ios"))).toBe(true);
    expect(runsHere(withPlatforms("android"))).toBe(false);
    expect(runsHere(withPlatforms("desktop"))).toBe(false);
  });

  it("takes a desktop plugin on the desktop alone", () => {
    here.android = false;
    here.ios = false;
    expect(runsHere(withPlatforms("desktop"))).toBe(true);
    expect(runsHere(withPlatforms("android"))).toBe(false);
    expect(runsHere(withPlatforms("ios"))).toBe(false);
  });
});

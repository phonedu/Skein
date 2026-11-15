import { lazyModule } from "../../lazy/lazy-module";
import type { openSettingsDialog as open } from "./index";

/**
 * The settings page's module, one lazy entry for the app's three triggers
 * (⌘, , the rail's gear, the app menu) to share. `openSettingsDialog` is the
 * single door: callers never import the module themselves.
 */
export const settingsFeature = lazyModule("settings-features", () =>
  import("./index"),
);

export async function openSettingsDialog(): Promise<void> {
  const module = await settingsFeature.load();
  module.openSettingsDialog();
}

export type { open };

import { lazyModule } from "../../lazy/lazy-module";
import type { openSettingsDialog as open } from "./index";

/**
 * The settings page's module, one lazy entry for the app's three triggers
 * (⌘, , the rail's gear, the app menu) to share. `openSettingsDialog` is the
 * single door: callers never import the module themselves.
 *
 * Warmed once the window is idle: the old Settings tab was warmed too, so
 * the first open shows a panel rather than a pause.
 */
export const settingsFeature = lazyModule(
  "settings-features",
  () => import("./index"),
  { warm: true },
);

export async function openSettingsDialog(): Promise<void> {
  const module = await settingsFeature.load();
  module.openSettingsDialog();
}

export type { open };

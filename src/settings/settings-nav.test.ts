import { afterEach, expect, it } from "vitest";
import {
  closeSettingsDialog,
  onSettingsDialogChange,
  settingsDialogOpen,
  showSettingsDialog,
} from "./settings-nav";

afterEach(() => closeSettingsDialog());

it("opens at General, or at the page a deep link asks for", () => {
  expect(settingsDialogOpen()).toBeNull();
  showSettingsDialog();
  expect(settingsDialogOpen()).toMatchObject({ page: "general" });
  showSettingsDialog("look-basic");
  expect(settingsDialogOpen()).toMatchObject({ page: "look-basic" });
});

it("each request counts, so one made while open goes to its page again", () => {
  showSettingsDialog("look-basic");
  const first = settingsDialogOpen()!.request;
  showSettingsDialog("look-basic");
  expect(settingsDialogOpen()!.request).not.toBe(first);
});

it("carries a search result's row to go to, and closes to nothing", () => {
  const jump = {
    page: "general",
    kind: "row" as const,
    label: "语言",
    group: "",
    help: "",
  };
  showSettingsDialog("general", jump);
  expect(settingsDialogOpen()!.jump).toBe(jump);
  let told = 0;
  const off = onSettingsDialogChange(() => told++);
  closeSettingsDialog();
  expect(settingsDialogOpen()).toBeNull();
  expect(told).toBe(1);
  // Closing what is shut says nothing.
  closeSettingsDialog();
  expect(told).toBe(1);
  off();
});

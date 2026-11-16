// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

// The desktop: not an iPhone or iPad, so the dialog (ruling 1).
vi.mock("../platform/capabilities", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  isIOSApp: false,
}));

import { useSettingsOpening } from "./SettingsLayer";
import {
  closeSettingsDialog,
  OPEN_SETTINGS_PAGE_EVENT,
  settingsDialogOpen,
} from "../settings/settings-nav";

afterEach(() => {
  cleanup();
  closeSettingsDialog();
});
const tabs = {
  tabsRef: { current: [] },
  setTabs: vi.fn(),
  setActiveTabId: vi.fn(),
  updateTab: vi.fn(),
} as never;

it("⌘, opens the dialog at General; while open it keeps its page", () => {
  const { result } = renderHook(() => useSettingsOpening(tabs));
  act(() => result.current.openSettings());
  expect(settingsDialogOpen()).toMatchObject({ page: "general" });
  // A deep link (a search result in the sidebar) goes to its page.
  act(() =>
    window.dispatchEvent(
      new CustomEvent(OPEN_SETTINGS_PAGE_EVENT, {
        detail: { page: "look-basic" },
      }),
    ),
  );
  expect(settingsDialogOpen()).toMatchObject({ page: "look-basic" });
  // Already open: ⌘, keeps the page it was on.
  act(() => result.current.openSettings());
  expect(settingsDialogOpen()).toMatchObject({ page: "look-basic" });
});

it("Check for Updates opens the dialog at About, checking", () => {
  const { result } = renderHook(() => useSettingsOpening(tabs));
  act(() => result.current.openUpdates());
  expect(settingsDialogOpen()).toMatchObject({ page: "updates" });
});

it("a plugin's settings open in the dialog; its list needs no page", () => {
  const { result } = renderHook(() => useSettingsOpening(tabs));
  act(() => result.current.openPluginSettings("cloud-sync"));
  expect(settingsDialogOpen()!.page).toContain("cloud-sync");
  act(() => result.current.openPluginSettings());
  // The plugins list is the sidebar's: the dialog stays as it was.
  expect(settingsDialogOpen()!.page).toContain("cloud-sync");
});

it("close shuts the dialog", () => {
  const { result } = renderHook(() => useSettingsOpening(tabs));
  act(() => result.current.openSettings());
  act(() => result.current.close());
  expect(settingsDialogOpen()).toBeNull();
});

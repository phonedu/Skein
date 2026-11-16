// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

// An iPad: the old sheet over the window, the dialog shut.
vi.mock("../platform/capabilities", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  isIOSApp: true,
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

it("the iPad keeps the sheet: the dialog stays shut", () => {
  const { result } = renderHook(() => useSettingsOpening(tabs));
  act(() => result.current.openSettings());
  expect(settingsDialogOpen()).toBeNull();
  expect(result.current.sheet).toMatchObject({ open: "general" });
  act(() => result.current.close());
  expect(result.current.sheet).toMatchObject({ open: null });
});

it("a deep link opens the sheet at its page, not a blank tab", () => {
  const { result } = renderHook(() => useSettingsOpening(tabs));
  act(() =>
    window.dispatchEvent(
      new CustomEvent(OPEN_SETTINGS_PAGE_EVENT, {
        detail: { page: "look-basic" },
      }),
    ),
  );
  expect(settingsDialogOpen()).toBeNull();
  expect(result.current.sheet).toMatchObject({ open: "look-basic" });
});

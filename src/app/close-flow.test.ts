// @vitest-environment jsdom
// The phone's close: the last document closes back to the empty tab list,
// which is the library home. The desktop's close-the-window and start-page
// paths sit behind canUseWindows and are not this file's business.
// (The mocks sit above the imports: the store's start tabs are decided
// once, when useTabState is first evaluated.)
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeBlankTab } from "../document/doc-tabs";

const phone = vi.hoisted(() => ({ layout: true }));
vi.mock("../platform/phone-layout", () => ({
  isPhoneLayout: () => phone.layout,
  onPhoneLayout: () => () => {},
}));

const platform = vi.hoisted(() => ({ canUseWindows: false }));
vi.mock("../platform/capabilities", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../platform/capabilities")>()),
  canUseWindows: platform.canUseWindows,
}));

vi.mock("../platform/ipc", () => ({
  drafts: {
    clearDraftSnapshot: vi.fn(() => Promise.resolve()),
    saveDraftSnapshot: vi.fn(() => Promise.resolve()),
  },
  session: { cancelQuit: vi.fn(() => Promise.resolve()) },
}));

import { useTabRemoval } from "./close-flow";
import { useTabState } from "./tabs/useTabState";
import en from "../i18n/locales/en";
import type { Strings } from "../i18n/strings";

afterEach(cleanup);

describe("the phone's tab removal", () => {
  it("closes the last document back to the empty tab list", () => {
    const { result } = renderHook(() => {
      const tabState = useTabState();
      const removal = useTabRemoval({
        tabState,
        cancelDraftFlushes: () => {},
        flushAutosave: async () => {},
        setPendingClose: () => {},
        // Even asking for the desktop's start page: on a phone there is none.
        closeLastToStartPage: true,
        t: en as Strings,
      });
      return { tabState, ...removal };
    });
    act(() => {
      result.current.tabState.setTabs([makeBlankTab()]);
    });
    act(() => {
      result.current.removeTab(result.current.tabState.tabs[0].id);
    });
    expect(result.current.tabState.tabs).toHaveLength(0);
  });
});

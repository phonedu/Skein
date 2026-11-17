// @vitest-environment jsdom
// The phone's boot: no document tab at first - the library is the home
// (App.tsx renders PhoneHome for an empty tab list). The mocks sit above
// the imports because the store's start tabs are decided once, when
// useTabState is first evaluated.
import { describe, expect, it, vi } from "vitest";

const phone = vi.hoisted(() => ({ layout: true }));
vi.mock("../../platform/phone-layout", () => ({
  isPhoneLayout: () => phone.layout,
  onPhoneLayout: () => () => {},
}));

import { windowTabs } from "../../engine/layout/store";
import type { DocTab } from "../../document/doc-tabs";
import "./useTabState";

describe("the window's start tabs", () => {
  it("starts empty on a phone, so the library home is reachable", () => {
    expect(phone.layout).toBe(true);
    expect(windowTabs<DocTab>()).toHaveLength(0);
  });
});

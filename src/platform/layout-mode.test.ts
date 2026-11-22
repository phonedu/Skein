// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ mobile: true }));
vi.mock("./capabilities", () => ({
  get isMobileApp() {
    return state.mobile;
  },
}));

import {
  isCompactLayout,
  isPhoneLayout,
  isTabletLayout,
  layoutMode,
} from "./layout-mode";

function width(px: number): void {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: px,
  });
  // The shell reads the width as the styles do: through a media query.
  window.matchMedia = ((query: string) => {
    const max = /max-width:\s*(\d+)px/.exec(query);
    const min = /min-width:\s*(\d+)px/.exec(query);
    const matches =
      (!max || px <= Number(max[1])) && (!min || px >= Number(min[1]));
    return {
      matches,
      media: query,
      addEventListener() {},
      removeEventListener() {},
    } as unknown as MediaQueryList;
  }) as typeof window.matchMedia;
}

describe("layoutMode", () => {
  it("a phone below 600, a fold/small tablet 600–839, a tablet at 840", () => {
    state.mobile = true;
    width(390);
    expect(layoutMode()).toBe("phone");
    expect(isPhoneLayout()).toBe(true);
    width(600);
    expect(layoutMode()).toBe("compact");
    expect(isCompactLayout()).toBe(true);
    width(839);
    expect(layoutMode()).toBe("compact");
    width(840);
    expect(layoutMode()).toBe("tablet");
    expect(isTabletLayout()).toBe(true);
  });

  it("a desktop keeps the desktop shell at any width", () => {
    state.mobile = false;
    width(390);
    expect(layoutMode()).toBe("desktop");
    expect(isPhoneLayout()).toBe(false);
    width(1400);
    expect(layoutMode()).toBe("desktop");
  });
});

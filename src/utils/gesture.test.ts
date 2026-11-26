// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { heldByFinger, swipeVelocity } from "./gesture";

function contextmenu(pointerType?: string, button = 0) {
  const e = new MouseEvent("contextmenu", { button });
  if (pointerType)
    Object.defineProperty(e, "pointerType", { value: pointerType });
  return e;
}

describe("a contextmenu held by a finger", () => {
  it("is told by its pointer type where the event has one", () => {
    expect(heldByFinger(contextmenu("touch"))).toBe(true);
    expect(heldByFinger(contextmenu("mouse"))).toBe(false);
  });

  it("is a handle let go when it has no button, long after the touch", () => {
    expect(heldByFinger(contextmenu("mouse", -1))).toBe(true);
    expect(heldByFinger(contextmenu("mouse", 2))).toBe(false);
  });

  it("else by a touch just before it", () => {
    expect(heldByFinger(contextmenu())).toBe(false);
    const down = new Event("pointerdown");
    Object.defineProperty(down, "pointerType", { value: "touch" });
    window.dispatchEvent(down);
    expect(heldByFinger(contextmenu())).toBe(true);
    // Android's double tap and handle drag come as "mouse" ones.
    expect(heldByFinger(contextmenu("mouse"))).toBe(true);
    expect(heldByFinger(contextmenu("pen"))).toBe(false);
  });
});

describe("a release's speed", () => {
  it("reads the last moves, not the whole drag", () => {
    expect(
      swipeVelocity([
        { value: 300, t: 0 },
        { value: 290, t: 400 },
        { value: 250, t: 500 },
        { value: 200, t: 560 },
      ]),
    ).toBeCloseTo(-50 / 60);
  });

  it("is zero without a move to measure", () => {
    expect(swipeVelocity([])).toBe(0);
    expect(swipeVelocity([{ value: 10, t: 100 }])).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import { pagerOffset, pagerTarget, pagerVelocity } from "./pager-model";

const WIDTH = 390;
const PAGES = 2;

describe("the pager's track under a finger", () => {
  it("follows the finger across the pages' span", () => {
    expect(pagerOffset(0, -120, WIDTH, PAGES)).toBe(-120);
    expect(pagerOffset(-WIDTH, 120, WIDTH, PAGES)).toBe(-WIDTH + 120);
  });

  it("gives only a part of a drag past either end", () => {
    // A quarter of the way, so the edge reads as an edge.
    expect(pagerOffset(0, 100, WIDTH, PAGES)).toBe(25);
    expect(pagerOffset(-WIDTH, -100, WIDTH, PAGES)).toBe(-WIDTH - 25);
  });

  it("holds a grab mid-slide: the offset starts where the track is", () => {
    // A finger that takes the track halfway between the pages drags from
    // there, not from the page's own place.
    expect(pagerOffset(-WIDTH / 2, -40, WIDTH, PAGES)).toBe(-WIDTH / 2 - 40);
  });
});

describe("the page a release lands on", () => {
  it("stays on the nearer page without speed", () => {
    expect(pagerTarget(-40, 0, WIDTH, PAGES)).toBe(0);
    expect(pagerTarget(-180, 0, WIDTH, PAGES)).toBe(0);
    expect(pagerTarget(-210, 0, WIDTH, PAGES)).toBe(1);
    expect(pagerTarget(-350, 0, WIDTH, PAGES)).toBe(1);
  });

  it("lets a flick carry past half, in either direction", () => {
    // 60px left, fast: about 280px projected, so the library.
    expect(pagerTarget(-60, -1.1, WIDTH, PAGES)).toBe(1);
    // From the library, 60px right, fast: back to today.
    expect(pagerTarget(-WIDTH + 60, 1.1, WIDTH, PAGES)).toBe(0);
  });

  it("reads a pull back against the flick", () => {
    // Dragged most of the way left, then flicked right at the end.
    expect(pagerTarget(-300, 2, WIDTH, PAGES)).toBe(0);
  });

  it("keeps its ends, however hard the throw", () => {
    expect(pagerTarget(120, 8, WIDTH, PAGES)).toBe(0);
    expect(pagerTarget(-WIDTH - 120, -8, WIDTH, PAGES)).toBe(1);
  });

  it("takes a page of any width", () => {
    expect(pagerTarget(-290, 0, 600, PAGES)).toBe(0);
    // Half a page is the tie, and the tie goes forward.
    expect(pagerTarget(-300, 0, 600, PAGES)).toBe(1);
    expect(pagerTarget(-320, 0, 600, PAGES)).toBe(1);
    expect(pagerTarget(-320, 0, 0, PAGES)).toBe(0);
  });
});

describe("the speed a release reads", () => {
  it("takes the last moves, not the whole drag", () => {
    // The first half of the drag was slow; the finger flicked at the end.
    const samples = [
      { x: 300, t: 0 },
      { x: 290, t: 400 },
      { x: 250, t: 500 },
      { x: 200, t: 560 },
    ];
    expect(pagerVelocity(samples)).toBeCloseTo(-50 / 60);
  });

  it("is zero without a move to measure", () => {
    expect(pagerVelocity([])).toBe(0);
    expect(pagerVelocity([{ x: 10, t: 100 }])).toBe(0);
  });
});

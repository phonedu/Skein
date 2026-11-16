import { describe, expect, it } from "vitest";
import { islandsPlain } from "./DocumentIslands";

/**
 * The single island lies flat (interface redesign, ruling 12: the
 * `ui-d-notes` board draws the editing paper unframed): one island is the
 * page itself, Zen included; only a split keeps the floating sheets, so the
 * islands stay tellable apart.
 */
describe("islandsPlain", () => {
  it("a lone island is plain paper, Zen or not, tab row or not", () => {
    expect(islandsPlain(false, 1)).toBe(true);
    expect(islandsPlain(true, 1)).toBe(true);
  });

  it("a split keeps its floating sheets", () => {
    expect(islandsPlain(false, 2)).toBe(false);
    expect(islandsPlain(false, 3)).toBe(false);
  });

  it("Zen shows one island, plain", () => {
    expect(islandsPlain(true, 1)).toBe(true);
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The activity rail's contract (design boards: rail 56): its width and the
 * fallback that keeps the document's edge on a whole pixel.
 */
const css = readFileSync(
  new URL("./activity-rail.css", import.meta.url),
  "utf8",
);

describe("the activity rail's width", () => {
  it("is 56 interface px, and rounds down to a whole pixel beside the page", () => {
    expect(css).toContain("--rail-width: 56px;");
    expect(css).toContain("--rail-width: round(56px, 1px);");
    expect(css).not.toContain("--rail-width: 48px");
  });
});

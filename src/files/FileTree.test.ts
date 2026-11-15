import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The file tree's rows (design-language.md 5.4: list rows 28 high): drawn
 * rows and the placeholder room for not-yet-drawn ones agree on 28.
 */
const css = readFileSync(new URL("./FileTree.css", import.meta.url), "utf8");

describe("the file tree's row height", () => {
  it("is 28px, in the rows and the undrawn room alike", () => {
    expect(css).toContain("min-height: 28px;");
    expect(css).toContain("var(--row, 28px)");
    expect(css).not.toContain("26px");
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The type scale's contract (design-language.md 4, the design boards): the
 * roles the components name, and the three presets' values for them. The
 * phone keeps its own first design (ds-base.css) - 34/17/15/13/12 - which
 * the desktop's Medium matches.
 */
const css = readFileSync(
  new URL("./ui-sizes.css", import.meta.url),
  "utf8",
);

/** The values of `--text-*` (and one more property) in one preset's block. */
function preset(blockStart: string): Record<string, string> {
  const from = css.indexOf(blockStart);
  expect(from, `no block starting ${blockStart}`).toBeGreaterThanOrEqual(0);
  const body = css.slice(from, css.indexOf("}", from));
  return Object.fromEntries(
    [...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2]]),
  );
}

describe("the interface's type scale", () => {
  it("Medium matches the design boards: 34 / 17 / 15 / 14 / 12", () => {
    const medium = preset(":root {");
    expect(medium["--text-large-title"]).toBe("34px");
    expect(medium["--text-title"]).toBe("17px");
    expect(medium["--text-body"]).toBe("15px");
    expect(medium["--text-list"]).toBe("14px");
    expect(medium["--text-caption"]).toBe("12px");
  });

  it("Small and Large keep one step down and up on the same roles", () => {
    const small = preset(':root[data-ui-size="small"]');
    expect(small["--text-large-title"]).toBe("28px");
    expect(small["--text-title"]).toBe("16px");
    expect(small["--text-body"]).toBe("14px");
    expect(small["--text-list"]).toBe("13px");
    expect(small["--text-caption"]).toBe("11px");
    const large = preset(':root[data-ui-size="large"]');
    expect(large["--text-large-title"]).toBe("40px");
    expect(large["--text-title"]).toBe("20px");
    expect(large["--text-body"]).toBe("17px");
    expect(large["--text-list"]).toBe("15px");
    expect(large["--text-caption"]).toBe("13px");
  });

});

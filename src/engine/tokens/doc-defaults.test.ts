import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DOC_DEFAULTS } from "./doc-defaults";
import { contrast } from "./palette";

const css = readFileSync(new URL("./base.css", import.meta.url), "utf8");

/** The value of `--doc-<name>` in the first block after `marker`. */
function declared(marker: string, name: string): string | undefined {
  const from = css.indexOf(marker);
  return new RegExp(`--doc-${name}:\\s*([^;]+);`).exec(css.slice(from))?.[1];
}

describe("DOC_DEFAULTS", () => {
  it("are base.css's document colours, light and dark", () => {
    for (const [name, value] of Object.entries(DOC_DEFAULTS.light))
      expect(declared("--doc-bg:", name), name).toBe(value);
    for (const [name, value] of Object.entries(DOC_DEFAULTS.dark))
      expect(declared("@media (prefers-color-scheme: dark)", name), name).toBe(
        value,
      );
  });
});

/** A colour's red and blue channels: more red than blue reads warm. */
const rgb = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ];

describe("the default look", () => {
  const warm = (hex: string) => rgb(hex)[0] > rgb(hex)[2];

  it("is paper and ink: a warm page, warm words and a warm accent", () => {
    for (const [name, value] of Object.entries(DOC_DEFAULTS.light))
      expect(warm(value), name).toBe(true);
    for (const [name, value] of Object.entries(DOC_DEFAULTS.dark))
      expect(warm(value), name).toBe(true);
  });

  it("keeps a link in the accent readable on the page", () => {
    expect(
      contrast(rgb(DOC_DEFAULTS.light.accent), rgb(DOC_DEFAULTS.light.bg)),
    ).toBeGreaterThanOrEqual(4.5);
  });
});

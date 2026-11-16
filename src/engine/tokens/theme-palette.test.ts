import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DOC_DEFAULTS } from "./doc-defaults";

/**
 * The base palette's contract (the design boards' paper and ink are the
 * target, so the default theme takes their base colours): warm paper
 * #fbf8f2, its ink #241f19, one ember accent #b0531f. Dark keeps its own
 * night sheet.
 */
const boards = {
  bg: "#fbf8f2",
  text: "#241f19",
  accent: "#b0531f",
} as const;

const baseCss = readFileSync(new URL("./base.css", import.meta.url), "utf8");
const themesCss = readFileSync(
  new URL("../../theme/content-themes.css", import.meta.url),
  "utf8",
);

describe("the default theme's base colours", () => {
  it("are the design boards' paper, ink and ember", () => {
    expect(DOC_DEFAULTS.light.bg).toBe(boards.bg);
    expect(DOC_DEFAULTS.light.text).toBe(boards.text);
    expect(DOC_DEFAULTS.light.accent).toBe(boards.accent);
  });

  it("base.css declares them on the root", () => {
    const root = baseCss.slice(baseCss.indexOf(":root {"));
    for (const [name, value] of Object.entries(boards))
      expect(
        new RegExp(`--doc-${name}:\\s*${value};`).test(root),
        `--doc-${name}`,
      ).toBe(true);
  });

  it("the paper content theme mirrors them", () => {
    const paper = themesCss.slice(themesCss.indexOf('[data-content-theme="paper"]'));
    for (const [name, value] of Object.entries(boards))
      expect(
        new RegExp(`--doc-${name}:\\s*${value};`).test(paper),
        `--doc-${name}`,
      ).toBe(true);
  });
});

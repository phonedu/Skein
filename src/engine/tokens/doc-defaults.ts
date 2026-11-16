/**
 * The document's default colours (base.css's --doc-*), for code that draws
 * where no stylesheet reaches - an exported chart, a theme preview frame -
 * as the fallback of `var(--doc-…, value)`. doc-defaults.test.ts holds them
 * to base.css.
 */
export const DOC_DEFAULTS = {
  light: {
    bg: "#fbf8f2",
    text: "#241f19",
    muted: "#5f574b",
    accent: "#b0531f",
    border: "#e4ddcf",
  },
  dark: {
    bg: "#1f1b16",
    text: "#e8ddc9",
    muted: "#9c8f77",
    accent: "#d98b52",
    border: "#3a3226",
  },
} as const;

type DocColour = keyof (typeof DOC_DEFAULTS)["light"];

/** `var(--doc-<name>)` with its default for `dark` or light behind it. */
export function docVar(name: DocColour, dark = false): string {
  return `var(--doc-${name}, ${DOC_DEFAULTS[dark ? "dark" : "light"][name]})`;
}

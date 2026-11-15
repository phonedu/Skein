/**
 * The document's default colours (base.css's --doc-*), for code that draws
 * where no stylesheet reaches - an exported chart, a theme preview frame -
 * as the fallback of `var(--doc-…, value)`. doc-defaults.test.ts holds them
 * to base.css.
 */
export const DOC_DEFAULTS = {
  light: {
    bg: "#faf6ee",
    text: "#2b2620",
    muted: "#706758",
    accent: "#9a5628",
    border: "#e4dcc8",
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

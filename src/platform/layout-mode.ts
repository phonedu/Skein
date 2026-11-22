import { isMobileApp } from "./capabilities";

/** The mobile shells' widths (dp): below 600 the phone's single column,
 *  600–839 the folded phone's or a small tablet's, 840 and up the tablet's
 *  two columns (with the edge panel on demand). A desktop window keeps the
 *  desktop shell at any width: a narrow desktop is still a desktop. */
export type LayoutMode = "desktop" | "phone" | "compact" | "tablet";

const PHONE_MAX = 599;
const TABLET_MIN = 840;

/** Which shell the window takes now. The width is read the way the styles
 *  read it (a media query), so the shell and the CSS never disagree; a
 *  window without matchMedia falls back to its inner width. */
export function layoutMode(): LayoutMode {
  if (!isMobileApp) return "desktop";
  const atMost = (px: number) =>
    typeof window === "undefined"
      ? null
      : (window.matchMedia?.(`(max-width: ${px}px)`)?.matches ?? null);
  const phone = atMost(PHONE_MAX);
  if (phone !== null) {
    if (phone) return "phone";
    const wide =
      typeof window === "undefined"
        ? null
        : (window.matchMedia?.(`(min-width: ${TABLET_MIN}px)`)?.matches ??
          null);
    return wide === false ? "compact" : "tablet";
  }
  const width = typeof window === "undefined" ? TABLET_MIN : window.innerWidth;
  if (width <= PHONE_MAX) return "phone";
  if (width < TABLET_MIN) return "compact";
  return "tablet";
}

export function isPhoneLayout(): boolean {
  return layoutMode() === "phone";
}

export function isCompactLayout(): boolean {
  return layoutMode() === "compact";
}

export function isTabletLayout(): boolean {
  return layoutMode() === "tablet";
}

/** Calls `changed` as the window crosses one of the modes' widths
 *  (rotation, split screen, a foldable opened); returns the stop. */
export function onLayoutMode(changed: () => void): () => void {
  const queries = [
    `(max-width: ${PHONE_MAX}px)`,
    `(min-width: ${PHONE_MAX + 1}px) and (max-width: ${TABLET_MIN - 1}px)`,
    `(min-width: ${TABLET_MIN}px)`,
  ];
  const media = queries
    .map((query) => window.matchMedia?.(query))
    .filter((mq): mq is MediaQueryList => !!mq);
  for (const mq of media) mq.addEventListener("change", changed);
  return () => {
    for (const mq of media) mq.removeEventListener("change", changed);
  };
}

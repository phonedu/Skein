import { isPhoneLayout as phoneLayout, onLayoutMode } from "./layout-mode";

/**
 * Whether the phone's layout is in use now. Never on a desktop: a narrow
 * desktop window is still a desktop. 600–839 is the folded phone's or a
 * small tablet's shell (the desktop's columns at a narrower width); 840 and
 * up is the tablet's. See layout-mode.ts.
 */
export function isPhoneLayout(): boolean {
  return phoneLayout();
}

/** Calls `changed` as the screen crosses one of the shells' widths
 *  (rotation, split screen, a foldable opened); returns the stop. */
export function onPhoneLayout(changed: () => void): () => void {
  return onLayoutMode(changed);
}

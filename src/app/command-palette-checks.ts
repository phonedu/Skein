import type { MenuChecks } from "../registry/menu/app-menu-model";

/** The window's on/off states as its menu has them (the sidebar, the
 *  document's mode, the format bar), for the command palette's check marks.
 *  A module of its own: the window sets it on every change, while the
 *  palette itself loads at the first press. */
let checks: MenuChecks = {};

export function setPaletteChecks(next: MenuChecks): void {
  checks = next;
}

export function paletteChecks(): MenuChecks {
  return checks;
}

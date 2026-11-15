import type { SearchEntry } from "./settings-search";

/**
 * Settings on the desktop: one dialog floating over the window (the board
 * ui-d-settings), opened from ⌘, the rail's gear or the app menu. A page
 * picked in its list shows in its content column; a plugin's page shows
 * there too. This is what ties the two: the dialog's state, and a request
 * to open it at a page (a search result in the sidebar, a plugin's card).
 */
/** The prefix a plugin's page carries in the dialog's page id. */
export const PLUGIN_PAGE_PREFIX = "plugin:";

export function pluginPageId(id: string): string {
  return PLUGIN_PAGE_PREFIX + id;
}

export interface SettingsDialogOpen {
  page: string;
  /** A row to go to there - a search result's. */
  jump?: SearchEntry;
  /** Counts requests: one made while the dialog is open goes to its page
   *  from wherever it was. */
  request: number;
}

let dialog: SettingsDialogOpen | null = null;
let requests = 0;
const listeners = new Set<() => void>();

export function settingsDialogOpen(): SettingsDialogOpen | null {
  return dialog;
}

export function showSettingsDialog(page = "general", jump?: SearchEntry): void {
  dialog = { page, jump, request: ++requests };
  for (const listener of listeners) listener();
}

export function closeSettingsDialog(): void {
  if (!dialog) return;
  dialog = null;
  for (const listener of listeners) listener();
}

export function onSettingsDialogChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Asks the window to show Settings at `page`, at a search result's row. */
export const OPEN_SETTINGS_PAGE_EVENT = "textus:open-settings-page";

export interface SettingsPageRequest {
  page: string;
  jump?: SearchEntry;
}

export function openSettingsPage(page: string, jump?: SearchEntry): void {
  window.dispatchEvent(
    new CustomEvent<SettingsPageRequest>(OPEN_SETTINGS_PAGE_EVENT, {
      detail: { page, jump },
    }),
  );
}

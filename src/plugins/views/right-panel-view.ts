import { createSubscribers } from "../../utils/store";

/**
 * The plugin page the H0 shell's right column shows (an asset list, a
 * confirm center). One at a time, as the column is one: asking for another
 * replaces it, and the request count says a fresh ask came even when it is
 * the same page again - a closed column opens.
 */
export interface RightPanelView {
  plugin: string;
  view: string;
  kind: "list" | "view" | "web";
  title: string;
  resource?: string;
  state?: unknown;
}

export interface RightPanelRequest {
  view: RightPanelView | null;
  /** Moves on with every ask. */
  request: number;
}

let now: RightPanelRequest = { view: null, request: 0 };
const subscribers = createSubscribers();

export const subscribeRightPanelView = subscribers.subscribe;

export function rightPanelRequest(): RightPanelRequest {
  return now;
}

/** Show a plugin page in the right column (the shell decides whether that
 *  column exists; a phone and a fold open the page full-screen instead). */
export function openRightPanelView(view: RightPanelView): void {
  now = { view, request: now.request + 1 };
  subscribers.publish();
}

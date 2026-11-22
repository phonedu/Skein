import { createSubscribers } from "../../utils/store";
/**
 * A request for Settings › Extensions › Create from anywhere in the window -
 * a plugin's "Edit with AI", a reply card's "Fix with AI". Create works in
 * its tab, not in the document's AI panel: an open tab takes the request
 * itself, so its conversation carries on; otherwise Settings opens there and
 * the tab takes it as it mounts.
 */

/** What Create makes; each is the name of the built-in skill that makes it. */
export type CreateKind = "plugin" | "theme" | "skill";

interface CreateRequest {
  text: string;
  kind: CreateKind;
}

/** Asks the window to open Settings at Extensions › Create. */
const createAsks = createSubscribers();
export const onCreateAsked = createAsks.subscribe;

let pending: CreateRequest | null = null;
const subscribers = createSubscribers();

export function requestCreate(
  text: string,
  kind: CreateKind = "plugin",
  target: "auto" | "settings" = "auto",
): void {
  pending = { text, kind };
  // A button on the Settings page keeps the request for the page's own
  // Create, even when a Create tab is open behind the dialog.
  if (target === "settings") {
    createAsks.publish();
    return;
  }
  subscribers.publish();
  // No tab open took it.
  if (pending) createAsks.publish();
}

/** The request waiting, once: whoever takes it handles it. */
export function takeCreateRequest(): CreateRequest | null {
  const request = pending;
  pending = null;
  return request;
}

/** For the open Create tab: `take` runs on each request. */
export const onCreateRequest = subscribers.subscribe;

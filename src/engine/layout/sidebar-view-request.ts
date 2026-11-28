import { createSubscribers } from "../../utils/store";

/**
 * Which of the left column's views to show, asked for from outside React:
 * the top bar's plugin button opens the column on Plugins instead of a
 * second panel of its own. The request count moves on with every ask, so
 * asking for the view already showing still brings the column back.
 */
export type RequestedSidebarView = "today" | "files" | "plugins";

export interface SidebarViewRequest {
  view: RequestedSidebarView | null;
  /** Moves on with every ask. */
  request: number;
}

let now: SidebarViewRequest = { view: null, request: 0 };
const subscribers = createSubscribers();

export const subscribeSidebarViewRequest = subscribers.subscribe;

export function sidebarViewRequest(): SidebarViewRequest {
  return now;
}

/** Show one of the column's views; the column opens with it. */
export function openSidebarView(view: RequestedSidebarView): void {
  now = { view, request: now.request + 1 };
  subscribers.publish();
}

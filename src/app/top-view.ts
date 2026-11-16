/** The window's top view (the notes board's rail): Today, the notes
 *  workspace, Assets. "notes" is the classic whole: the islands with their
 *  sidebar; the other two stand alone over the main pane. */
export type TopView = "today" | "notes" | "assets";

export const TOP_VIEW_IDS: readonly TopView[] = ["today", "notes", "assets"];

import type { DocTab } from "../../document/doc-tabs";

/** Whether a document's editor stays mounted though it is out of sight.
 *  One in front of an island keeps it; and a phone's AI page stands where
 *  the document was, but the AI reads the document in front, so that one
 *  stays behind the AI page too. An edited untitled draft has no file to
 *  come back from with its undo; a blank one or a guide does. */
export function keepsEditorLoaded(
  tab: DocTab,
  {
    activeTabId,
    inFront,
    pane,
    aiInFront,
  }: {
    /** The window's tab in use. */
    activeTabId: string;
    /** The window's document in front (documentInFront): the active tab's
     *  when it is a document, else the document last read. */
    inFront: string;
    /** The tab is a pane's front in a split. */
    pane: boolean;
    /** A phone's AI page is in front of its one island. */
    aiInFront: boolean;
  },
): boolean {
  return (
    tab.id === activeTabId ||
    pane ||
    (aiInFront && tab.id === inFront) ||
    (!tab.path && tab.content !== tab.savedContent)
  );
}

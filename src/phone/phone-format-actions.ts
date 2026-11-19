import { focusTabEditor } from "../editor/tab-editor";
import { tabElement } from "../engine/layout/tab-element";
import type { Button } from "../app/format-buttons";
import { sendAppEvent } from "../utils/events";

/** The document takes the keys first, at the selection it kept. A toolbar
 *  press is explicit, so it also brings the keyboard back where the tab's
 *  own focus keeps quiet with the keyboard down (takeKeys). */
export function focusDocument(tabId: string) {
  const editor = tabElement(tabId)?.querySelector<HTMLElement>(
    ".ProseMirror, .cm-content",
  );
  if (!editor || editor.contains(document.activeElement)) return;
  focusTabEditor(tabId);
  // takeKeys leaves a phone's editor alone while its keyboard is down; the
  // insert panel closing is the user asking for it.
  if (!editor.contains(document.activeElement)) editor.focus();
}

export function press(tabId: string, b: Button) {
  focusDocument(tabId);
  sendAppEvent(b.event, b.detail);
}

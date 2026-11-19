import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Strings } from "../i18n/strings";
import {
  BoldIcon,
  HighlightIcon,
  InlineCodeIcon,
  ItalicIcon,
  LinkIcon,
  StrikeIcon,
} from "../engine/controls/icons";
import { tabElement } from "../engine/layout/tab-element";
import {
  CLEAR_FORMAT_EVENT,
  INSERT_LINK_EVENT,
  TOGGLE_MARK_EVENT,
  sendAppEvent,
} from "../utils/events";
import { focusDocument } from "./phone-format-actions";
import type { ReactNode } from "react";

type Anchor = { top: number; left: number; below: boolean };

/** Where the selection is, in viewport coordinates, while the keyboard is
 *  up and the selection is in this document. */
function useSelectionAnchor(tabId: string, enabled: boolean): Anchor | null {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  useEffect(() => {
    if (!enabled) {
      setAnchor(null);
      return;
    }
    let frame = 0;
    const read = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!document.documentElement.classList.contains("keyboard-up")) {
          setAnchor(null);
          return;
        }
        const root = tabElement(tabId);
        const selection = window.getSelection();
        if (!root || !selection || selection.rangeCount === 0) {
          setAnchor(null);
          return;
        }
        if (selection.isCollapsed) {
          setAnchor(null);
          return;
        }
        const range = selection.getRangeAt(0);
        if (!root.contains(range.commonAncestorContainer)) {
          setAnchor(null);
          return;
        }
        const box = range.getBoundingClientRect();
        if (!box.width && !box.height) {
          setAnchor(null);
          return;
        }
        // The bar is seven 40px keys wide: half of it keeps both ends on
        // the screen, even for a selection at the page's edge.
        const half = 156;
        const left = Math.min(
          Math.max(box.left + box.width / 2, half),
          Math.max(window.innerWidth - half, half),
        );
        // Android's own selection menu sits above the selection; ours sits
        // just below it, past the selection handles (36 is enough for them),
        // and above only near the bottom where there is no room below.
        const gap = 36;
        const below = box.bottom + gap + 56 < window.innerHeight - 60;
        setAnchor({
          top: below ? box.bottom + gap : box.top,
          left,
          below,
        });
      });
    };
    read();
    document.addEventListener("selectionchange", read);
    window.addEventListener("scroll", read, true);
    window.addEventListener("resize", read);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("selectionchange", read);
      window.removeEventListener("scroll", read, true);
      window.removeEventListener("resize", read);
    };
  }, [tabId, enabled]);
  return anchor;
}

/** Inline formats on a selection: bold, italic, strike, highlight, code,
 *  link, and clearing them. Everything sends the editor's menu events. */
export function PhoneSelectionBar({
  t,
  tabId,
  enabled,
}: {
  t: Strings;
  tabId: string;
  enabled: boolean;
}) {
  const anchor = useSelectionAnchor(tabId, enabled);
  if (!anchor) return null;
  const mark = (detail: string) => {
    focusDocument(tabId);
    sendAppEvent(TOGGLE_MARK_EVENT, detail);
  };
  const keys: { label: string; icon: ReactNode; run: () => void }[] = [
    { label: t.toolbarBold, icon: <BoldIcon />, run: () => mark("bold") },
    { label: t.toolbarItalic, icon: <ItalicIcon />, run: () => mark("italic") },
    {
      label: t.menuStrikethrough,
      icon: <StrikeIcon />,
      run: () => mark("strikethrough"),
    },
    {
      label: t.toolbarHighlight,
      icon: <HighlightIcon />,
      run: () => mark("highlight"),
    },
    {
      label: t.menuInlineCode,
      icon: <InlineCodeIcon />,
      run: () => mark("code"),
    },
    {
      label: t.menuInsertLink,
      icon: <LinkIcon />,
      run: () => {
        focusDocument(tabId);
        sendAppEvent(INSERT_LINK_EVENT);
      },
    },
    {
      label: t.menuClearFormatting,
      icon: <span className="pf-clear">Tx</span>,
      run: () => {
        focusDocument(tabId);
        sendAppEvent(CLEAR_FORMAT_EVENT);
      },
    },
  ];
  return createPortal(
    <div
      className="pf-selection"
      data-below={anchor.below ? "" : undefined}
      style={{ top: anchor.top, left: anchor.left }}
      role="toolbar"
      aria-label={t.toolbarLabel}
      onMouseDown={(e) => e.preventDefault()}
    >
      {keys.map(({ label, icon, run }) => (
        <button
          key={label}
          type="button"
          className="pf-sel-key"
          aria-label={label}
          onClick={run}
        >
          {icon}
        </button>
      ))}
    </div>,
    document.body,
  );
}

// The document page's top row on the phone: back to the library home, the
// document's name, Textus AI, and ⋯ for the document's action sheet. The
// phone has no tab strip - the library is the navigation - so what the
// desktop puts in a right-click menu lives in this sheet.
import { useMemo, useState } from "react";
import type { Strings } from "../i18n/strings";
import { TextusAiButton } from "../ai/TextusAiSwitch";
import {
  ActionSheet,
  type ActionSheetItem,
} from "../engine/controls/ActionSheet";
import { Presence } from "../engine/motion/usePresence";
import { showNotice } from "../engine/controls/notices";
import { TOGGLE_FIND_REPLACE_EVENT } from "../utils/events";
import {
  OutlineActionIcon,
  FindActionIcon,
  SourceActionIcon,
  ShareActionIcon,
} from "./PhoneEditorBarIcons";
import { emitToThisWindow } from "../platform/menu-events";
import { nativeFiles } from "../platform/native-files";
import { parseHeadings } from "../files/outline-parse";
import { currentHeading } from "../files/outline-current";
import { plainInline } from "../utils/markdown-plain";
import { noteJump } from "../editor/nav-history";
import { setTabJump } from "../editor/tab-jump";
import "./PhoneEditorBar.css";

export function PhoneEditorBar({
  t,
  title,
  sub,
  path,
  content,
  tabId,
  showAgent,
  agentOpen,
  agentShortcut,
  onBack,
  onToggleAgent,
}: {
  t: Strings;
  title: string;
  /** Where the document lives in its library ("交付"), when not at the
   *  root: the board keeps the name and its folder on two lines. */
  sub?: string | null;
  /** The document on disk; Share is offered once it has one. */
  path?: string | null;
  /** Its text, for the outline (the document page's own copy). */
  content: string;
  /** The tab whose editor the outline scrolls. */
  tabId: string;
  /** The AI panel can be opened: chat is on, or the tour needs it. */
  showAgent: boolean;
  agentOpen: boolean;
  agentShortcut: string;
  onBack: () => void;
  onToggleAgent: () => void;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [outlineOpen, setOutlineOpen] = useState(false);

  // The outline is read when it is opened, not on every keystroke.
  const outline = useMemo(
    () =>
      outlineOpen
        ? parseHeadings(content)
            .map((heading, index) => ({ heading, index }))
            .filter(({ heading }) => heading.text.trim())
        : [],
    [outlineOpen, content],
  );
  const at = useMemo(
    () => (outlineOpen ? currentHeading(tabId) : -1),
    [outlineOpen, tabId],
  );

  const openOutline = () => {
    if (!parseHeadings(content).some((heading) => heading.text.trim()))
      return showNotice(t.outlineEmpty);
    setOutlineOpen(true);
  };

  const items: (ActionSheetItem | "separator")[] = [
    {
      label: t.phoneDocActionOutline,
      Icon: OutlineActionIcon,
      onSelect: openOutline,
    },
    {
      label: t.phoneDocActionFind,
      Icon: FindActionIcon,
      onSelect: () =>
        window.dispatchEvent(new CustomEvent(TOGGLE_FIND_REPLACE_EVENT)),
    },
    {
      label: t.menuToggleSourceMode,
      Icon: SourceActionIcon,
      onSelect: () => emitToThisWindow("menu-toggle-source-mode"),
    },
    {
      label: t.phoneDocActionShare,
      Icon: ShareActionIcon,
      // A document that has not been saved has nothing to hand on.
      disabled: !path,
      onSelect: () => {
        if (path) void nativeFiles.share(path).catch(() => {});
      },
    },
  ];

  const outlineItems: (ActionSheetItem | "separator")[] = outline.map(
    ({ heading, index }) => ({
      label: plainInline(heading.text),
      depth: heading.level,
      current: index === at,
      onSelect: () => {
        // The editor scrolls there as every jump does (revealPosition).
        noteJump();
        setTabJump(tabId, { kind: "outline", index }, true);
      },
    }),
  );

  return (
    <>
      <div className="phone-editor-bar">
        <button
          type="button"
          className="pe-ic"
          aria-label={t.phoneBackToLibrary}
          onClick={onBack}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className={`pe-title${sub ? " pe-title-sub" : ""}`}>
          <span className="pe-name">{title}</span>
          {sub && <span className="pe-path">{sub}</span>}
        </div>
        <TextusAiButton
          className="pe-ic pe-ai"
          panelOpen={agentOpen}
          showPanel={showAgent}
          shortcut={agentShortcut}
          onTogglePanel={onToggleAgent}
        />
        <button
          type="button"
          className="pe-ic pe-more"
          aria-label={t.phoneMoreActions}
          aria-haspopup="menu"
          aria-expanded={sheetOpen}
          onClick={() => setSheetOpen(true)}
        >
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            stroke="none"
            aria-hidden
          >
            <circle cx="5" cy="12" r="1.7" />
            <circle cx="12" cy="12" r="1.7" />
            <circle cx="19" cy="12" r="1.7" />
          </svg>
        </button>
      </div>
      <Presence show={sheetOpen}>
        {sheetOpen && (
          <ActionSheet
            head={title}
            items={items}
            onClose={() => setSheetOpen(false)}
          />
        )}
      </Presence>
      <Presence show={outlineOpen}>
        {outlineOpen && (
          <ActionSheet
            title={t.phoneDocActionOutline}
            items={outlineItems}
            onClose={() => setOutlineOpen(false)}
          />
        )}
      </Presence>
    </>
  );
}

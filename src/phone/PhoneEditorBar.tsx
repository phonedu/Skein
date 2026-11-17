// The document page's top row on the phone: back to the library home, the
// document's name, Textus AI, and ⋯ for the document's action sheet. The
// phone has no tab strip - the library is the navigation - so what the
// desktop puts in a right-click menu lives in this sheet.
import { useState } from "react";
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
  ShareActionIcon,
  InboxActionIcon,
} from "./PhoneEditorBarIcons";
import "./PhoneEditorBar.css";

export function PhoneEditorBar({
  t,
  title,
  showAgent,
  agentOpen,
  agentShortcut,
  onBack,
  onToggleAgent,
}: {
  t: Strings;
  title: string;
  /** The AI panel can be opened: chat is on, or the tour needs it. */
  showAgent: boolean;
  agentOpen: boolean;
  agentShortcut: string;
  onBack: () => void;
  onToggleAgent: () => void;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);

  const items: (ActionSheetItem | "separator")[] = [
    {
      label: t.phoneDocActionOutline,
      Icon: OutlineActionIcon,
      onSelect: () => showNotice(t.phoneComingSoon),
    },
    {
      label: t.phoneDocActionFind,
      Icon: FindActionIcon,
      onSelect: () =>
        window.dispatchEvent(new CustomEvent(TOGGLE_FIND_REPLACE_EVENT)),
    },
    {
      label: t.phoneDocActionShare,
      Icon: ShareActionIcon,
      onSelect: () => showNotice(t.phoneComingSoon),
    },
    "separator",
    {
      label: t.phoneDocActionInbox,
      Icon: InboxActionIcon,
      fire: true,
      onSelect: () => showNotice(t.phoneComingSoon),
    },
  ];

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
        <div className="pe-title">{title}</div>
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
    </>
  );
}

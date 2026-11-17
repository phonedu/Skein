// The document page's top row on the phone: back to the library home, the
// document's name, and Textus AI. The phone has no tab strip - the library
// is the navigation - and the document actions sheet arrives in a later
// slice.
import type { Strings } from "../i18n/strings";
import { TextusAiButton } from "../ai/TextusAiSwitch";
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
  return (
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
    </div>
  );
}

import type { Strings } from "../i18n/strings";
import { usePresenceProps } from "../engine/motion/usePresence";
import { showNotice } from "../engine/controls/notices";
import {
  INSERT_BLOCK_EVENT,
  INSERT_LINK_EVENT,
  INSERT_MARKDOWN_EVENT,
  sendAppEvent,
} from "../utils/events";
import { copyToImageFolder, pickImageFile } from "../editor/images/image-store";
import { useSettings } from "../prefs/SettingsContext";
import { focusDocument } from "./phone-format-actions";

/** The nine keys of the insert panel, three columns by three rows. */
const INSERT_KEYS = [
  { id: "code-block", label: (t: Strings) => t.menuCodeBlock },
  { id: "table", label: (t: Strings) => t.menuTable },
  { id: "blockquote", label: (t: Strings) => t.menuBlockquote },
  { id: "callout", label: (t: Strings) => t.blockCallout },
  { id: "math-block", label: (t: Strings) => t.menuMathBlock },
  { id: "task-list", label: (t: Strings) => t.menuTaskList },
  { id: "rule", label: (t: Strings) => t.menuDivider },
  { id: "image", label: (t: Strings) => t.missingImageFilter },
  { id: "link", label: (t: Strings) => t.menuInsertLink },
] as const;

async function insertPicture(
  t: Strings,
  tabId: string,
  docPath: string | null,
  settings: ReturnType<typeof useSettings>["settings"],
) {
  try {
    const path = await pickImageFile(settings.language);
    if (!path) return;
    const stored = await copyToImageFolder(path, {
      docPath: () => docPath,
      settings: () => settings,
    });
    if (!stored) return;
    focusDocument(tabId);
    sendAppEvent(INSERT_MARKDOWN_EVENT, stored.embed ?? `![](${stored.src})`);
  } catch {
    void showNotice(t.imagePasteFailedMessage);
  }
}

function pickInsert(
  t: Strings,
  tabId: string,
  id: string,
  docPath: string | null,
  settings: ReturnType<typeof useSettings>["settings"],
) {
  if (id === "image") return void insertPicture(t, tabId, docPath, settings);
  if (id === "link") {
    focusDocument(tabId);
    return sendAppEvent(INSERT_LINK_EVENT);
  }
  focusDocument(tabId);
  sendAppEvent(INSERT_BLOCK_EVENT, id);
}

/** The nine insert keys, three columns by three rows, in the keyboard's place.
 *  It is chrome, not a sheet: no scrim, no grab handle, no cancel button -
 *  a key inserts, the + key closes it, or a tap on the page does. */
export function PhoneInsertPanel({
  t,
  tabId,
  docPath,
  height,
  onClose,
}: {
  t: Strings;
  tabId: string;
  docPath: string | null;
  /** The keyboard's height when it opened; 0 lets the stylesheet fall back. */
  height: number;
  onClose: () => void;
}) {
  const { settings } = useSettings();
  const presence = usePresenceProps<HTMLDivElement>();
  const pick = (id: string) => {
    onClose();
    pickInsert(t, tabId, id, docPath, settings);
  };
  return (
    <div
      {...presence}
      className="pf-insert-sheet"
      role="dialog"
      aria-label={t.menuInsertGroup}
      style={height > 0 ? { height } : undefined}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="pf-insert-grid">
        {INSERT_KEYS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className="pf-insert-key"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => pick(id)}
          >
            {label(t)}
          </button>
        ))}
      </div>
    </div>
  );
}

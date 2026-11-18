import type { ComponentType, ReactNode } from "react";
import { useSettings } from "../../prefs/SettingsContext";
import { CheckIcon } from "./icons";
import { Sheet } from "./Sheet";
import "./ActionSheet.css";

export interface ActionSheetItem {
  label: string;
  onSelect: () => void;
  /** A destructive action: red text and icon. */
  danger?: boolean;
  /** The one strong action (the Skein "fire" colour): "Send to inbox". */
  fire?: boolean;
  /** A small line under the label, when a row needs context. */
  sub?: string;
  /** A ✓ mark at the end of the row: the current choice. */
  current?: boolean;
  /** Icon drawn in a rounded square on the leading edge. */
  Icon?: ComponentType<{ className?: string }>;
  /** One choice of several: a check beside the one in force. */
  checked?: boolean;
  /** Shown but not offered now. */
  disabled?: boolean;
  /** A row deeper in a hierarchy (an outline's heading, 1 being the top):
   *  its name is indented by the level. */
  depth?: number;
}

/**
 * The phone's bottom sheet of actions. Beyond the plain menu it carries:
 *   - a grab handle, as Material and iOS sheets do;
 *   - an optional context head (file name · word count · path);
 *   - rows with an optional icon capsule, sub label, "current" tick, and
 *     danger/fire colouring, as the Skein mockup shows.
 *
 * ContextMenu renders this on a phone, so every menu built from items gets
 * this as its phone form. A tap outside or on Cancel closes the sheet; a
 * row runs its action and closes.
 */
export function ActionSheet({
  title,
  head,
  items,
  onClose,
}: {
  /** Heading above the first row (small, muted). */
  title?: string;
  /** A rich head shown above the rows: text or a React node. */
  head?: ReactNode;
  items: (ActionSheetItem | "separator")[];
  onClose: () => void;
}) {
  const { t } = useSettings();
  const groups: ActionSheetItem[][] = [[]];
  for (const item of items) {
    if (item === "separator") groups.push([]);
    else groups[groups.length - 1].push(item);
  }

  return (
    <Sheet role="menu" label={title} className="action-sheet" onClose={onClose}>
      <div className="action-sheet-grab" aria-hidden />
      <div className="action-sheet-group">
        {head ? (
          <div className="action-sheet-head">{head}</div>
        ) : title ? (
          <div className="action-sheet-title">{title}</div>
        ) : null}
        {groups
          .filter((group) => group.length > 0)
          .map((group, g) => (
            <div key={g} className="action-sheet-section">
              {group.map((item, i) => (
                <button
                  key={i}
                  type="button"
                  role={
                    item.checked === undefined ? "menuitem" : "menuitemradio"
                  }
                  aria-checked={item.checked}
                  // The one in force in view, however long the list.
                  ref={
                    item.checked
                      ? (el) => el?.scrollIntoView?.({ block: "nearest" })
                      : undefined
                  }
                  disabled={item.disabled}
                  data-depth={item.depth}
                  className={rowClass(item)}
                  onClick={() => {
                    onClose();
                    item.onSelect();
                  }}
                >
                  {item.Icon ? (
                    <span className="action-sheet-ic" aria-hidden>
                      <item.Icon />
                    </span>
                  ) : null}
                  <span className="action-sheet-text">
                    <span className="action-sheet-label">{item.label}</span>
                    {item.sub ? (
                      <span className="action-sheet-sub">{item.sub}</span>
                    ) : null}
                  </span>
                  {item.current ? (
                    <span className="action-sheet-check" aria-hidden>
                      ✓
                    </span>
                  ) : item.checked ? (
                    <CheckIcon className="action-sheet-check" aria-hidden />
                  ) : null}
                </button>
              ))}
            </div>
          ))}
      </div>
      <button
        type="button"
        className="action-sheet-item action-sheet-cancel"
        onClick={onClose}
      >
        {t.cancel}
      </button>
    </Sheet>
  );
}

function rowClass(item: ActionSheetItem): string {
  const parts = ["action-sheet-item"];
  if (item.danger) parts.push("action-sheet-item-danger");
  if (item.fire) parts.push("action-sheet-item-fire");
  if (item.current) parts.push("action-sheet-item-current");
  return parts.join(" ");
}

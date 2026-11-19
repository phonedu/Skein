import { focusTabEditor } from "../editor/tab-editor";
import { tabElement } from "../engine/layout/tab-element";
import { useRef } from "react";
import type { Strings } from "../i18n/strings";
import type { CaretBlock } from "../editor/caret-block";
import { IconButton } from "../engine/controls/IconButton";
import { useFitItems } from "../engine/controls/fit-steps";
import { useMenuButton } from "../engine/controls/useMenuButton";
import { usePhoneLayout } from "../engine/controls/usePhoneLayout";
import type {
  ContextMenuEntry,
  ContextMenuItem,
} from "../engine/controls/ContextMenu";
import { fill } from "../i18n/fill";
import { MoreIcon } from "../engine/controls/icons";
import { formatCombo } from "../utils/shortcuts";
import { INSERT_BLOCK_EVENT, sendAppEvent } from "../utils/events";
import { GROUPS, type Button } from "./format-buttons";
import { useCaretBlock } from "./use-caret-block";
import { lazyComponent } from "../lazy/lazy-component";
import { lazyModule } from "../lazy/lazy-module";
import type { FormatBarSide } from "../prefs/settings-values";
import "./format-bar.css";

// The phone's bar pulls in its sheets, picture picker and selection bar;
// keep it out of the startup chunk, which a desktop never needs.
const phoneFormatBar = lazyModule(
  "phone-format-bar",
  () => import("../phone/PhoneFormatBar"),
);
const PhoneFormatBar = lazyComponent(
  phoneFormatBar,
  (module) => module.PhoneFormatBar,
);

/**
 * The format bar (View › Format Bar): a row under the title bar with what the
 * Format menu does, for Markdown's own formats only. It sends the menu's
 * events, so the document on screen answers as it does to the menu, and
 * lights what is on at the caret.
 */
/** Every button, in the row's order: the ones folded into "⋯" go by it. */
const ALL: Button[] = GROUPS.flat();

/** The buttons `row` has folded away. */
function folded(row: HTMLElement | null): Button[] {
  if (!row) return [];
  return [
    ...row.querySelectorAll<HTMLElement>("[data-fit-hidden][data-fit-item]"),
  ].map((el) => ALL[Number(el.dataset.fitItem)]);
}

/** A button's press: its document first, then the menu's event. */
function press(tabId: string, b: Button) {
  focusDocument(tabId);
  sendAppEvent(b.event, b.detail);
}

/** The heading picker: body text or a level, as Format's items set them,
 *  the caret's own ticked. */
function headingItems(
  t: Strings,
  tabId: string,
  level: number,
): ("separator" | ContextMenuItem)[] {
  const pick = (detail: string) => () => {
    focusDocument(tabId);
    sendAppEvent(INSERT_BLOCK_EVENT, detail);
  };
  return [
    {
      label: t.shortcutParagraph,
      checked: level === 0,
      onSelect: pick("paragraph"),
    },
    "separator",
    ...[1, 2, 3, 4, 5, 6].map((n) => ({
      label: fill(t.menuHeadingTemplate, { n: String(n) }),
      checked: level === n,
      onSelect: pick(`h${n}`),
    })),
  ];
}

/** Another island's bar: its document takes the keys first, at the
 *  selection it kept, so the format lands there. */
function focusDocument(tabId: string) {
  const editor = tabElement(tabId)?.querySelector<HTMLElement>(".ProseMirror");
  if (editor && !editor.contains(document.activeElement)) focusTabEditor(tabId);
}

type FormatBarProps = {
  t: Strings;
  /** The document's edge it sits on; a phone's is always its foot. */
  side: FormatBarSide;
  /** The document it formats: a press brings it into use first (its
   *  island's pointerdown), so the menu's events reach it. */
  tabId: string;
  /** The document on disk, for the phone's picture picker. */
  docPath?: string | null;
};

export function FormatBar({ t, tabId, side, docPath = null }: FormatBarProps) {
  const block = useCaretBlock(tabId);
  const phone = usePhoneLayout();
  if (phone)
    return (
      <PhoneFormatBar t={t} tabId={tabId} docPath={docPath} block={block} />
    );
  return <DesktopFormatBar t={t} tabId={tabId} side={side} block={block} />;
}

function DesktopFormatBar({
  t,
  tabId,
  side,
  block,
}: {
  t: Strings;
  tabId: string;
  side: FormatBarSide;
  block: CaretBlock;
}) {
  // Narrower than its buttons, it keeps as many as fit and folds the rest,
  // from the end, into "⋯".
  const row = useRef<HTMLDivElement>(null);
  const column = side !== "top";
  useFitItems(row, ".format-bar-more", column);
  // Tooltips and menus open toward the page, clear of the next button.
  const toward = column ? (side === "left" ? "right" : "left") : undefined;
  const headings = () => headingItems(t, tabId, block.heading);
  const heading = useMenuButton(headings, {
    title: t.toolbarHeading,
    beside: toward,
  });
  const more = useMenuButton(
    () =>
      folded(row.current).map((b): ContextMenuEntry =>
        b.picksHeading
          ? { label: b.label(t), items: headings() }
          : { label: b.label(t), onSelect: () => press(tabId, b) },
      ),
    { alignEnd: true, beside: toward },
  );
  return (
    <div
      className="format-bar"
      role="toolbar"
      aria-label={t.toolbarLabel}
      aria-orientation={column ? "vertical" : undefined}
      data-side={column ? side : undefined}
      // A press leaves the caret where it was, in the document.
      onMouseDown={(e) => e.preventDefault()}
    >
      <div ref={row} className="format-bar-row">
        {GROUPS.map((group, g) => (
          <div key={g} className="format-bar-group">
            {group.map((b) => {
              const label = b.label(t);
              return (
                <span
                  key={label}
                  className="format-bar-item"
                  data-fit-item={ALL.indexOf(b)}
                >
                  <IconButton
                    label={label}
                    hint={b.keys ? `${label}  ${formatCombo(b.keys)}` : label}
                    hintSide={toward}
                    // A menu's button says it opens one, not that it is on.
                    pressed={b.on && !b.picksHeading ? b.on(block) : undefined}
                    onClick={b.picksHeading ? undefined : () => press(tabId, b)}
                    opens={b.picksHeading ? heading.button : undefined}
                  >
                    {b.Icon ? <b.Icon /> : b.text?.(t)}
                  </IconButton>
                </span>
              );
            })}
          </div>
        ))}
        <IconButton
          label={t.toolbarMore}
          hintSide={toward}
          className="tx-icon-button format-bar-more"
          opens={more.button}
        >
          <MoreIcon />
        </IconButton>
      </div>
      {heading.menu}
      {more.menu}
    </div>
  );
}

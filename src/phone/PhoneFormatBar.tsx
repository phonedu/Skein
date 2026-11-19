import { useEffect, useState, type CSSProperties } from "react";
import type { Strings } from "../i18n/strings";
import type { CaretBlock } from "../editor/caret-block";
import { IconButton } from "../engine/controls/IconButton";
import { Presence, PresenceDiv } from "../engine/motion/usePresence";
import {
  AssistantIcon,
  BulletListIcon,
  CheckIcon,
  HeadingIcon,
  NumberedListIcon,
  PlusIcon,
  UndoIcon,
} from "../engine/controls/icons";
import { fill } from "../i18n/fill";
import { AI_NAME } from "../i18n/names";
import {
  ILLUSTRATE_PARAGRAPH_EVENT,
  INSERT_BLOCK_EVENT,
  TOGGLE_BLOCK_EVENT,
  TRIGGER_COMPLETION_EVENT,
  TRIGGER_GRAMMAR_CHECK_EVENT,
  sendAppEvent,
} from "../utils/events";
import { aiFeatures } from "../prefs/ai-features";
import { useSettings } from "../prefs/SettingsContext";
import { useImageService } from "../ai/image-models";
import { keyboardCovered } from "../mobile/keyboard";
import { IMAGE, REDO, TABLE, UNDO } from "./phone-format-groups";
import { focusDocument, press } from "./phone-format-actions";
import {
  IndentActionIcon,
  OutdentActionIcon,
  TaskActionIcon,
} from "./PhoneEditorBarIcons";
import { PhoneInsertPanel } from "./PhoneInsertPanel";
import { PhoneSelectionBar } from "./PhoneSelectionBar";
import "./PhoneFormatBar.css";

/*
 * The phone's format bar (design: phone, typing; ruling 31): the writing
 * keys — insert, text, list, AI, undo, redo, done — with the text and list
 * choices in panels just above it, inline formats on a floating bar over a
 * selection, and a table's or an image's own keys replacing the main bar.
 * The panels are chrome, not dialogs: no scrim, no portal, and a tap never
 * takes the keyboard or the selection from the document. Everything sends
 * the editor's existing menu events; the editor schema is untouched.
 */

/** A press that keeps the document's focus, and so its keyboard. */
const keepFocus = (e: { preventDefault: () => void }) => e.preventDefault();

type Panel = "text" | "list" | "ai" | null;

/** The heading choice: body text or a level, the caret's own ticked. */
function headingChoices(t: Strings): {
  detail: string;
  label: string;
  name: string;
  level: number;
}[] {
  return [
    {
      detail: "paragraph",
      label: "T",
      name: t.shortcutParagraph,
      level: 0,
    },
    ...[1, 2, 3, 4, 5, 6].map((n) => ({
      detail: `h${n}`,
      label: `H${"₁₂₃₄₅₆"[n - 1]}`,
      name: fill(t.menuHeadingTemplate, { n: String(n) }),
      level: n,
    })),
  ];
}

export function PhoneFormatBar({
  t,
  tabId,
  docPath,
  block,
}: {
  t: Strings;
  tabId: string;
  docPath: string | null;
  block: CaretBlock;
}) {
  const [panel, setPanel] = useState<Panel>(null);
  const [insertOpen, setInsertOpen] = useState(false);
  // The keyboard's height when the insert panel opened: the panel takes its
  // place, and the main bar stays just above it as the keyboard goes.
  const [insertHeight, setInsertHeight] = useState(0);
  const context = block.image ? "image" : block.table ? "table" : null;
  const { settings } = useSettings();
  const ai = aiFeatures(settings);
  const imageService = useImageService(settings);
  // The same three actions the phone's AI sheet offers: a picture, a
  // continuation, a grammar check. No action, no key.
  const canIllustrate = ai.chat && imageService !== null;
  const canComplete = ai.completion;
  const canGrammar = ai.grammar;
  const showAi = canIllustrate || canComplete || canGrammar;

  // The bar is hidden while the keyboard is down (format-bar.css), but the
  // insert panel closes the keyboard on purpose: `insert-open` keeps it.
  useEffect(() => {
    if (!insertOpen) return;
    const root = document.documentElement;
    root.classList.add("insert-open");
    return () => root.classList.remove("insert-open");
  }, [insertOpen]);

  // A tap outside the bar and its panels puts the caret where the finger
  // landed: the panels close first, in the capture phase, before that tap
  // can move it. `Element`, not `HTMLElement`: a panel key's target is often
  // an SVG path.
  useEffect(() => {
    if (panel === null && !insertOpen) return;
    const onDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (
        target?.closest(
          ".pf-panel, .phone-format-bar, .pf-selection, .pf-insert-sheet",
        )
      )
        return;
      setPanel(null);
      if (insertOpen) {
        setInsertOpen(false);
        focusDocument(tabId);
      }
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [panel, insertOpen, tabId]);

  const togglePanel = (next: Exclude<Panel, null>) => {
    if (insertOpen) {
      setInsertOpen(false);
      focusDocument(tabId);
    }
    setPanel((current) => (current === next ? null : next));
  };
  const openInsert = () => {
    setPanel(null);
    setInsertHeight(keyboardCovered());
    setInsertOpen(true);
    (document.activeElement as HTMLElement | null)?.blur();
  };
  const closeInsert = () => {
    setInsertOpen(false);
    focusDocument(tabId);
  };
  const barStyle =
    insertOpen && insertHeight > 0
      ? ({ "--pf-kb": `${insertHeight}px` } as CSSProperties)
      : undefined;

  return (
    <>
      <div
        className={`format-bar phone-format-bar${insertOpen ? " insert-open" : ""}`}
        style={barStyle}
        role="toolbar"
        aria-label={t.toolbarLabel}
        onMouseDown={keepFocus}
      >
        {context ? (
          <ContextBar t={t} tabId={tabId} block={block} kind={context} />
        ) : (
          <div className="pf-main">
            <IconButton
              label={t.menuInsertGroup}
              className={`pf-key${insertOpen ? " is-on" : ""}`}
              expanded={insertOpen}
              onClick={() => (insertOpen ? closeInsert() : openInsert())}
            >
              <PlusIcon />
            </IconButton>
            <IconButton
              label={t.toolbarHeading}
              className={`pf-key${panel === "text" ? " is-on" : ""}`}
              expanded={panel === "text"}
              onClick={() => togglePanel("text")}
            >
              <HeadingIcon />
            </IconButton>
            <IconButton
              label={t.menuBulletList}
              className={`pf-key${panel === "list" ? " is-on" : ""}`}
              expanded={panel === "list"}
              onClick={() => togglePanel("list")}
            >
              <BulletListIcon />
            </IconButton>
            {showAi && (
              <IconButton
                label={AI_NAME}
                className={`pf-key${panel === "ai" ? " is-on" : ""}`}
                expanded={panel === "ai"}
                onClick={() => togglePanel("ai")}
              >
                <AssistantIcon />
              </IconButton>
            )}
            <IconButton
              label={t.menuUndo}
              className="pf-key"
              onClick={() => press(tabId, UNDO)}
            >
              <UndoIcon />
            </IconButton>
            <IconButton
              label={t.menuRedo}
              className="pf-key"
              onClick={() => press(tabId, REDO)}
            >
              {REDO.Icon ? <REDO.Icon /> : null}
            </IconButton>
            <IconButton
              label={t.toolbarHideKeyboard}
              className="pf-key"
              onClick={() =>
                (document.activeElement as HTMLElement | null)?.blur()
              }
            >
              <CheckIcon />
            </IconButton>
          </div>
        )}
      </div>
      <PhoneSelectionBar
        t={t}
        tabId={tabId}
        enabled={!insertOpen && panel === null}
      />
      <Presence show={panel !== null}>
        {panel === "text" ? (
          <HeadingPanel t={t} tabId={tabId} block={block} />
        ) : panel === "list" ? (
          <ListPanel t={t} tabId={tabId} block={block} />
        ) : panel === "ai" ? (
          <AiPanel
            t={t}
            tabId={tabId}
            illustrate={canIllustrate}
            complete={canComplete}
            grammar={canGrammar}
          />
        ) : null}
      </Presence>
      <Presence show={insertOpen}>
        {insertOpen && (
          <PhoneInsertPanel
            t={t}
            tabId={tabId}
            docPath={docPath}
            height={insertHeight}
            onClose={closeInsert}
          />
        )}
      </Presence>
    </>
  );
}

/** Body text and H1–H6, just above the bar: the keyboard and the selection
 *  stay, and the choice is applied where the caret is. */
function HeadingPanel({
  t,
  tabId,
  block,
}: {
  t: Strings;
  tabId: string;
  block: CaretBlock;
}) {
  return (
    <PresenceDiv
      className="pf-panel"
      role="toolbar"
      aria-label={t.toolbarHeading}
      onMouseDown={keepFocus}
    >
      {headingChoices(t).map((choice) => {
        const on = block.heading === choice.level;
        return (
          <button
            key={choice.detail}
            type="button"
            className={`pf-panel-key${on ? " is-on" : ""}`}
            aria-label={choice.name}
            aria-pressed={on}
            onMouseDown={keepFocus}
            onClick={() => {
              focusDocument(tabId);
              sendAppEvent(INSERT_BLOCK_EVENT, choice.detail);
            }}
          >
            {choice.label}
          </button>
        );
      })}
    </PresenceDiv>
  );
}

/** The two list kinds, a task list, and moving an item in or out. */
function ListPanel({
  t,
  tabId,
  block,
}: {
  t: Strings;
  tabId: string;
  block: CaretBlock;
}) {
  const toggle = (detail: string) => {
    focusDocument(tabId);
    sendAppEvent(TOGGLE_BLOCK_EVENT, detail);
  };
  return (
    <PresenceDiv
      className="pf-panel"
      role="toolbar"
      aria-label={t.menuBulletList}
      onMouseDown={keepFocus}
    >
      <button
        type="button"
        className={`pf-panel-key${block.bulletList ? " is-on" : ""}`}
        aria-label={t.menuBulletList}
        aria-pressed={block.bulletList}
        onMouseDown={keepFocus}
        onClick={() => toggle("bullet-list")}
      >
        <BulletListIcon />
      </button>
      <button
        type="button"
        className={`pf-panel-key${block.orderedList ? " is-on" : ""}`}
        aria-label={t.menuOrderedList}
        aria-pressed={block.orderedList}
        onMouseDown={keepFocus}
        onClick={() => toggle("ordered-list")}
      >
        <NumberedListIcon />
      </button>
      <button
        type="button"
        className="pf-panel-key"
        aria-label={t.menuTaskList}
        onMouseDown={keepFocus}
        onClick={() => toggle("task-list")}
      >
        <TaskActionIcon />
      </button>
      <span className="pf-panel-sep" aria-hidden="true" />
      <button
        type="button"
        className="pf-panel-key"
        aria-label={t.shortcutIndentListItem}
        onMouseDown={keepFocus}
        onClick={() => toggle("sink-list-item")}
      >
        <IndentActionIcon />
      </button>
      <button
        type="button"
        className="pf-panel-key"
        aria-label={t.shortcutOutdentListItem}
        onMouseDown={keepFocus}
        onClick={() => toggle("lift-list-item")}
      >
        <OutdentActionIcon />
      </button>
    </PresenceDiv>
  );
}

/** The AI writing actions, in the same in-place panel as the heading and
 *  list choices: a picture, a continuation, a grammar check. */
function AiPanel({
  t,
  tabId,
  illustrate,
  complete,
  grammar,
}: {
  t: Strings;
  tabId: string;
  illustrate: boolean;
  complete: boolean;
  grammar: boolean;
}) {
  const choose = (
    event:
      | typeof ILLUSTRATE_PARAGRAPH_EVENT
      | typeof TRIGGER_COMPLETION_EVENT
      | typeof TRIGGER_GRAMMAR_CHECK_EVENT,
  ) => {
    focusDocument(tabId);
    sendAppEvent(event);
  };
  return (
    <PresenceDiv
      className="pf-panel pf-ai-panel"
      role="toolbar"
      aria-label={AI_NAME}
      onMouseDown={keepFocus}
    >
      {illustrate && (
        <button
          type="button"
          className="pf-panel-key pf-ai-key"
          aria-label={t.illustrateParagraph}
          onMouseDown={keepFocus}
          onClick={() => choose(ILLUSTRATE_PARAGRAPH_EVENT)}
        >
          {t.illustrateParagraph}
        </button>
      )}
      {complete && (
        <button
          type="button"
          className="pf-panel-key pf-ai-key"
          aria-label={t.triggerCompletion}
          onMouseDown={keepFocus}
          onClick={() => choose(TRIGGER_COMPLETION_EVENT)}
        >
          {t.triggerCompletion}
        </button>
      )}
      {grammar && (
        <button
          type="button"
          className="pf-panel-key pf-ai-key"
          aria-label={t.triggerGrammarCheck}
          onMouseDown={keepFocus}
          onClick={() => choose(TRIGGER_GRAMMAR_CHECK_EVENT)}
        >
          {t.triggerGrammarCheck}
        </button>
      )}
    </PresenceDiv>
  );
}

/** A table's or an image's own keys, undo and redo first. */
function ContextBar({
  t,
  tabId,
  block,
  kind,
}: {
  t: Strings;
  tabId: string;
  block: CaretBlock;
  kind: "table" | "image";
}) {
  const groups = kind === "table" ? TABLE : IMAGE;
  return (
    <div className="pf-context">
      {[UNDO, REDO, ...groups.flat()].map((b, i) => {
        const label = b.label(t);
        return (
          <button
            key={`${label}-${i}`}
            type="button"
            className="pf-key"
            aria-label={label}
            aria-pressed={b.on?.(block)}
            onClick={() => press(tabId, b)}
          >
            {b.Icon ? <b.Icon /> : b.text?.(t)}
          </button>
        );
      })}
    </div>
  );
}

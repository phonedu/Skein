// Settings as the phone's page: fullscreen, the nav list first, and a
// pushed page - under a back row - for the section itself. The desktop's
// two-column dialog is the pointer's shape; this is the thumb's.
import { useEffect, useRef, useState } from "react";
import { useSettings } from "../../prefs/SettingsContext";
import type { Strings } from "../../i18n/strings";
import type { FixedShortcutGroup } from "../../registry/fixed-shortcuts";
import type { SettingsPageDef } from "../../settings/settings-pages";
import type { SearchEntry } from "../../settings/settings-search";
import { CloseIcon } from "../../engine/controls/icons";
import { SettingsNavColumn } from "./settings-nav-column";
import { SettingsContent } from "./settings-content";
import { useSettingsDialogSearch } from "./settings-search";
import { useReveal, type SearchablePage } from "../../settings/SettingsSearch";
import type { ShortcutCommand } from "../../settings/pages/types";
import "./settings-phone.css";

export function SettingsPhone(props: {
  t: Strings;
  pages: SettingsPageDef[];
  def: (id: string) => SettingsPageDef;
  /** The page the open request asked for: a deep link pushes it at once;
   *  the gear's "general" lands on the list. */
  initialPage: string;
  jump?: SearchEntry | null;
  onClose: () => void;
  marginAvailable: boolean;
  fixedShortcuts?: FixedShortcutGroup[];
  pluginCommands?: ShortcutCommand[];
  /** Opens a document in the editor, for the agent.md "edit" button. */
  onOpenFile?: (path: string) => void;
  /** Files a settings action deleted (Reset on a customized skill). */
  onFilesDeleted?: (paths: string[]) => void;
  /** The document in front, for what its project sets. */
  docPath?: string | null;
}) {
  const { t } = useSettings();
  const [pageId, setPageId] = useState<string | null>(
    props.initialPage === "general" ? null : props.initialPage,
  );
  const [jump, setJump] = useState<SearchEntry | null>(props.jump ?? null);
  const content = useRef<HTMLDivElement>(null);

  // The app knows settings is open - the window bar rests while it is - as
  // the desktop's dialog marks (settings-dialog.tsx).
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-modal-open", "");
    return () => root.removeAttribute("data-modal-open");
  }, []);

  const searchPages: SearchablePage[] = props.pages.map((pageDef) => ({
    key: pageDef.id,
    name: pageDef.label(t),
    render: () => (
      <SettingsContentNode
        {...props}
        pageDef={pageDef}
        onOpenPage={setPageId}
      />
    ),
  }));

  const search = useSettingsDialogSearch({
    t,
    pages: searchPages,
    owns: true,
    onPick: (match) => {
      setPageId(match.entry.page);
      setJump(match.entry);
    },
  });

  useReveal(content, jump, () => setJump(null));

  const page = pageId === null ? null : props.def(pageId);

  return (
    <div className="settings-phone">
      {page === null ? (
        <>
          <div className="settings-phone-top">
            <h1 className="settings-phone-title">{t.settingsTitle}</h1>
            <button
              type="button"
              className="settings-phone-ic"
              aria-label={t.close}
              onClick={props.onClose}
            >
              <CloseIcon />
            </button>
          </div>
          <div className="settings-phone-body">
            {search.field}
            {search.searching ? (
              search.results
            ) : (
              // Nothing is open under the list: no row reads as active.
              <SettingsNavColumn
                t={t}
                pages={props.pages}
                active=""
                onOpen={setPageId}
              />
            )}
          </div>
        </>
      ) : (
        <div className="settings-phone-page">
          <div className="settings-phone-top">
            <button
              type="button"
              className="settings-phone-ic"
              aria-label={t.phoneBack}
              onClick={() => setPageId(null)}
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
            <h1 className="settings-phone-title">{page.label(t)}</h1>
          </div>
          <div className="settings-phone-body">
            <div
              ref={content}
              className="settings-content-host"
              data-settings-page={page.id}
            >
              <SettingsContent
                key={page.id}
                t={t}
                page={page}
                onOpenPage={setPageId}
                onClose={props.onClose}
                marginAvailable={props.marginAvailable}
                fixedShortcuts={props.fixedShortcuts}
                pluginCommands={props.pluginCommands}
                {...(props.onOpenFile ? { onOpenFile: props.onOpenFile } : {})}
                {...(props.onFilesDeleted
                  ? { onFilesDeleted: props.onFilesDeleted }
                  : {})}
                {...(props.docPath !== undefined
                  ? { docPath: props.docPath }
                  : {})}
              />
            </div>
          </div>
        </div>
      )}
      {search.index}
    </div>
  );
}

/** The content node the search's index mounts out of sight, and the page
 *  screen shows: the same node either way, so an indexed page's shape is
 *  the one that draws. */
function SettingsContentNode(props: {
  pageDef: SettingsPageDef;
  t: Strings;
  marginAvailable: boolean;
  fixedShortcuts?: FixedShortcutGroup[];
  pluginCommands?: ShortcutCommand[];
  onOpenPage: (id: string) => void;
  onClose: () => void;
  onOpenFile?: (path: string) => void;
  onFilesDeleted?: (paths: string[]) => void;
  docPath?: string | null;
}) {
  return (
    <SettingsContent
      t={props.t}
      page={props.pageDef}
      onOpenPage={props.onOpenPage}
      onClose={props.onClose}
      marginAvailable={props.marginAvailable}
      fixedShortcuts={props.fixedShortcuts}
      pluginCommands={props.pluginCommands}
      {...(props.onOpenFile ? { onOpenFile: props.onOpenFile } : {})}
      {...(props.onFilesDeleted
        ? { onFilesDeleted: props.onFilesDeleted }
        : {})}
      {...(props.docPath !== undefined ? { docPath: props.docPath } : {})}
    />
  );
}

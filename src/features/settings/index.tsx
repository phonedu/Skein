// Settings' features module (spec 2026-11-15-base-ui-settings-design): the
// dialog, its nav column, its rows and controls, its search. It is Base UI's
// only home and loads through lazy.ts (src/lazy/lazy-module.ts): settings
// opens only from ⌘, the rail's gear or the app menu - so none of it may be
// imported at startup, and this file is the lazy entry.
import { useRef, useState } from "react";
import { useSettings } from "../../prefs/SettingsContext";
import type { Strings } from "../../i18n/strings";
import type { FixedShortcutGroup } from "../../registry/fixed-shortcuts";
import { useMarginAvailable } from "../../ai/margin/margin-room";
import {
  settingsPage,
  settingsPages,
  type SettingsPageDef,
} from "../../settings/settings-pages";
import type { SearchEntry } from "../../settings/settings-search";
import type { ShortcutCommand } from "../../settings/pages/types";
import { SettingsDialog } from "./settings-dialog";
import { SettingsNavColumn } from "./settings-nav-column";
import { SettingsContent } from "./settings-content";
import { SettingsPhone } from "./settings-phone";
import type { SearchablePage } from "../../settings/SettingsSearch";
import { useSettingsPageSearch } from "./use-settings-page-search";
import { settingsContentProps } from "./settings-content-props";
import { usePhoneLayout } from "../../engine/controls/usePhoneLayout";
import { PluginDetail } from "../../settings/pages/PluginDetail";
import { AboutPage } from "../../settings/pages/AboutPage";
import { pluginName, pluginRecord } from "../../plugins/store/plugin-records";
import { useSettingsImeEscape } from "./use-settings-ime-escape";
import {
  PLUGIN_PAGE_PREFIX,
  showSettingsDialog,
} from "../../settings/settings-nav";
import "./settings-host.css";
// The plugin page's own box (its reading width): its old host's stylesheet
// lived in the retired plugin tab's chunk, which the desktop no longer
// loads.
import "../../settings/pages/plugin-tab.css";

/** A plugin's page, as the dialog's page def. Kept per plugin, so the
 *  component's identity is stable: a new one each render would remount the
 *  page (and lose its scroll) on every keystroke in the search. */
const pluginDefs = new Map<string, SettingsPageDef>();
function pluginDef(plugin: string): SettingsPageDef {
  let def = pluginDefs.get(plugin);
  if (!def) {
    const record = pluginRecord(plugin);
    def = {
      id: PLUGIN_PAGE_PREFIX + plugin,
      label: () => (record ? pluginName(record) : plugin),
      Page: ({ t }: { t: Strings }) => (
        <div className="plugin-tab tx-scroll-reveal">
          <PluginDetail id={plugin} t={t} />
        </div>
      ),
    };
    pluginDefs.set(plugin, def);
  }
  return def;
}

/** Opens the settings dialog: the feature's one entry for the window. */
export function openSettingsDialog(): void {
  showSettingsDialog();
}

/**
 * The dialog the window shows: the board's panel, its nav
 * column - search on top, the pages' list under it - and the open page's
 * content. Mounted with `key={request}` so each request lands on its page.
 * A plugin's page (`plugin:<id>`) draws its detail inside the same content
 * column, with its own stylesheet as before.
 */
export function SettingsHost(props: {
  page: string;
  jump?: SearchEntry | null;
  onClose: () => void;
  /** Opens a document in the editor, for the agent.md "edit" button. */
  onOpenFile?: (path: string) => void;
  /** Files a settings action deleted (Reset on a customized skill). */
  onFilesDeleted?: (paths: string[]) => void;
  /** The document in front, for what its project sets. */
  docPath?: string | null;
  /** The open library, for the sync page. */
  folderRoot?: string | null;
  /** Documents with an open tab: a sync leaves them for the next run. */
  openPaths?: string[];
  fixedShortcuts?: FixedShortcutGroup[];
  pluginCommands?: ShortcutCommand[];
}) {
  const { t } = useSettings();
  const phone = usePhoneLayout();
  const [pageId, setPageId] = useState(props.page);
  const [jump, setJump] = useState<SearchEntry | null>(props.jump ?? null);
  const content = useRef<HTMLDivElement>(null);
  const marginAvailable = useMarginAvailable();

  useSettingsImeEscape();

  const def = (id: string): SettingsPageDef => {
    if (id === "updates") {
      // The app menu's Check for Updates…: the About page, checking at
      // once (what the retired Settings tab showed).
      return {
        id,
        label: () => t.navAbout,
        Page: (props) => <AboutPage {...props} checkUpdates />,
      };
    }
    if (id.startsWith(PLUGIN_PAGE_PREFIX)) {
      const plugin = id.slice(PLUGIN_PAGE_PREFIX.length);
      return pluginDef(plugin);
    }
    return settingsPage(id) ?? settingsPages()[0];
  };

  const pages = settingsPages();
  const contentProps = (
    page: SettingsPageDef,
    onOpenPage: (id: string) => void,
  ) =>
    settingsContentProps({
      t,
      page,
      onOpenPage,
      onClose: props.onClose,
      marginAvailable,
      fixedShortcuts: props.fixedShortcuts,
      pluginCommands: props.pluginCommands,
      onOpenFile: props.onOpenFile,
      onFilesDeleted: props.onFilesDeleted,
      docPath: props.docPath,
      folderRoot: props.folderRoot,
      openPaths: props.openPaths,
    });
  const searchPages: SearchablePage[] = [
    ...pages.map((page) => ({
      key: page.id,
      name: page.label(t),
      render: () => <SettingsContent {...contentProps(page, () => {})} />,
    })),
    ...(pageId.startsWith(PLUGIN_PAGE_PREFIX)
      ? [
          {
            key: pageId,
            name: def(pageId).label(t),
            render: () => (
              <SettingsContent {...contentProps(def(pageId), () => {})} />
            ),
          },
        ]
      : []),
  ];

  const search = useSettingsPageSearch({
    t,
    pages: searchPages,
    owns: true,
    onPick: (match) => {
      setPageId(match.entry.page);
      setJump(match.entry);
    },
    content,
    jump,
    clearJump: () => setJump(null),
  });

  // A phone takes the page form - fullscreen, list first, the section
  // pushed under a back row (settings-phone.tsx); the dialog is the
  // pointer's shape.
  if (phone) {
    return (
      <SettingsPhone
        t={t}
        pages={pages}
        def={def}
        initialPage={props.page}
        jump={props.jump ?? null}
        onClose={props.onClose}
        marginAvailable={marginAvailable}
        fixedShortcuts={props.fixedShortcuts}
        pluginCommands={props.pluginCommands}
        {...(props.onOpenFile ? { onOpenFile: props.onOpenFile } : {})}
        {...(props.onFilesDeleted
          ? { onFilesDeleted: props.onFilesDeleted }
          : {})}
        {...(props.docPath !== undefined ? { docPath: props.docPath } : {})}
        folderRoot={props.folderRoot ?? null}
        openPaths={props.openPaths ?? []}
      />
    );
  }

  return (
    <SettingsDialog
      t={t}
      open
      onClose={props.onClose}
      nav={
        <>
          {search.field}
          <SettingsNavColumn
            t={t}
            pages={pages}
            // "updates" is the About page, checking.
            active={pageId === "updates" ? "about" : pageId}
            onOpen={setPageId}
          />
        </>
      }
    >
      {search.index}
      <div
        ref={content}
        className="settings-content-host"
        data-settings-page={pageId}
      >
        {search.searching ? (
          search.results
        ) : (
          <SettingsContent
            key={pageId}
            {...contentProps(def(pageId), setPageId)}
          />
        )}
      </div>
    </SettingsDialog>
  );
}

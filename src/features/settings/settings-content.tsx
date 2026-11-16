import type { ReactNode } from "react";
import { useSettings } from "../../prefs/SettingsContext";
import type { Strings } from "../../i18n/strings";
import type { FixedShortcutGroup } from "../../registry/fixed-shortcuts";
import type { SettingsPageDef } from "../../settings/settings-pages";
import { pageComponent } from "../../settings/builtin-pages";
import { pageProps, type ShortcutCommand } from "../../settings/pages/types";
import { GeneralPage } from "./pages/general";
import { AppearancePage } from "./pages/appearance";
import "./settings-content.css";
// The pages the dialog still draws the old way need the old chrome: the
// desktop does not load the iPad's sheet, so its styles come with the
// module (the sheet's own stylesheet imports them).
import "../../settings/SettingsPanel.css";

/**
 * The settings dialog's content column: it hosts the open
 * page. General and Appearance are drawn here with the new rows;
 * every other page - built-in or a plugin's - renders its
 * existing component unchanged, the transition rule. Mount with
 * `key={page.id}` so a page reopens fresh, like a request.
 */
export function SettingsContent(props: {
  t: Strings;
  page: SettingsPageDef;
  onOpenPage: (id: string) => void;
  /** Whether the window has room for the AI's margin. */
  marginAvailable?: boolean;
  /** Shortcuts pages: what ShortcutsPage needs, passed on by the wiring. */
  fixedShortcuts?: FixedShortcutGroup[];
  pluginCommands?: ShortcutCommand[];
  /** What the legacy pages take from the window: a document to open, the
   *  one in front, and the files an action deleted. */
  onOpenFile?: (path: string) => void;
  onFilesDeleted?: (paths: string[]) => void;
  docPath?: string | null;
}) {
  const { settings, setSettings } = useSettings();
  if (props.page.id === "general") {
    return <GeneralPage t={props.t} />;
  }
  if (props.page.id === "look-basic") {
    return <AppearancePage t={props.t} />;
  }
  const Page = pageComponent(props.page);
  return (
    <div className="settings-legacy-page">
      <Page
        {...pageProps({
          t: props.t,
          settings,
          setSettings,
          openPage: props.onOpenPage,
          marginAvailable: props.marginAvailable,
          fixedShortcuts: props.fixedShortcuts ?? [],
          pluginCommands: props.pluginCommands ?? [],
          ...(props.onOpenFile ? { onOpenFile: props.onOpenFile } : {}),
          ...(props.onFilesDeleted
            ? { onFilesDeleted: props.onFilesDeleted }
            : {}),
          ...(props.docPath !== undefined ? { docPath: props.docPath } : {}),
        })}
      />
    </div>
  );
}

/** A page section: the board's group heading over its rows. */
export function PageGroup(props: { title: string; children: ReactNode }) {
  return (
    <section className="settings-page-group">
      <h3 className="settings-page-group-title">{props.title}</h3>
      <div className="settings-page-group-body">{props.children}</div>
    </section>
  );
}

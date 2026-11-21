import type { ReactNode } from "react";
import { useSettings } from "../../prefs/SettingsContext";
import type { Strings } from "../../i18n/strings";
import type { FixedShortcutGroup } from "../../registry/fixed-shortcuts";
import type { SettingsPageDef } from "../../settings/settings-pages";
import { pageComponent } from "../../settings/builtin-pages";
import { pageProps, type ShortcutCommand } from "../../settings/pages/types";
import { GeneralPage } from "./pages/general";
import { AppearancePage } from "./pages/appearance";
import { EditorPage } from "./pages/editor";
import { ShortcutsPage } from "./pages/shortcuts";
import { ImagesPage } from "./pages/images";
import { ExportPage } from "./pages/export";
import { PrivacyPage } from "./pages/privacy";
import { ProvidersPage } from "./pages/providers";
import { MemoryPage } from "./pages/memory";
import { ChatPage } from "./pages/chat";
import { McpPage } from "./pages/mcp";
import "./settings-content.css";
// The pages the dialog still draws the old way need the old chrome: the
// desktop does not load the iPad's sheet, so its styles come with the
// module (the sheet's own stylesheet imports them).
import "../../settings/SettingsPanel.css";

/**
 * The settings dialog's content column: it hosts the open
 * page. General, Appearance, Editing, Shortcuts, Images, Export, Privacy
 * and the Textus AI pages are drawn here with the new shells; every other
 * page - built-in or a plugin's - renders its existing component
 * unchanged, the transition rule. Mount with `key={page.id}` so a page
 * reopens fresh, like a request.
 */
export function SettingsContent(props: {
  t: Strings;
  page: SettingsPageDef;
  onOpenPage: (id: string) => void;
  onClose: () => void;
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
  folderRoot?: string | null;
  openPaths?: string[];
}) {
  const { settings, setSettings } = useSettings();
  /** A Textus AI page drawn only while Textus AI is on. */
  const ai = (page: ReactNode) =>
    settings.textusAi ? (
      page
    ) : (
      <p className="tx-list-note">{props.t.textusAiOffHint}</p>
    );
  if (props.page.id === "general") {
    return <GeneralPage t={props.t} />;
  }
  if (props.page.id === "look-basic") {
    return <AppearancePage t={props.t} />;
  }
  if (props.page.id === "edit-text") {
    return <EditorPage t={props.t} />;
  }
  if (props.page.id === "shortcuts") {
    return (
      <ShortcutsPage
        t={props.t}
        fixedShortcuts={props.fixedShortcuts ?? []}
        pluginCommands={props.pluginCommands ?? []}
      />
    );
  }
  if (props.page.id === "edit-img") {
    return <ImagesPage t={props.t} docPath={props.docPath ?? null} />;
  }
  if (props.page.id === "edit-export") {
    return <ExportPage t={props.t} />;
  }
  if (props.page.id === "privacy") {
    return <PrivacyPage t={props.t} />;
  }
  if (props.page.id === "providers") {
    return ai(<ProvidersPage t={props.t} />);
  }
  if (props.page.id === "memory") {
    return ai(
      <MemoryPage
        t={props.t}
        onClose={props.onClose}
        {...(props.onOpenFile ? { onOpenFile: props.onOpenFile } : {})}
        {...(props.onFilesDeleted
          ? { onFilesDeleted: props.onFilesDeleted }
          : {})}
      />,
    );
  }
  if (props.page.id === "chat") {
    return ai(
      <ChatPage t={props.t} marginAvailable={props.marginAvailable ?? false} />,
    );
  }
  if (props.page.id === "mcp") {
    return ai(<McpPage t={props.t} />);
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
          folderRoot: props.folderRoot ?? null,
          openPaths: props.openPaths ?? [],
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

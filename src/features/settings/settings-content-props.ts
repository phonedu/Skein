import type { ComponentProps } from "react";
import type { Strings } from "../../i18n/strings";
import type { FixedShortcutGroup } from "../../registry/fixed-shortcuts";
import type { SettingsPageDef } from "../../settings/settings-pages";
import type { ShortcutCommand } from "../../settings/pages/types";
import type { SettingsContent } from "./settings-content";

/** What every SettingsContent call shares: the window's document, folder
 *  and shortcuts, and the page it draws. The dialog, its search index and
 *  the phone all pass the same set, so it is built once here. */
export function settingsContentProps({
  t,
  page,
  onOpenPage,
  onClose,
  marginAvailable,
  fixedShortcuts,
  pluginCommands,
  onOpenFile,
  onFilesDeleted,
  docPath,
  folderRoot,
  openPaths,
}: {
  t: Strings;
  page: SettingsPageDef;
  onOpenPage: (id: string) => void;
  onClose: () => void;
  marginAvailable?: boolean;
  fixedShortcuts?: FixedShortcutGroup[];
  pluginCommands?: ShortcutCommand[];
  onOpenFile?: (path: string) => void;
  onFilesDeleted?: (paths: string[]) => void;
  docPath?: string | null;
  folderRoot?: string | null;
  openPaths?: string[];
}): ComponentProps<typeof SettingsContent> {
  return {
    t,
    page,
    onOpenPage,
    onClose,
    marginAvailable,
    fixedShortcuts,
    pluginCommands,
    ...(onOpenFile ? { onOpenFile } : {}),
    ...(onFilesDeleted ? { onFilesDeleted } : {}),
    ...(docPath !== undefined ? { docPath } : {}),
    folderRoot: folderRoot ?? null,
    openPaths: openPaths ?? [],
  };
}

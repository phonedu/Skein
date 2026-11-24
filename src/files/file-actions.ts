import type { ContextMenuEntry } from "../engine/controls/ContextMenu";
import {
  CloseIcon,
  NewDocumentIcon,
  NewFolderIcon,
  ProjectIcon,
  RefreshIcon,
} from "../engine/controls/icons";
import type { Strings } from "../i18n/strings";
import { refreshTree, sortTree } from "./tree-view-events";
import type { TreeSort } from "./tree-shared";

/**
 * What the file page's ⋯ offers, shared by the desktop's menu and the
 * phone's sheet: create, switch the folder's mode, sort, Refresh. The tree's
 * own toolbar is hidden in the H0 shell, so this is the only way to reach
 * them.
 */
export function fileActionEntries({
  t,
  sort,
  folder,
  canOpenAsFolder,
  onNew,
  onOpenAsFolder,
  onCloseFolder,
}: {
  t: Strings;
  /** The sort in force: it is one choice of two, ticked. */
  sort: TreeSort;
  /** The opened folder, when there is one: then Close Folder, else Open as
   *  Folder (where the platform can). */
  folder: string | null;
  canOpenAsFolder: boolean;
  onNew: (kind: "document" | "folder") => void;
  onOpenAsFolder: () => void;
  onCloseFolder: () => void;
}): ContextMenuEntry[] {
  const entries: ContextMenuEntry[] = [
    {
      label: t.menuNewFile,
      Icon: NewDocumentIcon,
      onSelect: () => onNew("document"),
    },
    {
      label: t.treeNewFolder,
      Icon: NewFolderIcon,
      onSelect: () => onNew("folder"),
    },
  ];
  if (!folder && canOpenAsFolder)
    entries.push({
      label: t.treeOpenAsFolder,
      Icon: ProjectIcon,
      onSelect: onOpenAsFolder,
    });
  if (folder)
    entries.push({
      label: t.menuCloseFolder,
      Icon: CloseIcon,
      onSelect: onCloseFolder,
    });
  entries.push(
    "separator",
    {
      // A group: a submenu on the desktop, its two rows in the phone's sheet.
      label: t.treeSort,
      items: [
        {
          label: t.treeSortName,
          checked: sort === "name",
          onSelect: () => sortTree("name"),
        },
        {
          label: t.treeSortModified,
          checked: sort === "modified",
          onSelect: () => sortTree("modified"),
        },
      ],
    },
    {
      label: t.treeRefresh,
      Icon: RefreshIcon,
      onSelect: refreshTree,
    },
  );
  return entries;
}

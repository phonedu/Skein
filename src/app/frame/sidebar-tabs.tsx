import { StartActions } from "../StartActions";
import "../start-page.css";
import type { ComponentType } from "react";
import { useEffect, useState } from "react";
import { readRecents } from "../menu/recents";
import { reserveSidebarTabIds } from "../../registry/sidebar-tabs";
import { FileTree } from "../../files/FileTree";
import {
  TreeTabIcon,
  OutlineTabIcon,
  SearchIcon,
} from "../../engine/controls/icons";
import { lazyModule } from "../../lazy/lazy-module";
import { lazyComponent } from "../../lazy/lazy-component";
import { canOpenFolder } from "../../platform/capabilities";
import type { Strings } from "../../i18n/strings";
import type { OpenFolder } from "../useOpenFolder";
import type { FileOpenHow } from "../../files/tree-shared";

// The Outline and Search panels load while the window is idle, not with
// it: the Files panel is the one a window opens on.
const Outline = lazyComponent(
  lazyModule("outline", () => import("../../files/Outline"), { warm: true }),
  (m) => m.Outline,
);
const SearchPanel = lazyComponent(
  lazyModule("search-panel", () => import("../../files/SearchPanel"), {
    warm: true,
  }),
  (m) => m.SearchPanel,
);

/** What every sidebar tab's panel is given: the window's document and
 *  folder, and its ways to open a file or close the sidebar. */
interface SidebarTabProps {
  t: Strings;
  /** The tree's root and the opened folder. */
  openFolder: OpenFolder;
  activePath: string | null;
  activeContent: string;
  /** The tab in front, for a jump inside its document. */
  activeTabId: string;
  /** `beside`: in a split beside the document in front. */
  onOpenFile: (path: string, how?: FileOpenHow, line?: number) => void;
  /** Closes the sidebar. */
  onClose: () => void;
  /** A file or folder was dragged into another folder in the tree. */
  onEntryMoved: (from: string, to: string) => void;
  /** The search shortcut asked for the Search tab's box. */
  searchFocusRequest: boolean;
  onSearchFocusHandled: () => void;
  /** The library's note count, for the view column's foot. */
  onNoteCount?: (label: string | null) => void;
}

/**
 * A sidebar tab: an id (what ui-state remembers), its button's name and
 * icon, and the panel it opens. Plugins add tabs of the same shape.
 */
export interface SidebarTabDef {
  id: string;
  label: (t: Strings) => string;
  Icon: ComponentType;
  Panel: ComponentType<SidebarTabProps>;
  /** Not among the rail's icons (Settings: the gear at its foot). */
  railFoot?: boolean;
}

function FilesPanel({
  t,
  openFolder,
  activePath,
  onOpenFile,
  onEntryMoved,
  onNoteCount,
}: SidebarTabProps) {
  // The notes board's recents: read when the panel mounts, refreshed on the
  // window's next mount - a foot-level fact, not a live meter.
  const [recentFiles, setRecentFiles] = useState<readonly string[]>([]);
  useEffect(() => {
    let stale = false;
    readRecents().then(
      (recents) => !stale && setRecentFiles(recents.files),
      () => undefined,
    );
    return () => {
      stale = true;
    };
  }, []);
  if (!openFolder.treeRoot)
    // No folder: the start page's three ways to begin, so a window with
    // nothing open is never a dead end.
    return (
      <div className="sidebar-start">
        <StartActions t={t} />
      </div>
    );
  return (
    <FileTree
      root={openFolder.treeRoot}
      onRootChange={openFolder.setTreeRoot}
      reveal={openFolder.revealed}
      folder={openFolder.folder}
      activePath={activePath}
      onFileSelect={onOpenFile}
      onOpenAsFolder={canOpenFolder ? openFolder.openFolder : undefined}
      onCloseFolder={openFolder.closeFolder}
      onEntryMoved={onEntryMoved}
      recentFiles={recentFiles}
      onNoteCount={onNoteCount}
      foot={false}
    />
  );
}

const BUILT_IN: SidebarTabDef[] = [
  {
    id: "tree",
    // The view is also called Files: this one names the tree under it.
    label: (t) => t.treeFileTree,
    Icon: TreeTabIcon,
    Panel: FilesPanel,
  },
  {
    id: "outline",
    label: (t) => t.outlineTab,
    Icon: OutlineTabIcon,
    Panel: ({ activeContent, activeTabId }) => (
      <Outline content={activeContent} tabId={activeTabId} />
    ),
  },
  {
    id: "search",
    label: (t) => t.searchTab,
    Icon: SearchIcon,
    Panel: ({
      t,
      openFolder,
      onOpenFile,
      searchFocusRequest,
      onSearchFocusHandled,
    }) =>
      // Over the folder the tree shows: the opened one, else the
      // document's.
      openFolder.treeRoot ? (
        <SearchPanel
          root={openFolder.folder ?? openFolder.treeRoot}
          onOpen={(path, line) => onOpenFile(path, undefined, line)}
          focusRequest={searchFocusRequest}
          onFocusHandled={onSearchFocusHandled}
        />
      ) : (
        <div className="tx-list-note">{t.searchNoFolder}</div>
      ),
  },
];

/** The Files view's own tabs: Files, Outline, Search. The plugin manager
 *  and plugins' pages are not tabs of the view column in the H0 shell. */
export const FILE_TABS = BUILT_IN;

// The view column's names are Textus's: a plugin's tab may not take one.
reserveSidebarTabIds(
  (id) => id === "plugins" || BUILT_IN.some((tab) => tab.id === id),
);

/** The Files view's tab with this id, or Files. */
export function fileTab(id: string): SidebarTabDef {
  return BUILT_IN.find((tab) => tab.id === id) ?? BUILT_IN[0];
}

/** The first tab, Files: where the sidebar opens with nothing remembered. */
export const DEFAULT_SIDEBAR_TAB = "tree";

/** The view column's tabs; plugins' pages live in the top bar's launcher,
 *  not here. Kept for the remembered tab's validation. */
export function sidebarTabs(): SidebarTabDef[] {
  return [...BUILT_IN];
}

/** The tab with this id, or Files for one no longer there. */
export function sidebarTab(id: string): SidebarTabDef {
  return sidebarTabs().find((t) => t.id === id) ?? BUILT_IN[0];
}

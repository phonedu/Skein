import { useEffect, useRef, type MouseEvent as ReactMouseEvent } from "react";
import {
  ChevronIcon,
  CloseIcon,
  NewDocumentIcon,
  NewFolderIcon,
  ProjectIcon,
  RefreshIcon,
  SortIcon,
} from "../engine/controls/icons";

import { useSettings } from "../prefs/SettingsContext";
import { folderName, parentDir } from "../utils/path";
import { canOpenFolder, isMobileApp } from "../platform/capabilities";
import { ContextMenu } from "../engine/controls/ContextMenu";
import { Presence } from "../engine/motion/usePresence";
import { TreeSelectionContext, useTreeSelection } from "./tree-selection";
import { Tooltip } from "../engine/controls/Tooltip";
import { setUiState } from "../storage/ui-state";
import {
  TreeContext,
  TreeRowActionsContext,
  type TreeDraft,
  type TreeShared,
  type TreeSort,
} from "./tree-shared";
import { DirNode } from "./TreeNodes";
import "./FileTree.css";
import { isWithin } from "../utils/path";
import type { FileOpenHow } from "./tree-shared";
import { useFileTreeRows, useFileTreeState } from "./useFileTree";
import { RecentSection } from "./recent-section";
import { ViewFoot } from "../engine/controls/view-foot";
import { fill } from "../i18n/fill";

interface FileTreeProps {
  /** Where the tree is rooted. With no folder opened, the toolbar's parent
   *  folder and Show Only This Folder move it through `onRootChange`,
   *  without touching the open document; an opened folder stays whole. */
  root: string;
  onRootChange: (path: string) => void;
  /** A folder to bring into view (a plugin's showFolder). */
  reveal?: string | null;
  /** The folder opened with File > Open Folder…, or null. The tree stays
   *  inside it, and the search covers all of it. */
  folder: string | null;
  activePath: string | null;
  /** A phone-home name filter; empty keeps the normal tree. */
  filter?: string;
  /** The empty root's state and the empty search's hint; the phone home's
   *  two quiet states, null everywhere else. */
  emptyState?: TreeShared["emptyState"];
  noResults?: TreeShared["noResults"];
  /** The root's entry count as it loads (the phone's + steps aside over
   *  an empty library). */
  onRootCount?: (count: number) => void;
  /** The library's note count, for a caller that draws the foot itself
   *  (the H0 view column). */
  onNoteCount?: (label: string | null) => void;
  /** Whether the tree draws its own foot; false where the surface around it
   *  has one (the view column). */
  foot?: boolean;
  /** A new entry to be named in place at the root, asked for elsewhere
   *  (the phone's + sheet): each seq is one ask. */
  draftRequest?: { kind: TreeDraft["kind"]; seq: number } | null;
  /** How it opens: a tab of its own unless `how` says to look (a click,
   *  the preview tab) or Open to the Side. */
  onFileSelect: (path: string, how?: FileOpenHow) => void;
  /** Opens the folder the tree shows as the window's folder; desktop only. */
  onOpenAsFolder?: (path: string) => void;
  /** File > Close Folder. */
  onCloseFolder: () => void;
  /** A file or folder was dragged into another folder: open tabs follow
   *  it to its new path. */
  onEntryMoved: (from: string, to: string) => void;
  /** The recently opened documents, most recent first; the foot of the
   *  notes board's three sections. */
  recentFiles?: readonly string[];
}

export function FileTree({
  root,
  onRootChange,
  reveal = null,
  folder,
  activePath,
  filter = "",
  emptyState = null,
  noResults = null,
  onRootCount,
  onNoteCount,
  foot = true,
  draftRequest = null,
  onFileSelect,
  onOpenAsFolder,
  onCloseFolder,
  onEntryMoved,
  recentFiles,
}: FileTreeProps) {
  const { t } = useSettings();
  // The notes view's foot (the board's bottom strip): the folder's note
  // count beside what the view is.
  const base = folder ?? root;
  const { noteCount, view, select, draft, setDraft, finishDraft } =
    useFileTreeState(base, t, onFileSelect);
  // The view column draws the foot itself: it is told the count.
  useEffect(() => {
    onNoteCount?.(noteCount);
  }, [noteCount, onNoteCount]);
  const { generation, setGeneration } = view;
  const { sort, setSort, scope, setScope, versions, reload } = view;
  const { showHidden, setShowHidden } = view;
  const { treeRef, onTreeKey, selection, picking, onRowPick } =
    useTreeSelection(root, activePath);
  // Not on a phone: above Documents is the app's private container, and above
  // a picked folder is outside what the user granted. Not above an
  // opened folder either: that is the edge of what the user opened.
  const parent = isMobileApp || root === folder ? null : parentDir(root);
  const desktop = !isMobileApp && canOpenFolder;
  const { menu, setMenu, onRowMenu, drag, rowActions, shared } =
    useFileTreeRows({
      root,
      folder,
      t,
      reload,
      select,
      onEntryMoved,
      setDraft,
      onRootChange,
      draft,
      finishDraft,
      sort,
      scope,
      showHidden,
      versions,
      stale: view.stale,
      refreshed: view.refreshed,
      desktop,
      reveal,
      filter,
      emptyState,
      noResults,
      onRootCount,
      treeRef,
      selection,
      onRowPick,
    });

  // A draft asked for from outside the tree (the phone's + sheet): one row
  // at the root, its name typed in place.
  const asked = useRef(0);
  useEffect(() => {
    if (!draftRequest || draftRequest.seq === asked.current) return;
    asked.current = draftRequest.seq;
    setDraft({ dir: root, kind: draftRequest.kind });
  }, [draftRequest, root, setDraft]);

  const openSortMenu = (e: ReactMouseEvent<HTMLButtonElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const pick = (next: TreeSort) => () => {
      setSort(next);
      setUiState("fileTreeSort", next);
    };
    setMenu({
      x: box.left,
      y: box.bottom + 2,
      items: [
        {
          label: t.treeSortName,
          checked: sort === "name",
          onSelect: pick("name"),
        },
        {
          label: t.treeSortModified,
          checked: sort === "modified",
          onSelect: pick("modified"),
        },
        "separator",
        // What the tree lists: every file, or documents and folders.
        ...(["all", "documents"] as const).map((next) => ({
          label:
            next === "all" ? t.treeSearchScopeAll : t.treeSearchScopeDocuments,
          checked: scope === next,
          onSelect: () => {
            setScope(next);
            setUiState("fileSearchScope", next);
          },
        })),
        "separator",
        {
          label: t.treeShowHidden,
          checked: showHidden,
          onSelect: () => {
            setShowHidden(!showHidden);
            setUiState("fileTreeHidden", showHidden ? "0" : "1");
          },
        },
      ],
    });
  };

  return (
    <TreeContext.Provider value={shared}>
      <TreeRowActionsContext.Provider value={rowActions}>
        <TreeSelectionContext.Provider value={selection}>
          <div
            className={`file-tree${drag ? " file-tree-dragging" : ""}${picking ? " file-tree-picking" : ""}`}
          >
            <div className="tree-main">
              <div className="tree-toolbar">
                {/* The way up is the parent folder, by name: an arrow alone read
              as "collapse" or "scroll up". */}
                {parent && (
                  <>
                    <Tooltip text={t.treeParentFolder}>
                      <button
                        type="button"
                        className="tree-crumb"
                        onClick={() => onRootChange(parent)}
                        aria-label={`${t.treeParentFolder}: ${folderName(parent)}`}
                      >
                        <ChevronIcon className="tree-crumb-back" />
                        <span className="tx-truncate tree-crumb-name">
                          {folderName(parent)}
                        </span>
                      </button>
                    </Tooltip>
                    <span className="tree-crumb-sep" aria-hidden="true">
                      /
                    </span>
                  </>
                )}
                <span className="tx-truncate tree-root-label" title={root}>
                  {folderName(root)}
                </span>
                {desktop && (
                  <>
                    <Tooltip text={t.treeNewDocument}>
                      <button
                        type="button"
                        className="tree-tool"
                        aria-label={t.treeNewDocument}
                        onClick={() =>
                          setDraft({ dir: root, kind: "document" })
                        }
                      >
                        <NewDocumentIcon />
                      </button>
                    </Tooltip>
                    <Tooltip text={t.treeNewFolder}>
                      <button
                        type="button"
                        className="tree-tool"
                        aria-label={t.treeNewFolder}
                        onClick={() => setDraft({ dir: root, kind: "folder" })}
                      >
                        <NewFolderIcon />
                      </button>
                    </Tooltip>
                  </>
                )}
                {/* The tree following the document's folder: one button opens
                it as the folder, its tip saying whose folder it is. */}
                {!folder && onOpenAsFolder && (
                  <Tooltip
                    text={t.treeOpenAsFolder}
                    description={
                      activePath && isWithin(activePath, root)
                        ? t.treeDocumentFolder
                        : null
                    }
                  >
                    <button
                      type="button"
                      className="tree-tool"
                      aria-label={t.treeOpenAsFolder}
                      onClick={() => onOpenAsFolder(root)}
                    >
                      <ProjectIcon />
                    </button>
                  </Tooltip>
                )}
                <Tooltip text={t.treeSort}>
                  <button
                    type="button"
                    className="tree-tool"
                    aria-label={t.treeSort}
                    aria-haspopup="menu"
                    onClick={openSortMenu}
                  >
                    <SortIcon />
                  </button>
                </Tooltip>
                {folder && (
                  <Tooltip text={t.menuCloseFolder}>
                    <button
                      type="button"
                      className="tree-tool"
                      onClick={onCloseFolder}
                      aria-label={t.menuCloseFolder}
                    >
                      <CloseIcon />
                    </button>
                  </Tooltip>
                )}
                <Tooltip text={t.treeRefresh}>
                  <button
                    type="button"
                    className="tree-tool"
                    onClick={() => setGeneration((g) => g + 1)}
                    aria-label={t.treeRefresh}
                  >
                    <RefreshIcon />
                  </button>
                </Tooltip>
              </div>
              <RecentSection
                t={t}
                files={recentFiles ?? []}
                root={base}
                onOpen={(path) => onFileSelect(path)}
              />
              <div className="tree-section-title">
                {t.notesLibrary} · {folderName(base)}
              </div>
              <div
                ref={treeRef}
                role="tree"
                aria-label={t.treeTab}
                className={`tree-body${drag?.into === root ? " tx-drop-into" : ""}`}
                data-drop-dir={root}
                onKeyDown={onTreeKey}
                onContextMenu={
                  desktop ? (e) => onRowMenu(e, root, true) : undefined
                }
                // Double-click on the blank below the rows: a new document there.
                onDoubleClick={
                  desktop
                    ? (e) => {
                        if (!(e.target as HTMLElement).closest(".tree-row"))
                          setDraft({ dir: root, kind: "document" });
                      }
                    : undefined
                }
              >
                <DirNode
                  key={`${root}\n${generation}`}
                  path={root}
                  depth={0}
                  activePath={activePath}
                  onFileSelect={select}
                />
              </div>
            </div>
            {foot && (
              <ViewFoot
                left={t.notesFootNote}
                right={
                  noteCount === null
                    ? undefined
                    : fill(t.notesFootCount, { n: noteCount })
                }
              />
            )}
            <Presence show={menu !== null}>
              {menu && (
                <ContextMenu
                  x={menu.x}
                  y={menu.y}
                  items={menu.items}
                  title={menu.title}
                  onClose={() => setMenu(null)}
                />
              )}
            </Presence>
          </div>
        </TreeSelectionContext.Provider>
      </TreeRowActionsContext.Provider>
    </TreeContext.Provider>
  );
}

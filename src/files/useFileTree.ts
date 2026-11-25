// The file tree's state and its rows, apart from the panel that draws them:
// the state hook reads the folder, the row hook keeps the selection, menu
// and drag a row needs.
import type { RefObject } from "react";
import type { Strings } from "../i18n/strings";
import { isMobileApp } from "../platform/capabilities";
import type { FileOpenHow, TreeRowActions } from "./tree-shared";
import type { TreeDraft } from "./tree-shared";
import type { TreeSelection } from "./tree-selection";
import { useLatestCallback } from "../utils/hooks/useLatest";
import { useNoteCount } from "./note-count";
import { useRowDrag } from "./useRowDrag";
import { useRowMenu } from "./useRowMenu";
import { useNewEntry } from "./useNewEntry";
import { useTreeContexts } from "./useTreeContexts";
import { useTreeView } from "./useTreeData";

export function useFileTreeState(
  base: string,
  t: Strings,
  onFileSelect: (path: string, how?: FileOpenHow) => void,
) {
  const noteCount = useNoteCount(base);
  const view = useTreeView(base);
  // One handler for the tree's life: a row redraws only when it changes.
  const select = useLatestCallback(onFileSelect);
  const { draft, setDraft, finishDraft } = useNewEntry(t, view.reload, select);
  return { noteCount, view, select, draft, setDraft, finishDraft };
}

export function useFileTreeRows({
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
  stale,
  refreshed,
  desktop,
  reveal,
  filter,
  emptyState,
  noResults,
  onRootCount,
  treeRef,
  selection,
  onRowPick,
  fileDropInto,
}: {
  root: string;
  folder: string | null;
  t: Strings;
  reload: (...dirs: string[]) => void;
  select: (path: string, how?: FileOpenHow) => void;
  onEntryMoved: (from: string, to: string) => void;
  setDraft: (draft: TreeDraft) => void;
  onRootChange: (path: string) => void;
  draft: TreeDraft | null;
  finishDraft: (name: string | null) => void;
  sort: Parameters<typeof useTreeContexts>[0]["sort"];
  scope: Parameters<typeof useTreeContexts>[0]["scope"];
  showHidden: boolean;
  versions: Record<string, number>;
  stale: Record<string, number>;
  refreshed: number;
  desktop: boolean;
  reveal: string | null;
  filter: string;
  emptyState: Parameters<typeof useTreeContexts>[0]["emptyState"];
  noResults: Parameters<typeof useTreeContexts>[0]["noResults"];
  onRootCount: Parameters<typeof useTreeContexts>[0]["onRootCount"];
  treeRef: RefObject<HTMLDivElement | null>;
  fileDropInto?: string | null;
  selection: TreeSelection;
  onRowPick: NonNullable<TreeRowActions["onRowPick"]>;
}) {
  const { menu, setMenu, onRowMenu, openRowMenu } = useRowMenu(
    root,
    folder ?? root,
    t,
    reload,
    select,
    onEntryMoved,
    setDraft,
    folder ? null : onRootChange,
    selection,
  );
  const { drag, onRowPointerDown } = useRowDrag(
    treeRef,
    reload,
    onEntryMoved,
    folder ?? root,
    t,
    selection,
    openRowMenu,
  );
  const { rowActions, shared } = useTreeContexts({
    sort,
    scope,
    showHidden,
    versions,
    stale,
    refreshed,
    dropInto: drag?.into ?? fileDropInto,
    desktop,
    onRowMenu,
    onRowHold: isMobileApp ? openRowMenu : null,
    onRowPointerDown,
    onRowPick,
    draft,
    finishDraft,
    newDocumentLabel: t.treeNewDocument,
    setDraft,
    root,
    reveal,
    filter,
    emptyState,
    noResults,
    onRootCount,
  });
  return {
    selection,
    menu,
    setMenu,
    onRowMenu,
    openRowMenu,
    drag,
    onRowPointerDown,
    rowActions,
    shared,
  };
}

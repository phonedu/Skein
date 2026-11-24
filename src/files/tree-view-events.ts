import { getUiState, setUiState } from "../storage/ui-state";
import type { TreeSort } from "./tree-shared";

/**
 * The file page's sort and Refresh live in its header, outside the tree
 * that holds them: these ask the tree in front, and keep the choice for the
 * next window. One tree is mounted at a time (desktop or phone).
 */
export const TREE_SORT_EVENT = "textus-tree-sort";
export const TREE_REFRESH_EVENT = "textus-tree-refresh";

/** The sort in force: the one kept, else by name. */
export function currentTreeSort(): TreeSort {
  return getUiState("fileTreeSort") === "modified" ? "modified" : "name";
}

export function sortTree(next: TreeSort): void {
  setUiState("fileTreeSort", next);
  window.dispatchEvent(new CustomEvent(TREE_SORT_EVENT, { detail: next }));
}

export function refreshTree(): void {
  window.dispatchEvent(new Event(TREE_REFRESH_EVENT));
}

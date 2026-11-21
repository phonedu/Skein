import { useFileBadge } from "../plugins/contributions/file-badges";
import { Tooltip } from "../engine/controls/Tooltip";
// The file tree's rows: a folder, which reads and lists its entries, and
// a file.

import { useFileMark } from "../registry/file-marks";
import { plural } from "../i18n/plural";
import { memo, useEffect, useMemo, useState, type CSSProperties } from "react";
import { type DirEntryInfo } from "../platform/bindings/files";
import {
  ChevronIcon,
  FolderIcon,
  FolderOpenIcon,
  MoreIcon,
} from "../engine/controls/icons";
import { fs } from "../platform/ipc";
import { useSettings } from "../prefs/SettingsContext";
import { basename, onTheWay, parentDir } from "../utils/path";
import { isMobileApp } from "../platform/capabilities";
import { useLongPress } from "../utils/hooks/useLongPress";
import { isDocumentName } from "./document-name";
import { localeOf } from "../i18n/langs";
import { compareEntries, nameCollator } from "../utils/name-order";
import { dayLabelKind, monthDay } from "./day-label";
import { countNotes } from "./note-count";
import { useTree, useTreeRowActions } from "./tree-shared";
import { useRowPicked } from "./tree-selection";
import { byModified, useFolderListing, useFolderOpen } from "./useFolder";
import { DraftRow } from "./DraftRow";
import { TreeRowsInSight } from "./TreeRowsInSight";
import type { FileOpenHow } from "./tree-shared";
import { fileIconFor } from "../engine/controls/file-icons";
import {
  folderDocumentAround,
  folderDocumentOf,
  useFolderDocumentKinds,
} from "./folder-documents";

interface DirNodeProps {
  path: string;
  depth: number;
  /** Left out by a .gitignore: shown dimmed, as the search leaves it out. */
  ignored?: boolean;
  activePath: string | null;
  onFileSelect: (path: string, how?: FileOpenHow) => void;
}

export const DirNode = memo(function DirNode({
  path,
  depth,
  ignored = false,
  activePath,
  onFileSelect,
}: DirNodeProps) {
  const tree = useTree();
  const filter = tree.filter.trim().toLocaleLowerCase();
  const version = tree.versions[path] ?? 0;
  const listing = `${version}:${tree.stale[path] ?? 0}:${tree.refreshed}`;
  const drafting = tree.draft?.dir === path ? tree.draft.kind : null;
  const [open, setOpen] = useFolderOpen({
    path,
    depth,
    activePath,
    reveal: tree.reveal,
    version,
    drafting,
  });
  const loaded = useFolderListing({ path, open, filter, listing });
  // In the file manager's order for the UI language, not byte order
  // ("第2章" before "第10章"). Folders first.
  const { settings } = useSettings();
  const collator = nameCollator(localeOf(settings.language));
  // A plugin opening folders as documents changes what its rows are; the
  // list itself is the same entries in the same order.
  const folderDocuments = useFolderDocumentKinds();
  const sorted = useMemo(() => {
    if (!loaded) return null;
    const shown = loaded.entries.filter(
      (entry) =>
        (tree.showHidden || !entry.hidden) &&
        (entry.is_dir || tree.scope === "all" || isDocumentName(entry.name)),
    );
    return shown.sort(
      (a, b) =>
        (tree.sort === "modified" && a.is_dir === b.is_dir
          ? byModified(a, b)
          : 0) || compareEntries(collator, a, b),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    loaded,
    collator,
    tree.scope,
    tree.sort,
    tree.showHidden,
    folderDocuments,
  ]);
  const filtered = filter
    ? (sorted?.filter(
        (entry) =>
          entry.is_dir || entry.name.toLocaleLowerCase().includes(filter),
      ) ?? null)
    : sorted;
  // The root's count goes up as it loads (the phone's + steps aside when
  // there is nothing yet: the empty state carries the call).
  const reportCount = tree.onRootCount;
  useEffect(() => {
    if (depth === 0 && sorted) reportCount?.(sorted.length);
  }, [depth, sorted, reportCount]);
  // Rows that must be drawn: the open document's, and the way to it.
  const onWay = onTheWay(activePath, tree.reveal);

  return (
    <div className="dir-node">
      {depth > 0 && (
        <FolderRow
          path={path}
          depth={depth}
          open={open}
          ignored={ignored}
          dropping={tree.dropInto === path}
          onToggle={() => setOpen(!open)}
        />
      )}
      {open && filtered && (
        <div className="dir-children" role={depth > 0 ? "group" : "none"}>
          {drafting && loaded && (
            <DraftRow
              kind={drafting}
              depth={depth + 1}
              entries={loaded.entries}
            />
          )}
          {loaded?.failed && (
            <div className="tx-list-note" role="status">
              {loaded?.failed}
            </div>
          )}
          {depth === 0 &&
            !loaded?.failed &&
            filtered.length === 0 &&
            !drafting &&
            (filter ? (
              // A search that found nothing: not an empty vault, only no
              // matches here.
              tree.noResults ? (
                <div className="tx-empty tree-empty tree-empty-search">
                  {tree.noResults}
                </div>
              ) : null
            ) : tree.emptyState ? (
              // The phone home's empty vault: its own quiet copy and call.
              <div className="tree-empty tree-empty-vault">
                <span className="tree-empty-glyph" aria-hidden />
                <div className="tree-empty-title">{tree.emptyState.title}</div>
                {tree.emptyState.hint && (
                  <div className="tree-empty-hint">{tree.emptyState.hint}</div>
                )}
                <button
                  type="button"
                  className="tree-empty-cta"
                  onClick={tree.emptyState.start}
                >
                  {tree.emptyState.label}
                </button>
              </div>
            ) : tree.newDocument ? (
              // Empty: a button that makes the first document.
              <div className="tx-empty tree-empty">
                <button
                  type="button"
                  className="tx-button"
                  onClick={tree.newDocument.start}
                >
                  {tree.newDocument.label}
                </button>
              </div>
            ) : null)}
          <TreeRowsInSight
            dir={path}
            entries={filtered}
            needed={(entry) => onWay(entry.path)}
            row={(entry) =>
              entry.is_dir && !folderDocumentOf(entry.name) ? (
                <DirNode
                  key={entry.path}
                  path={entry.path}
                  depth={depth + 1}
                  ignored={entry.ignored}
                  activePath={activePath}
                  onFileSelect={onFileSelect}
                />
              ) : (
                <FileNode
                  key={entry.path}
                  entry={entry}
                  depth={depth + 1}
                  active={
                    entry.path === activePath ||
                    entry.path === folderDocumentAround(activePath)
                  }
                  onSelect={onFileSelect}
                />
              )
            }
          />
        </div>
      )}
    </div>
  );
});

/** A file's row; drawn again only when what it shows changed. */
const FileNode = memo(function FileNode({
  entry,
  depth,
  active,
  onSelect,
}: {
  entry: DirEntryInfo;
  depth: number;
  active: boolean;
  onSelect: (path: string, how?: FileOpenHow) => void;
}) {
  const { t, settings } = useSettings();
  const lang = settings.language;
  const tree = useTreeRowActions();
  const picked = useRowPicked(entry.path);
  const Icon = fileIconFor(folderDocumentOf(entry.name)?.[0] ?? entry.name);
  const press = useLongPress(
    tree.onRowHold ? (at) => tree.onRowHold!(at, entry.path, false) : undefined,
  );
  const mark = useFileMark(entry.path);
  const badge = useFileBadge(entry.path);
  const changed = !!mark?.changed;
  // What Textus AI left here waiting for the writer, said after the name.
  const waiting = mark?.pending
    ? plural(t.aiPendingCount, mark.pending, lang)
    : mark?.created
      ? t.aiCreatedPending
      : null;
  // The phone board's date line (今天 / 周二 / 11-14), after the name.
  const day = dayLabelKind(entry.modified_ms, new Date());
  const dateText =
    day && entry.modified_ms
      ? day === "today"
        ? t.treeDayToday
        : day === "weekday"
          ? new Intl.DateTimeFormat(localeOf(lang), {
              weekday: "short",
            }).format(new Date(entry.modified_ms))
          : monthDay(entry.modified_ms)
      : null;
  // One row menu, opened two ways: the thumb's hold, and the board's ⋯ at
  // the line's end, which a tap finds sooner. Both go through the tree's
  // one hold entry, so the menu is the same however it came.
  const rowMenu = tree.onRowHold;
  return (
    <>
      <div
        className={`tree-row tree-row-file${active ? " tree-row-active" : ""}${picked ? " tree-row-picked" : ""}${entry.ignored ? " tree-row-ignored" : ""}`}
        role="treeitem"
        aria-level={depth}
        aria-selected={active || picked}
        data-path={entry.path}
        data-ai-changed={changed || undefined}
        // Dropped on a file, a drag goes into that file's folder.
        data-drop-dir={parentDir(entry.path) ?? undefined}
        style={{ "--depth": depth } as CSSProperties}
        onClick={(e) => {
          if (tree.onRowPick?.(e, entry.path)) return;
          if ((e.metaKey || e.ctrlKey) && tree.openInNewWindow)
            return tree.openInNewWindow(entry.path);
          // A click looks (the preview tab); a double click keeps it.
          if (!press.consumeClick()) onSelect(entry.path, "preview");
        }}
        onDoubleClick={() => onSelect(entry.path)}
        onContextMenu={
          tree.onRowMenu
            ? (e) => tree.onRowMenu!(e, entry.path, false)
            : undefined
        }
        onPointerDown={
          tree.onRowPointerDown
            ? (e) => tree.onRowPointerDown!(e, entry.path, entry.name, false)
            : undefined
        }
        {...(tree.onRowHold ? press.handlers : {})}
      >
        <Icon className="tree-icon" />
        <Tooltip text={entry.name} description={null} whenCut>
          <span className="tx-truncate tree-label">
            {/* The board marks the open document with a fire dot - "happening
               now" is the fire's only job (PhoneHome.css draws it). */}
            {isMobileApp && active && (
              <span className="tree-fdot" aria-hidden />
            )}
            {entry.name}
          </span>
        </Tooltip>
        {badge && (
          <Tooltip text={badge.tooltip ?? badge.text} description={null}>
            <span
              className={`tree-badge${badge.tone ? ` plugin-tone-${badge.tone}` : ""}`}
            >
              {badge.text}
            </span>
          </Tooltip>
        )}
        {waiting && <span className="tree-ai-waiting">{waiting}</span>}
        {isMobileApp && (
          <>
            {dateText && <span className="tree-meta">{dateText}</span>}
            <button
              type="button"
              className="tree-more"
              aria-label={t.treeRowMore}
              onClick={(e) => {
                e.stopPropagation();
                rowMenu?.({ x: e.clientX, y: e.clientY }, entry.path, false);
              }}
            >
              <MoreIcon />
            </button>
          </>
        )}
      </div>
    </>
  );
});

/** A folder row's line end (the phone board's "2 篇"): the notes under it,
 *  from the folder index the search already uses. Nothing for an empty
 *  folder — a quiet row tells the truth a glance can check. */
const FolderCount = memo(function FolderCount({ path }: { path: string }) {
  const { t, settings } = useSettings();
  const tree = useTree();
  const version = tree.versions[path] ?? 0;
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let stale = false;
    fs.indexFolder(path)
      .then((result) => {
        if (stale) return;
        const n = countNotes(result.files);
        setText(
          n > 0
            ? plural(t.treeFolderNotes, n, settings.language) +
                (result.truncated ? "+" : "")
            : null,
        );
      })
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [path, version, t, settings.language]);
  if (!text) return null;
  return <span className="tree-meta">{text}</span>;
});

/** A folder's own row: a click folds it, a right click or a held touch
 *  opens its menu, a press may start a drag. The phone adds the board's
 *  count at the line's end. */
function FolderRow({
  path,
  depth,
  open,
  ignored,
  dropping,
  onToggle,
}: {
  path: string;
  depth: number;
  open: boolean;
  ignored: boolean;
  dropping: boolean;
  onToggle: () => void;
}) {
  const tree = useTreeRowActions();
  const picked = useRowPicked(path);
  const press = useLongPress(
    tree.onRowHold ? (at) => tree.onRowHold!(at, path, true) : undefined,
  );
  return (
    <div
      className={`tree-row${dropping ? " tx-drop-into" : ""}${picked ? " tree-row-picked" : ""}${ignored ? " tree-row-ignored" : ""}`}
      role="treeitem"
      aria-level={depth}
      aria-expanded={open}
      aria-selected={picked}
      data-path={path}
      data-drop-dir={path}
      style={{ "--depth": depth } as CSSProperties}
      // A double click folds or unfolds it once, as a click does; going
      // into it is the row's menu's Show Only This Folder.
      onClick={(e) => {
        if (e.detail > 1) return;
        if (tree.onRowPick?.(e, path)) return;
        if (press.consumeClick()) return;
        onToggle();
      }}
      onContextMenu={
        tree.onRowMenu ? (e) => tree.onRowMenu!(e, path, true) : undefined
      }
      onPointerDown={
        tree.onRowPointerDown
          ? (e) => tree.onRowPointerDown!(e, path, basename(path), true)
          : undefined
      }
      {...(tree.onRowHold ? press.handlers : {})}
    >
      <ChevronIcon className={`chevron ${open ? "chevron-open" : ""}`} />
      {open ? (
        <FolderOpenIcon className="tree-icon" />
      ) : (
        <FolderIcon className="tree-icon" />
      )}
      <Tooltip text={basename(path)} description={null} whenCut>
        <span className="tx-truncate tree-label">{basename(path)}</span>
      </Tooltip>
      {isMobileApp && <FolderCount path={path} />}
    </div>
  );
}

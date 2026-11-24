import { useCallback, useState } from "react";
import { useSidebarFrame } from "./useSidebarFrame";
import { useSideToTop } from "../../engine/layout/useBarLayout";
import { Segmented } from "../../engine/controls/Segmented";
import { ContextMenu } from "../../engine/controls/ContextMenu";
import { Presence, type PresenceHandle } from "../../engine/motion/usePresence";
import { usePhoneLayout } from "../../engine/controls/usePhoneLayout";
import { ResizeHandle } from "../../engine/controls/ResizeHandle";
import { fill } from "../../i18n/fill";
import type { Strings } from "../../i18n/strings";
import type { SidebarTabId, SidebarView } from "./useSidePanels";
import type { useSidebarWidth } from "./sidebar-width";
import type { OpenFolder } from "../useOpenFolder";
import { FILE_TABS, fileTab } from "./sidebar-tabs";
import { MoreIcon, PlusIcon, SettingsIcon } from "../../engine/controls/icons";
import { emitToThisWindow } from "../../platform/menu-events";
import { TodayPanel } from "./TodayPanel";
import type { FileOpenHow } from "../../files/tree-shared";
import { fileActionEntries } from "../../files/file-actions";
import { currentTreeSort } from "../../files/tree-view-events";
import { canOpenFolder } from "../../platform/capabilities";
import { VaultButton } from "../../vaults/VaultButton";

/**
 * The left view column: the folder's name, Today and Files, and the Files
 * view's own tabs. There is no activity rail: the column is the navigation,
 * the desktop's two-column default.
 */
export function Sidebar({
  open,
  presence,
  closing,
  view,
  onViewChange,
  onCapture,
  mode,
  onModeChange,
  width,
  openFolder,
  activeTitle,
  activePath,
  activeContent,
  activeTabId,
  onClose,
  onOpenFile,
  onEntryMoved,
  searchFocusRequest,
  onSearchFocusHandled,
  t,
}: {
  open: boolean;
  presence: PresenceHandle;
  closing: boolean;
  view: SidebarView;
  onViewChange: (view: SidebarView) => void;
  /** The day's one high-frequency action, kept in the view column's row on
   *  every surface: a note to write now. */
  onCapture: () => void;
  mode: SidebarTabId;
  onModeChange: (mode: SidebarTabId) => void;
  width: ReturnType<typeof useSidebarWidth>;
  openFolder: OpenFolder;
  activeTitle: string;
  activePath: string | null;
  activeContent: string;
  activeTabId: string;
  /** The sidebar closed by its own way (a plugin page's close); the window
   *  bar's button keeps toggling it. */
  onToggle?: () => void;
  onClose: () => void;
  /** `beside`: in a split beside the document in front. */
  /** `line`: a line found in it, to go to (1-based). */
  onOpenFile: (path: string, how?: FileOpenHow, line?: number) => void;
  /** A file or folder was dragged into another folder in the tree. */
  onEntryMoved: (from: string, to: string) => void;
  /** The search shortcut asked for the Files tab's search box. */
  searchFocusRequest: boolean;
  onSearchFocusHandled: () => void;
  t: Strings;
}) {
  // The Files view's tab, or Files for one no longer there.
  const shown = fileTab(mode);
  // Under the window bar the header's line is covered: the views' header
  // takes the bar's row.
  const titleShown = useSideToTop();
  const phone = usePhoneLayout();
  const frame = useSidebarFrame(open, !phone, width.width);
  const presenceRef = presence.ref;
  const asideRef = useCallback(
    (el: HTMLElement | null) => {
      presenceRef(el);
      frame.current = el;
    },
    [presenceRef, frame],
  );
  const root = openFolder.folder ?? openFolder.treeRoot;
  const vaultName = root
    ? (root.split(/[\\/]/).filter(Boolean).pop() ?? null)
    : null;
  // The library's note count (an index label, "12+" at the cap), drawn in
  // the column's own foot.
  const [noteCount, setNoteCount] = useState<string | null>(null);
  // The file page's ⋯: its menu hangs from the button; a new file or folder
  // is asked of the tree in place, as the hidden toolbar once did.
  const [fileMenu, setFileMenu] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [draftRequest, setDraftRequest] = useState<{
    kind: "document" | "folder";
    seq: number;
  } | null>(null);
  const fileActions = root
    ? fileActionEntries({
        t,
        sort: currentTreeSort(),
        folder: openFolder.folder,
        canOpenAsFolder: canOpenFolder,
        onNew: (kind) =>
          setDraftRequest((ask) => ({ kind, seq: (ask?.seq ?? 0) + 1 })),
        onOpenAsFolder: () => openFolder.openFolder(root),
        onCloseFolder: openFolder.closeFolder,
      })
    : [];

  return (
    <aside
      ref={asideRef}
      aria-label={t.menuToggleSidebar}
      className={`sidebar ${open ? "" : "sidebar-collapsed"}`}
    >
      {/* Contents render only while open, and are inert while sliding
          away, so Tab can't land on a collapsed sidebar's buttons. */}
      {presence.mounted && (
        <>
          <div
            className="sidebar-header sidebar-views-header"
            inert={closing || undefined}
            data-tauri-drag-region={titleShown || undefined}
          >
            <VaultButton
              t={t}
              openFolder={openFolder}
              variant="sidebar"
              current={root}
              name={vaultName ?? t.menuOpenFolder}
            />
            <div className="sidebar-views">
              <Segmented
                className="sidebar-view-seg"
                label={t.menuToggleSidebar}
                equal
                value={view}
                onChange={onViewChange}
                options={[
                  { id: "today", label: t.treeDayToday },
                  { id: "files", label: t.treeTab },
                ]}
              />
              <button
                type="button"
                className="sidebar-quickadd"
                aria-label={t.todayCapture}
                title={t.todayCapture}
                onClick={onCapture}
              >
                <PlusIcon />
              </button>
            </div>
            {view === "files" ? (
              <div className="sidebar-file-row">
                <div className="sidebar-file-tabs" role="tablist">
                  {FILE_TABS.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={tab.id === shown.id}
                      data-file-tab={tab.id}
                      className={
                        "sidebar-file-tab" + (tab.id === shown.id ? " on" : "")
                      }
                      onClick={() => onModeChange(tab.id)}
                    >
                      <span className="sidebar-file-ic">
                        <tab.Icon />
                      </span>
                      <span>{tab.label(t)}</span>
                    </button>
                  ))}
                </div>
                {root ? (
                  <button
                    type="button"
                    className="sidebar-file-more"
                    aria-label={t.phoneMoreActions}
                    aria-haspopup="menu"
                    title={t.phoneMoreActions}
                    onClick={(e) => {
                      const box = e.currentTarget.getBoundingClientRect();
                      setFileMenu({ x: box.right, y: box.bottom + 2 });
                    }}
                  >
                    <MoreIcon />
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="sidebar-body" inert={closing || undefined}>
            {view === "today" ? (
              <TodayPanel
                t={t}
                activeTitle={activeTitle}
                activePath={activePath}
                openFolder={openFolder}
                onOpenFile={(path) => onOpenFile(path)}
                onCapture={onCapture}
              />
            ) : (
              <shown.Panel
                t={t}
                openFolder={openFolder}
                activePath={activePath}
                activeContent={activeContent}
                activeTabId={activeTabId}
                onOpenFile={onOpenFile}
                onClose={onClose}
                onEntryMoved={onEntryMoved}
                searchFocusRequest={searchFocusRequest}
                onSearchFocusHandled={onSearchFocusHandled}
                onNoteCount={setNoteCount}
                draftRequest={draftRequest}
              />
            )}
          </div>
          {/* The column's one foot: Settings, and the library's count when
             the Files view shows. */}
          <div className="sidebar-foot">
            <button
              type="button"
              className="sidebar-foot-settings"
              onClick={() => emitToThisWindow("menu-settings")}
            >
              <SettingsIcon />
              <span>{t.settingsTitle}</span>
            </button>
            {view === "files" && noteCount !== null ? (
              <span className="sidebar-foot-count">
                {fill(t.notesFootCount, { n: noteCount })}
              </span>
            ) : null}
          </div>
          {/* The file page's actions: the tree's hidden toolbar, in its
             header's ⋯. */}
          <Presence show={fileMenu !== null}>
            {fileMenu && (
              <ContextMenu
                x={fileMenu.x}
                y={fileMenu.y}
                alignEnd
                items={fileActions}
                onClose={() => setFileMenu(null)}
              />
            )}
          </Presence>
          {/* A phone's sidebar keeps the width the layout gives it. */}
          {!phone && (
            <ResizeHandle
              className="sidebar-resizer"
              edge="right"
              width={width.width}
              min={width.min}
              max={width.max}
              onResize={width.setWidth}
              onReset={width.resetWidth}
              label={t.sidebarResize}
            />
          )}
        </>
      )}
    </aside>
  );
}

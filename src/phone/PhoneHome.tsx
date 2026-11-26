// The phone's home: the open vault's file tree as the first surface. The
// vault name, its actions and the Today | Files segment live in the fixed
// header above it (PhonePageHeader), not in this page.
import { useEffect, useState } from "react";
import type { OpenFolder } from "../app/useOpenFolder";
import type { FileOpenHow } from "../files/tree-shared";
import type { Strings } from "../i18n/strings";
import { FileTree } from "../files/FileTree";
import { fileActionEntries } from "../files/file-actions";
import { currentTreeSort } from "../files/tree-view-events";
import { canOpenFolder } from "../platform/capabilities";
import { useAppDocumentsFolder } from "../platform/native-files";
import { emitToThisWindow } from "../platform/menu-events";
import { PHONE_PAGE_MORE_EVENT } from "../utils/events";
import {
  ContextMenu,
  type ContextMenuEntry,
} from "../engine/controls/ContextMenu";
import { CloseIcon, FolderIcon, SearchIcon } from "../engine/controls/icons";
import { Presence } from "../engine/motion/usePresence";
import { PhonePluginStatus } from "./PhonePluginStatus";
import { PhoneSyncStatus } from "./PhoneSyncStatus";
import "./PhoneHome.css";

export function PhoneHome({
  t,
  openFolder,
  activePath,
  onOpenFile,
  onNewFile,
  onEntryMoved,
}: {
  t: Strings;
  openFolder: OpenFolder;
  activePath: string | null;
  /** The library is a pushed page under Today: the way back. */
  onOpenFile: (path: string, how?: FileOpenHow, line?: number) => void;
  /** A blank document, and the page turns to it. */
  onNewFile: () => void;
  /** 记一句: the plugin's form, or a note to type in at once. */
  onEntryMoved: (from: string, to: string) => void;
}) {
  const place = openFolder.folder ?? openFolder.treeRoot ?? "";
  // The app's own Documents folder: a plain path (no SAF), which is what the
  // built-in sync can read and write on a phone.
  const appDocuments = useAppDocumentsFolder();
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => {
    const onMore = (e: Event) => {
      if ((e as CustomEvent<string>).detail === "files") setMoreOpen(true);
    };
    window.addEventListener(PHONE_PAGE_MORE_EVENT, onMore);
    return () => window.removeEventListener(PHONE_PAGE_MORE_EVENT, onMore);
  }, []);
  const [searchQuery, setSearchQuery] = useState("");
  const [draftRequest, setDraftRequest] = useState<{
    kind: "document" | "folder";
    seq: number;
  } | null>(null);
  const startNew = (kind: "document" | "folder") => {
    setMoreOpen(false);
    // With a library root, a named file is created there; without one, a
    // draft is the only place a new note can live.
    if (kind === "document" && !openFolder.treeRoot) return onNewFile();
    setDraftRequest((ask) => ({ kind, seq: (ask?.seq ?? 0) + 1 }));
  };

  // The library's ⋯: the file page's actions (the tree's hidden toolbar),
  // then the palette, which acts on the library in front. Plugins stay on
  // Today's own ⋯: the launcher is a home-wide entry, not a file action.
  const moreItems: ContextMenuEntry[] = [
    ...(openFolder.treeRoot
      ? ([
          ...fileActionEntries({
            t,
            sort: currentTreeSort(),
            folder: openFolder.folder,
            canOpenAsFolder: canOpenFolder,
            onNew: startNew,
            onOpenAsFolder: () => openFolder.openFolder(openFolder.treeRoot!),
            onCloseFolder: openFolder.closeFolder,
          }),
          "separator",
        ] as ContextMenuEntry[])
      : []),
    {
      label: t.menuCommandPalette,
      Icon: SearchIcon,
      onSelect: () => {
        void import("../app/command-palette").then((m) =>
          m.openCommandPalette(),
        );
      },
    },
  ];

  return (
    <div className="phone-home">
      <div className="ph-search" role="search">
        <SearchIcon aria-hidden="true" />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label={t.phoneSearchPlaceholder}
          placeholder={t.phoneSearchPlaceholder}
        />
        {searchQuery && (
          <button
            type="button"
            className="ph-search-clear"
            aria-label={t.phoneSearchClear}
            onClick={() => setSearchQuery("")}
          >
            <CloseIcon aria-hidden />
          </button>
        )}
      </div>
      <PhoneSyncStatus folder={place || null} t={t} />
      <PhonePluginStatus />
      <div className="ph-tree">
        {openFolder.treeRoot ? (
          <FileTree
            root={openFolder.treeRoot}
            onRootChange={openFolder.setTreeRoot}
            reveal={openFolder.revealed}
            folder={openFolder.folder}
            activePath={activePath}
            filter={searchQuery}
            emptyState={{
              title: t.phoneVaultEmptyTitle,
              hint: t.phoneVaultEmptyHint,
              label: t.menuNewFile,
              start: () => startNew("document"),
            }}
            noResults={t.phoneSearchNoResults}
            draftRequest={draftRequest}
            onOpenAsFolder={canOpenFolder ? openFolder.openFolder : undefined}
            onFileSelect={onOpenFile}
            onCloseFolder={openFolder.closeFolder}
            onEntryMoved={onEntryMoved}
          />
        ) : (
          <div className="ph-empty">
            <div className="ph-empty-glyph" aria-hidden="true">
              <FolderIcon />
            </div>
            <div className="ph-empty-title">{t.phoneHomeEmptyTitle}</div>
            <div className="ph-empty-hint">{t.phoneHomeEmptyHint}</div>
            <button
              type="button"
              className="ph-empty-cta"
              onClick={() => emitToThisWindow("menu-open-folder")}
            >
              {t.menuOpenFolder}
            </button>
            {appDocuments && (
              <button
                type="button"
                className="ph-empty-cta ph-empty-cta-quiet"
                onClick={() => openFolder.openFolder(appDocuments)}
              >
                {t.phoneUseAppDocuments}
              </button>
            )}
          </div>
        )}
      </div>
      <Presence show={moreOpen}>
        {moreOpen && (
          <ContextMenu
            x={0}
            y={0}
            title={t.phoneMoreActions}
            items={moreItems}
            onClose={() => setMoreOpen(false)}
          />
        )}
      </Presence>
    </div>
  );
}

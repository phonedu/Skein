// The phone's home: the open vault's file tree as the first surface —
// the tree, the vault name and settings in the top bar. New-document lives
// in the floating action button so the bar stays quiet like the approved
// phone board. The vault name opens the library-switcher sheet; recents
// will flow in later.
import { useState } from "react";
import type { OpenFolder } from "../app/useOpenFolder";
import type { FileOpenHow } from "../files/tree-shared";
import type { Strings } from "../i18n/strings";
import { FileTree } from "../files/FileTree";
import { canOpenFolder } from "../platform/capabilities";
import { emitToThisWindow } from "../platform/menu-events";
import {
  ActionSheet,
  type ActionSheetItem,
} from "../engine/controls/ActionSheet";
import { NewDocumentIcon, NewFolderIcon } from "../engine/controls/icons";
import { useLongPress } from "../utils/hooks/useLongPress";
import { Presence } from "../engine/motion/usePresence";
import { VaultActionIcon, OpenFolderActionIcon } from "./PhoneHomeIcons";
import "./PhoneHome.css";

const baseName = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p;

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
  onOpenFile: (path: string, how?: FileOpenHow, line?: number) => void;
  /** A blank document, and the page turns to it. */
  onNewFile: () => void;
  onEntryMoved: (from: string, to: string) => void;
}) {
  const place = openFolder.folder ?? openFolder.treeRoot ?? "";
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  // The root's entry count, as the tree loads it: over an empty library the
  // + steps aside, the empty state carrying the call (the user's rule).
  const [treeCount, setTreeCount] = useState<number | null>(null);
  const [draftRequest, setDraftRequest] = useState<{
    kind: "document" | "folder";
    seq: number;
  } | null>(null);
  const [newSheetOpen, setNewSheetOpen] = useState(false);
  // A tap makes a note; a hold asks which (the user's rule).
  const fabPress = useLongPress(() => setNewSheetOpen(true));
  const startNew = (kind: "document" | "folder") => {
    setNewSheetOpen(false);
    // With a library root, a named file is created there; without one, a
    // draft is the only place a new note can live.
    if (kind === "document" && !openFolder.treeRoot) return onNewFile();
    setDraftRequest((ask) => ({ kind, seq: (ask?.seq ?? 0) + 1 }));
  };

  // The sheet's rows: the current library (ticked), a separator, and the
  // folder picker. Recents are added here once they reach the phone.
  const vaultItems: (ActionSheetItem | "separator")[] = [
    place
      ? {
          label: baseName(place),
          sub: place,
          Icon: VaultActionIcon,
          checked: true,
          onSelect: () => {},
        }
      : {
          label: t.phoneVaultNone,
          Icon: VaultActionIcon,
          onSelect: () => {},
        },
    ...(canOpenFolder
      ? ([
          "separator",
          {
            label: t.phoneVaultOpenOther,
            Icon: OpenFolderActionIcon,
            onSelect: () => {
              void openFolder.openFolderDialog();
            },
          },
        ] as (ActionSheetItem | "separator")[])
      : []),
  ];

  return (
    <div className="phone-home">
      <div className="ph-top">
        <button
          type="button"
          className="ph-vault"
          aria-haspopup="menu"
          aria-expanded={switcherOpen}
          onClick={() => setSwitcherOpen(true)}
        >
          <span className="vic">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinejoin="round"
            >
              <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
            </svg>
          </span>
          <span className="vname">{place ? baseName(place) : t.treeTab}</span>
          <svg
            className="vchev"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M7 10l5 5 5-5" />
          </svg>
        </button>
        <div className="ph-acts">
          <button
            type="button"
            className="ph-ic"
            aria-label={t.settingsTitle}
            onClick={() => emitToThisWindow("menu-settings")}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34 1.7 1.7 0 0 0 1-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.09a1.7 1.7 0 0 0 1.56 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.56 1z" />
            </svg>
          </button>
        </div>
      </div>
      <div className="ph-search" role="search">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
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
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
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
            onRootCount={setTreeCount}
            draftRequest={draftRequest}
            onOpenAsFolder={canOpenFolder ? openFolder.openFolder : undefined}
            onFileSelect={onOpenFile}
            onCloseFolder={openFolder.closeFolder}
            onEntryMoved={onEntryMoved}
          />
        ) : (
          <div className="ph-empty">
            <div className="ph-empty-glyph" aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
              >
                <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
              </svg>
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
          </div>
        )}
      </div>
      {openFolder.treeRoot && treeCount !== 0 && (
        <button
          type="button"
          className="ph-fab"
          aria-label={t.menuNewFile}
          onClick={() => {
            if (fabPress.consumeClick()) return;
            onNewFile();
          }}
          {...fabPress.handlers}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      )}
      <Presence show={newSheetOpen}>
        {newSheetOpen && (
          <ActionSheet
            items={[
              {
                label: t.menuNewFile,
                Icon: NewDocumentIcon,
                onSelect: () => startNew("document"),
              },
              {
                label: t.treeNewFolder,
                Icon: NewFolderIcon,
                onSelect: () => startNew("folder"),
              },
            ]}
            onClose={() => setNewSheetOpen(false)}
          />
        )}
      </Presence>
      <Presence show={switcherOpen}>
        {switcherOpen && (
          <ActionSheet
            title={t.phoneVaultSwitcherTitle}
            items={vaultItems}
            onClose={() => setSwitcherOpen(false)}
          />
        )}
      </Presence>
    </div>
  );
}

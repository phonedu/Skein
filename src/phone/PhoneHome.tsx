// The phone's home: the open vault's file tree as the first surface —
// the tree, the vault name and settings in the top bar. The vault name
// opens the library-switcher sheet; recents will flow in later.
import { useEffect, useState } from "react";
import type { OpenFolder } from "../app/useOpenFolder";
import type { FileOpenHow } from "../files/tree-shared";
import type { Strings } from "../i18n/strings";
import { FileTree } from "../files/FileTree";
import { canOpenFolder } from "../platform/capabilities";
import { useAppDocumentsFolder } from "../platform/native-files";
import { emitToThisWindow } from "../platform/menu-events";
import {
  ActionSheet,
  type ActionSheetItem,
} from "../engine/controls/ActionSheet";
import {
  NewDocumentIcon,
  NewFolderIcon,
  ChevronDownIcon,
  CloseIcon,
  FolderIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
} from "../engine/controls/icons";
import { useLongPress } from "../utils/hooks/useLongPress";
import { Presence } from "../engine/motion/usePresence";
import { VaultActionIcon, OpenFolderActionIcon } from "./PhoneHomeIcons";
import { PhonePluginStatus } from "./PhonePluginStatus";
import { PhoneSyncStatus } from "./PhoneSyncStatus";
import { PhoneViewSeg } from "./PhoneViewSeg";
import "./PhoneHome.css";

const baseName = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p;

export function PhoneHome({
  t,
  openFolder,
  activePath,
  onBack,
  onOpenFile,
  onNewFile,
  newDocument,
  onNewDocument,
  onEntryMoved,
}: {
  t: Strings;
  openFolder: OpenFolder;
  activePath: string | null;
  /** The library is a pushed page under Today: the way back. */
  onBack?: () => void;
  onOpenFile: (path: string, how?: FileOpenHow, line?: number) => void;
  /** A blank document, and the page turns to it. */
  onNewFile: () => void;
  /** The shell asked for an ordinary new document (Today's capture with no
   *  collect plugin): the library's naming row opens, once. */
  newDocument?: boolean;
  onNewDocument?: () => void;
  onEntryMoved: (from: string, to: string) => void;
}) {
  const place = openFolder.folder ?? openFolder.treeRoot ?? "";
  // The app's own Documents folder: a plain path (no SAF), which is what the
  // built-in sync can read and write on a phone.
  const appDocuments = useAppDocumentsFolder();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [draftRequest, setDraftRequest] = useState<{
    kind: "document" | "folder";
    seq: number;
  } | null>(null);
  const [newSheetOpen, setNewSheetOpen] = useState(false);
  // A tap makes a note; a hold asks which (the user's rule). In the top bar,
  // never a floating button.
  const newPress = useLongPress(() => setNewSheetOpen(true));
  const startNew = (kind: "document" | "folder") => {
    setNewSheetOpen(false);
    // With a library root, a named file is created there; without one, a
    // draft is the only place a new note can live.
    if (kind === "document" && !openFolder.treeRoot) return onNewFile();
    setDraftRequest((ask) => ({ kind, seq: (ask?.seq ?? 0) + 1 }));
  };
  // Today's capture had no collect plugin to run: the naming row opens as
  // the library's own + does, so the note is a file from the first moment.
  useEffect(() => {
    if (!newDocument) return;
    onNewDocument?.();
    startNew("document");
    // The ask is consumed at once; startNew is this render's own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newDocument]);

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
            <FolderIcon />
          </span>
          <span className="vname">{place ? baseName(place) : t.treeTab}</span>
          <ChevronDownIcon className="vchev" />
        </button>
        <div className="ph-acts">
          <button
            type="button"
            className="ph-ic"
            aria-label={t.menuNewFile}
            onClick={() => {
              if (newPress.consumeClick()) return;
              onNewFile();
            }}
            {...newPress.handlers}
          >
            <PlusIcon />
          </button>
          <button
            type="button"
            className="ph-ic"
            aria-label={t.settingsTitle}
            onClick={() => emitToThisWindow("menu-settings")}
          >
            <SettingsIcon />
          </button>
        </div>
      </div>
      {onBack ? (
        <PhoneViewSeg
          t={t}
          value="files"
          onChange={(view) => view === "today" && onBack()}
        />
      ) : null}
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

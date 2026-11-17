// The phone's home: the open vault's file tree as the first surface.
// Slice 1 of the phone form (ruling 30's fork line): the tree, the vault
// name, settings and new-document in the top bar. The vault switcher
// sheet and the document actions sheet arrive in later slices.
import type { OpenFolder } from "../app/useOpenFolder";
import type { FileOpenHow } from "../files/tree-shared";
import type { Strings } from "../i18n/strings";
import { FileTree } from "../files/FileTree";
import { canOpenFolder } from "../platform/capabilities";
import { emitToThisWindow } from "../platform/menu-events";
import "./PhoneHome.css";

const baseName = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p;

export function PhoneHome({
  t,
  openFolder,
  activePath,
  onOpenFile,
  onEntryMoved,
}: {
  t: Strings;
  openFolder: OpenFolder;
  activePath: string | null;
  onOpenFile: (path: string, how?: FileOpenHow, line?: number) => void;
  onEntryMoved: (from: string, to: string) => void;
}) {
  const place = openFolder.folder ?? openFolder.treeRoot ?? "";
  return (
    <div className="phone-home">
      <div className="ph-top">
        <button type="button" className="ph-vault">
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
          <button
            type="button"
            className="ph-ic"
            aria-label={t.menuNewFile}
            onClick={() => emitToThisWindow("menu-new-file")}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
      </div>
      <div className="ph-tree">
        {openFolder.treeRoot ? (
          <FileTree
            root={openFolder.treeRoot}
            onRootChange={openFolder.setTreeRoot}
            reveal={openFolder.revealed}
            folder={openFolder.folder}
            activePath={activePath}
            onOpenAsFolder={canOpenFolder ? openFolder.openFolder : undefined}
            onFileSelect={onOpenFile}
            onCloseFolder={openFolder.closeFolder}
            onEntryMoved={onEntryMoved}
          />
        ) : (
          <button
            type="button"
            className="ph-open"
            onClick={() => emitToThisWindow("menu-open-folder")}
          >
            {t.menuOpenFolder}
          </button>
        )}
      </div>
    </div>
  );
}

// The sync page's action row and first-connect preview summary.
import { fill } from "../../i18n/fill";
import type { Strings } from "../../i18n/strings";
import type { SyncPreview, SyncStatus } from "../../platform/ipc-sync";

export interface SyncActionsProps {
  t: Strings;
  status: SyncStatus | null;
  preview: SyncPreview | null;
  busy: boolean;
  dirty: boolean;
  unsupportedRoot: boolean;
  importPlugin: () => void;
  save: () => void;
  previewRun: () => void;
  run: () => void;
  forget: () => void;
}

export function SyncActions(props: SyncActionsProps) {
  const {
    t,
    status,
    preview,
    busy,
    dirty,
    unsupportedRoot,
    importPlugin,
    save,
    previewRun,
    run,
    forget,
  } = props;
  return (
    <>
      <div className="sync-actions">
        {!status?.configured && (
          <button
            type="button"
            className="text-button settings-inline-button"
            disabled={busy || unsupportedRoot}
            onClick={() => void importPlugin()}
          >
            {t.syncImportPlugin}
          </button>
        )}
        <button
          type="button"
          className="text-button settings-inline-button"
          disabled={busy || unsupportedRoot}
          onClick={() => void save()}
        >
          {t.syncSave}
        </button>
        <button
          type="button"
          className="text-button settings-inline-button"
          disabled={busy || !status?.configured || dirty || unsupportedRoot}
          onClick={() => void previewRun()}
        >
          {t.syncPreview}
        </button>
        <button
          type="button"
          className="text-button settings-inline-button"
          disabled={busy || !status?.configured || dirty || unsupportedRoot}
          onClick={() => void run()}
        >
          {t.syncNow}
        </button>
        {status?.configured && (
          <button
            type="button"
            className="text-button settings-inline-button danger"
            disabled={busy}
            onClick={() => void forget()}
          >
            {t.syncDisconnect}
          </button>
        )}
      </div>
      {preview && (
        <div className="tx-list-note">
          {fill(t.syncPreviewSummary, {
            uploaded: preview.uploaded,
            downloaded: preview.downloaded,
            uploadBytes: preview.uploadBytes,
            downloadBytes: preview.downloadBytes,
            removedRemote: preview.removedRemote,
            removedLocal: preview.removedLocal,
            conflicts: preview.conflicts,
            moved: preview.moved,
          })}
          {preview.emptyScan ? ` ${t.syncPreviewEmptyScan}` : ""}
          {preview.bulkDelete ? ` ${t.syncPreviewBulk}` : ""}
        </div>
      )}
    </>
  );
}

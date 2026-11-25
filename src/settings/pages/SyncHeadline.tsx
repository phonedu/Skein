// The sync page's first card: this vault, whether it is syncing, the last
// run's words, and the one action that runs it. Notices about the plugin and
// a stale lock sit in the same card, not in blocks of their own.
import { fill } from "../../i18n/fill";
import type { Strings } from "../../i18n/strings";
import type {
  SyncLast,
  SyncLock,
  SyncPreview,
  SyncStatus,
} from "../../platform/ipc-sync";
import { SettingsGroup } from "./SettingsGroup";
import { folderName } from "./sync-page-model";

export interface SyncHeadlineProps {
  t: Strings;
  folderRoot: string;
  unsupportedRoot: boolean;
  note: { error: boolean; text: string } | null;
  dirty: boolean;
  statusText: string;
  last: SyncLast | null;
  status: SyncStatus | null;
  lock: SyncLock | null;
  busy: boolean;
  /** A preview request is in flight. */
  checking: boolean;
  preview: SyncPreview | null;
  configured: boolean;
  formatTime: (value: string | number) => string;
  onNew: () => void;
  onRun: () => void;
  onUnlock: () => void;
  onOpenPlugins: () => void;
}

export function SyncHeadline(props: SyncHeadlineProps) {
  const {
    t,
    folderRoot,
    unsupportedRoot,
    note,
    dirty,
    statusText,
    last,
    status,
    lock,
    busy,
    checking,
    preview,
    configured,
    formatTime,
    onNew,
    onRun,
    onUnlock,
    onOpenPlugins,
  } = props;
  // Two engines on one folder would keep separate baselines: the built-in
  // run waits until the plugin's sync for this folder is off.
  const pluginRunning = !!status?.pluginRunning;
  const failed = !!note?.error || !!last?.error;
  const kind = failed
    ? "error"
    : !configured
      ? "idle"
      : last?.result
        ? "ok"
        : "idle";
  return (
    <SettingsGroup className="sync-page sync-headline">
      <div className="settings-row sync-head-row">
        <div className="settings-row-text">
          <div className="sync-lib">{folderName(folderRoot)}</div>
          <div className="sync-path">{folderRoot}</div>
        </div>
        <div className="settings-row-control sync-head-actions">
          {configured ? (
            <button
              type="button"
              className="tx-button primary"
              disabled={
                busy || checking || dirty || unsupportedRoot || pluginRunning
              }
              onClick={onRun}
            >
              {busy ? t.syncRunning : t.syncNow}
            </button>
          ) : (
            <button
              type="button"
              className="tx-button primary"
              disabled={busy || unsupportedRoot}
              onClick={onNew}
            >
              {t.syncConnectionNew}
            </button>
          )}
        </div>
      </div>
      <div className="settings-row sync-status-row">
        <div className="settings-row-text">
          <div className="sync-status-line" data-kind={kind}>
            <span className="sync-status-text">
              <span className="sync-dot" aria-hidden />
              {checking
                ? t.syncPreviewing
                : busy
                  ? t.syncRunning
                  : (note?.text ?? statusText)}
            </span>
            {last?.at && !note && !busy ? (
              <span className="sync-last sync-last-inline">
                {fill(t.syncLast, { time: formatTime(last.at) })}
              </span>
            ) : null}
          </div>
        </div>
      </div>
      {preview && (
        <p className="tx-list-note sync-preview-note">
          <span className="sync-preview-label">{t.syncPreview}</span>
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
        </p>
      )}
      {unsupportedRoot && (
        <p className="settings-error">{t.syncMobileContentOnly}</p>
      )}
      {dirty && !note && <p className="tx-list-note">{t.syncSaveFirst}</p>}
      {pluginRunning && status.configured && (
        <div className="sync-notice" data-tone="warn">
          <span className="sync-notice-text">
            {t.syncPluginStillRunning}
            <span className="sync-notice-hint">{t.syncPluginRollback}</span>
          </span>
          <button
            type="button"
            className="text-button settings-inline-button"
            disabled={busy}
            onClick={onOpenPlugins}
          >
            {t.syncPluginOpen}
          </button>
        </div>
      )}
      {lock?.locked && (
        <div className="sync-notice">
          <span className="sync-notice-text">
            {fill(t.syncLockedAt, {
              time: lock.startedAt
                ? formatTime(lock.startedAt)
                : t.syncUnlockUnknown,
            })}
          </span>
          <button
            type="button"
            className="text-button settings-inline-button danger"
            disabled={busy || !lock.token}
            onClick={onUnlock}
          >
            {t.syncUnlock}
          </button>
        </div>
      )}
    </SettingsGroup>
  );
}

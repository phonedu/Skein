// The folder, the last run's words and the plugin/lock notices above the
// connection fields.
import { fill } from "../../i18n/fill";
import type { Strings } from "../../i18n/strings";
import type { SyncLast, SyncLock, SyncStatus } from "../../platform/ipc-sync";

export interface SyncStatusHeaderProps {
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
  unlock: () => void;
  openPlugins: () => void;
}

export function SyncStatusHeader(props: SyncStatusHeaderProps) {
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
    unlock,
    openPlugins,
  } = props;
  return (
    <>
      <p className="tx-list-note">
        {t.syncFolderLabel}: {folderRoot}
      </p>
      {unsupportedRoot && (
        <p className="settings-error">{t.syncMobileContentOnly}</p>
      )}
      <div className={note?.error ? "settings-error" : "settings-success"}>
        {note?.text ?? statusText}
        {last?.at && !note ? (
          <span className="sync-last">
            {fill(t.syncLast, {
              time: new Date(last.at).toLocaleString(),
            })}
          </span>
        ) : null}
      </div>
      {status?.pluginConfigured && status.configured && (
        <div className="sync-plugin-note">
          <p
            className={status.pluginRunning ? "settings-error" : "tx-list-note"}
          >
            {status.pluginRunning
              ? t.syncPluginStillRunning
              : t.syncPluginStopped}
          </p>
          <button
            type="button"
            className="text-button settings-inline-button"
            disabled={busy}
            onClick={openPlugins}
          >
            {t.syncPluginOpen}
          </button>
        </div>
      )}
      {status?.pluginConfigured && status.configured && (
        <p className="tx-list-note">{t.syncPluginRollback}</p>
      )}
      {dirty && !note ? (
        <p className="tx-list-note">{t.syncSaveFirst}</p>
      ) : null}
      {lock?.locked && (
        <div className="sync-lock-row">
          <span className="sync-list-text">
            {fill(t.syncLockedAt, {
              time: lock.startedAt
                ? new Date(lock.startedAt).toLocaleString()
                : t.syncUnlockUnknown,
            })}
          </span>
          <button
            type="button"
            className="text-button settings-inline-button danger"
            disabled={busy || !lock.token}
            onClick={() => void unlock()}
          >
            {t.syncUnlock}
          </button>
        </div>
      )}
    </>
  );
}

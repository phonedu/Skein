// The sync page's library list, conflict copies and cloud history.
import type { Strings } from "../../i18n/strings";
import type {
  SyncConflict,
  SyncStatus,
  SyncVault,
} from "../../platform/ipc-sync";
import { SettingsGroup } from "./SettingsGroup";
import { connectionLabel } from "./sync-page-model";

export function SyncVaults({ t, vaults }: { t: Strings; vaults: SyncVault[] }) {
  return (
    <SettingsGroup title={t.syncVaultsTitle}>
      {vaults.length === 0 ? (
        <p className="tx-list-note">{t.syncNoVaults}</p>
      ) : (
        vaults.map((vault) => (
          <div className="sync-list-row" key={vault.root}>
            <span className="sync-list-text">
              {vault.name}
              <span className="sync-last">
                {connectionLabel(vault)} → {vault.prefix || "/"}
              </span>
            </span>
          </div>
        ))
      )}
    </SettingsGroup>
  );
}

export interface SyncConflictsHistoryProps {
  t: Strings;
  status: SyncStatus | null;
  conflicts: SyncConflict[];
  historyRows: { path: string; hash: string; at: string }[];
  busy: boolean;
  onOpen: (path: string) => void;
  restore: (path: string, hash: string) => void;
}

export function SyncConflictsHistory(props: SyncConflictsHistoryProps) {
  const { t, status, conflicts, historyRows, busy, onOpen, restore } = props;
  return (
    <>
      {status?.configured && (
        <SettingsGroup title={t.syncConflictsTitle}>
          {conflicts.length === 0 ? (
            <p className="tx-list-note">{t.syncNoConflicts}</p>
          ) : (
            conflicts.map((conflict) => (
              <div className="sync-list-row" key={conflict.path}>
                <span className="sync-list-text">{conflict.path}</span>
                <button
                  type="button"
                  className="text-button settings-inline-button"
                  onClick={() => onOpen(conflict.path)}
                >
                  {t.treeOpen}
                </button>
              </div>
            ))
          )}
        </SettingsGroup>
      )}
      {status?.configured && (
        <SettingsGroup title={t.syncHistoryTitle}>
          {historyRows.length === 0 ? (
            <p className="tx-list-note">{t.syncNoHistory}</p>
          ) : (
            historyRows.map((version) => (
              <div
                className="sync-list-row"
                key={`${version.path}-${version.hash}`}
              >
                <span className="sync-list-text">
                  {version.path}
                  <span className="sync-last">
                    {new Date(version.at).toLocaleString()}
                  </span>
                </span>
                <button
                  type="button"
                  className="text-button settings-inline-button"
                  disabled={busy}
                  onClick={() => void restore(version.path, version.hash)}
                >
                  {t.syncRestore}
                </button>
              </div>
            ))
          )}
        </SettingsGroup>
      )}
    </>
  );
}

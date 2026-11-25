// The sync page's second level: conflict copies, cloud history, the synced
// vaults and disconnecting this one. Folded away until asked for, or until
// there are conflicts to show.
import { useEffect, useState } from "react";
import { fill } from "../../i18n/fill";
import type { Strings } from "../../i18n/strings";
import type {
  SyncConflict,
  SyncStatus,
  SyncVault,
} from "../../platform/ipc-sync";
import { ChevronIcon } from "../../engine/controls/icons";
import { SettingsGroup } from "./SettingsGroup";
import { connectionWhere, errorText, vaultTypeLabel } from "./sync-page-model";

export interface SyncMaintenanceProps {
  t: Strings;
  configured: boolean;
  conflicts: SyncConflict[];
  historyRows: { path: string; hash: string; at: string }[];
  vaults: SyncVault[];
  busy: boolean;
  checking: boolean;
  formatTime: (value: string | number) => string;
  onPreview: () => void;
  onOpen: (path: string) => void;
  restore: (path: string, hash: string) => void;
  onDisconnect: () => void;
}

export function SyncMaintenance(props: SyncMaintenanceProps) {
  const {
    t,
    configured,
    conflicts,
    historyRows,
    vaults,
    busy,
    checking,
    formatTime,
    onPreview,
    onOpen,
    restore,
    onDisconnect,
  } = props;
  const [open, setOpen] = useState(conflicts.length > 0);
  // A conflict that appears while the page is open should not hide in a
  // folded card.
  useEffect(() => {
    if (conflicts.length > 0) setOpen(true);
  }, [conflicts.length]);
  return (
    <details
      className="settings-advanced sync-maintenance"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <ChevronIcon className="settings-fold-chevron" />
        <span>{t.syncMaintenance}</span>
        <span
          className="sync-maintenance-counts"
          data-attention={conflicts.length > 0 ? "" : undefined}
        >
          {t.syncConflictsTitle} {conflicts.length} · {t.syncHistoryTitle} ·{" "}
          {t.syncVaultsTitle} {vaults.length}
        </span>
      </summary>
      <div className="settings-advanced-body">
        {configured && (
          <div className="sync-actions">
            <button
              type="button"
              className="text-button settings-inline-button"
              disabled={busy || checking}
              onClick={onPreview}
            >
              {checking ? t.syncPreviewing : t.syncPreview}
            </button>
          </div>
        )}
        {configured && (
          <>
            <h3 className="sync-hub-subhead">{t.syncConflictsTitle}</h3>
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
            <h3 className="sync-hub-subhead">{t.syncHistoryTitle}</h3>
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
                    <span className="sync-last">{formatTime(version.at)}</span>
                  </span>
                  <button
                    type="button"
                    className="text-button settings-inline-button"
                    disabled={busy}
                    onClick={() => restore(version.path, version.hash)}
                  >
                    {t.syncRestore}
                  </button>
                </div>
              ))
            )}
          </>
        )}
        {configured && (
          <div className="sync-actions">
            <button
              type="button"
              className="text-button settings-inline-button danger"
              disabled={busy}
              onClick={onDisconnect}
            >
              {t.syncDisconnect}
            </button>
          </div>
        )}
      </div>
    </details>
  );
}

/** The synced vaults: the method, where it goes, and its last run. */
export function SyncVaults({
  t,
  vaults,
  currentRoot,
  statuses,
  currentStatus,
  formatTime,
}: {
  t: Strings;
  vaults: SyncVault[];
  /** The vault the page is showing, marked in the list. */
  currentRoot?: string;
  /** Each vault's last run, by root; the open one may be fresher below. */
  statuses?: Record<string, SyncStatus | null>;
  currentStatus?: SyncStatus | null;
  formatTime: (value: string | number) => string;
}) {
  return (
    <SettingsGroup title={t.syncVaultsTitle} className="sync-page">
      {vaults.length === 0 ? (
        <p className="tx-list-note">{t.syncNoVaults}</p>
      ) : (
        vaults.map((vault) => {
          const status =
            (vault.root === currentRoot ? currentStatus : null) ??
            statuses?.[vault.root] ??
            undefined;
          const last = status?.last;
          const state = last?.error ? "error" : last?.result ? "ok" : "idle";
          const statusText = last?.error
            ? errorText(t, last.error)
            : last?.result
              ? fill(t.syncLast, {
                  time: last.at ? formatTime(last.at) : "",
                })
              : t.syncNever;
          return (
            <div
              className="sync-list-row"
              key={vault.root}
              aria-current={vault.root === currentRoot || undefined}
            >
              <span className="sync-vault-text">
                <span className="sync-conn-name">
                  <span className="sync-badge">{vaultTypeLabel(t, vault)}</span>
                  <span>{vault.name}</span>
                </span>
                <span className="sync-last">
                  {connectionWhere(vault)} → {vault.prefix || "/"}
                </span>
                {status?.configured && (
                  <span className="sync-vault-status" data-state={state}>
                    <span className="sync-vault-dot" aria-hidden />
                    {statusText}
                  </span>
                )}
              </span>
              {vault.root === currentRoot && (
                <span
                  className="sync-check-mark"
                  aria-label={t.syncCurrentConnection}
                >
                  ✓
                </span>
              )}
            </div>
          );
        })
      )}
    </SettingsGroup>
  );
}

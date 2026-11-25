// Where this vault syncs: the connection's type, host and prefix, with the
// two ways to change it. The fields themselves live in the connect view.
import { fill } from "../../i18n/fill";
import type { Strings } from "../../i18n/strings";
import type { SyncConnection } from "../../platform/ipc-sync";
import { SettingsGroup } from "./SettingsGroup";
import {
  connectionTypeLabel,
  connectionWhere,
  isHubConnection,
} from "./sync-page-model";

export interface SyncConnectionSummaryProps {
  t: Strings;
  connection: SyncConnection;
  /** This vault's remote folder (the binding's, not the connection's). */
  prefix: string;
  encrypted: boolean;
  onSwitch: () => void;
  onEdit: () => void;
}

export function SyncConnectionSummary(props: SyncConnectionSummaryProps) {
  const { t, connection, prefix, encrypted, onSwitch, onEdit } = props;
  const shared = connection.usedBy > 1;
  const endpointHost = (() => {
    try {
      return new URL(connection.endpoint).host;
    } catch {
      return connection.endpoint;
    }
  })();
  // A Hub connection's token comes from pairing; editing it here would only
  // break the pairing. Switching away is the way out.
  const hub = isHubConnection(connection);
  return (
    <SettingsGroup title={t.syncCurrentConnection} className="sync-page">
      <div className="settings-row">
        <div className="settings-row-text">
          <div className="sync-conn-name">
            <span className="sync-badge">
              {connectionTypeLabel(t, connection)}
            </span>
            <span className="sync-conn-where">
              {connectionWhere(connection)}
            </span>
          </div>
          <div className="sync-conn-hint">
            {[
              connection.provider === "s3" ? endpointHost : "",
              `${t.syncPrefixLabel} ${prefix || "/"}`,
              encrypted ? t.syncEncrypted : t.syncNotEncrypted,
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
        <div className="settings-row-control sync-conn-actions">
          <button type="button" className="tx-button small" onClick={onSwitch}>
            {t.syncSwitch}
          </button>
          {!hub && (
            <button type="button" className="tx-button small" onClick={onEdit}>
              {t.syncEdit}
            </button>
          )}
        </div>
      </div>
      {shared && (
        <p className="tx-list-note">
          {fill(t.syncConnectionShared, { count: connection.usedBy })}
        </p>
      )}
    </SettingsGroup>
  );
}

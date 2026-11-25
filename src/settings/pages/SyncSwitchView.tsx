// Switching this vault's connection, in place: the saved connections under
// their method, the way to a new one, and the desktop's own service. Nothing
// changes until the button at the foot; the band says what a switch does.
import { fill } from "../../i18n/fill";
import type { Strings } from "../../i18n/strings";
import type { SyncConnection } from "../../platform/ipc-sync";
import { SettingsGroup } from "./SettingsGroup";
import {
  connectionLabel,
  isHubConnection,
  type SyncConnectionType,
} from "./sync-page-model";

export interface SyncSwitchViewProps {
  t: Strings;
  connections: SyncConnection[];
  /** The vault's binding now. */
  currentId: string | null;
  /** The row picked in this view. */
  selectedId: string | null;
  mobile: boolean;
  busy: boolean;
  onSelect: (id: string) => void;
  onNew: (type: SyncConnectionType) => void;
  onService: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export function SyncSwitchView(props: SyncSwitchViewProps) {
  const {
    t,
    connections,
    currentId,
    selectedId,
    mobile,
    busy,
    onSelect,
    onNew,
    onService,
    onCancel,
    onConfirm,
  } = props;
  const groups: {
    type: SyncConnectionType;
    label: string;
    rows: SyncConnection[];
  }[] = [
    {
      type: "s3",
      label: t.syncS3Group,
      rows: connections.filter(
        (connection) =>
          connection.provider === "s3" && !isHubConnection(connection),
      ),
    },
    {
      type: "webdav",
      label: "WebDAV",
      rows: connections.filter(
        (connection) =>
          connection.provider === "webdav" && !isHubConnection(connection),
      ),
    },
    {
      type: "hub",
      label: t.syncHubTitle,
      rows: connections.filter(isHubConnection),
    },
  ];
  const row = (connection: SyncConnection) => {
    const picked = connection.id === selectedId;
    const current = connection.id === currentId;
    return (
      <button
        type="button"
        key={connection.id}
        className="settings-row sync-switch-row"
        aria-current={current || undefined}
        aria-pressed={current ? undefined : picked}
        onClick={() => onSelect(connection.id)}
      >
        {current ? (
          <span className="sync-check-mark" aria-hidden>
            ✓
          </span>
        ) : (
          <span
            className="sync-radio"
            data-on={picked || undefined}
            aria-hidden
          />
        )}
        <span className="settings-row-text">
          <span className="sync-switch-name">
            {connectionLabel(t, connection)}
          </span>
          {connection.usedBy > 1 && (
            <span className="sync-switch-sub">
              {fill(t.syncConnectionShared, { count: connection.usedBy })}
            </span>
          )}
        </span>
      </button>
    );
  };
  return (
    <SettingsGroup title={t.syncSwitchTitle} className="sync-page">
      <p className="tx-list-note">{t.syncSwitchNote}</p>
      {groups.map((group) => (
        <section
          key={group.type}
          className="sync-switch-group"
          role="group"
          aria-label={group.label}
        >
          <div className="sync-switch-group-head">
            <span className="sync-switch-group-name">{group.label}</span>
            <button
              type="button"
              className="text-button settings-inline-button sync-switch-group-new"
              disabled={busy}
              onClick={() => onNew(group.type)}
            >
              ＋ {group.type === "hub" ? t.syncJoinShort : t.syncNewShort}
            </button>
          </div>
          {group.rows.map(row)}
          {group.type === "hub" && !mobile && (
            <button
              type="button"
              className="settings-row sync-switch-link"
              onClick={onService}
            >
              <span className="settings-row-text">
                <span className="sync-switch-name">{t.syncLocalService}</span>
                <span className="sync-switch-sub">{t.syncHubIntro}</span>
              </span>
              <span className="settings-fold-chevron" aria-hidden>
                ›
              </span>
            </button>
          )}
        </section>
      ))}
      <div className="sync-panel-actions">
        <div className="sync-actions sync-form-actions">
          <span className="sync-actions-end">
            <button
              type="button"
              className="text-button settings-inline-button"
              disabled={busy}
              onClick={onCancel}
            >
              {t.cancel}
            </button>
            <button
              type="button"
              className="text-button settings-inline-button"
              disabled={busy || !selectedId || selectedId === currentId}
              onClick={onConfirm}
            >
              {t.syncSwitchTo}
            </button>
          </span>
        </div>
      </div>
    </SettingsGroup>
  );
}

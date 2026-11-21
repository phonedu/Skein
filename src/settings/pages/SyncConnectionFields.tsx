// The connection and encryption fields: what a saved connection shows and
// what a new one asks for, apart from the run's status and actions.
import { fill } from "../../i18n/fill";
import type { Strings } from "../../i18n/strings";
import type {
  SyncConfig,
  SyncConnection,
  SyncCredentials,
} from "../../platform/ipc-sync";
import { Select } from "../../engine/controls/Select";
import { MaskedKeyInput, SettingRow } from "../sections/controls";
import { EMPTY_CREDENTIALS, connectionLabel } from "./sync-page-model";

export interface SyncConnectionFieldsProps {
  t: Strings;
  config: SyncConfig;
  setConfig: (config: SyncConfig) => void;
  credentials: SyncCredentials;
  setCredentials: (credentials: SyncCredentials) => void;
  connections: SyncConnection[];
  currentConnection: SyncConnection | null;
  shared: boolean;
  editShared: boolean;
  setEditShared: (editing: boolean) => void;
  connectionPrefix: string;
  setConnectionPrefix: (prefix: string) => void;
  savedConfig: SyncConfig | null;
  saved: boolean;
  savedPassword: boolean;
  locked: boolean;
  isS3: boolean;
  chooseConnection: (id: string) => void;
}

export function SyncConnectionFields(props: SyncConnectionFieldsProps) {
  const {
    t,
    config,
    setConfig,
    credentials,
    setCredentials,
    connections,
    currentConnection,
    shared,
    editShared,
    setEditShared,
    connectionPrefix,
    setConnectionPrefix,
    savedConfig,
    saved,
    savedPassword,
    locked,
    isS3,
    chooseConnection,
  } = props;
  return (
    <>
      <SettingRow label={t.syncConnectionLabel}>
        <Select
          className="settings-select"
          aria-label={t.syncConnectionLabel}
          value={currentConnection ? currentConnection.id : ""}
          onChange={(event) => chooseConnection(event.target.value)}
        >
          <option value="">{t.syncConnectionNew}</option>
          {connections.map((connection) => (
            <option value={connection.id} key={connection.id}>
              {connectionLabel(connection)}
            </option>
          ))}
        </Select>
      </SettingRow>
      {shared && !editShared && (
        <>
          <p className="tx-list-note">
            {fill(t.syncConnectionShared, {
              count: currentConnection!.usedBy,
            })}
          </p>
          <button
            type="button"
            className="text-button settings-inline-button"
            onClick={() => {
              setConnectionPrefix(currentConnection!.prefix);
              setEditShared(true);
            }}
          >
            {t.syncConnectionEdit}
          </button>
        </>
      )}
      {shared && editShared && (
        <>
          <p className="tx-list-note">
            {fill(t.syncConnectionEditWarning, {
              count: currentConnection!.usedBy,
            })}
          </p>
          <button
            type="button"
            className="text-button settings-inline-button"
            onClick={() => {
              setEditShared(false);
              setConnectionPrefix("");
              if (savedConfig) setConfig(savedConfig);
              setCredentials(EMPTY_CREDENTIALS);
            }}
          >
            {t.cancel}
          </button>
        </>
      )}
      {shared && editShared && (
        <label className="sync-field">
          <span className="settings-field-label">
            {t.syncConnectionPrefixLabel}
          </span>
          <input
            className="settings-text-input"
            spellCheck={false}
            value={connectionPrefix}
            onChange={(event) => setConnectionPrefix(event.target.value)}
          />
        </label>
      )}
      <SettingRow label={t.syncProviderLabel}>
        <Select
          className="settings-select"
          aria-label={t.syncProviderLabel}
          value={config.provider}
          disabled={!!currentConnection && !editShared}
          onChange={(event) => {
            setConfig({
              ...config,
              provider: event.target.value as SyncConfig["provider"],
            });
            // The other provider's fields cannot be kept as this one's.
            setCredentials(EMPTY_CREDENTIALS);
          }}
        >
          <option value="webdav">{t.syncWebdav}</option>
          <option value="s3">{t.syncS3}</option>
        </Select>
      </SettingRow>
      <div className="sync-form">
        <label className="sync-field">
          <span className="settings-field-label">{t.syncEndpointLabel}</span>
          <input
            className="settings-text-input"
            type="url"
            spellCheck={false}
            placeholder="https://"
            disabled={locked}
            value={config.endpoint}
            onChange={(event) =>
              setConfig({ ...config, endpoint: event.target.value })
            }
          />
        </label>
        {isS3 && (
          <>
            <label className="sync-field">
              <span className="settings-field-label">{t.syncBucketLabel}</span>
              <input
                className="settings-text-input"
                spellCheck={false}
                disabled={locked}
                value={config.bucket}
                onChange={(event) =>
                  setConfig({ ...config, bucket: event.target.value })
                }
              />
            </label>
            <label className="sync-field">
              <span className="settings-field-label">{t.syncRegionLabel}</span>
              <input
                className="settings-text-input"
                spellCheck={false}
                disabled={locked}
                value={config.region}
                onChange={(event) =>
                  setConfig({ ...config, region: event.target.value })
                }
              />
            </label>
          </>
        )}
        <label className="sync-field">
          <span className="settings-field-label">{t.syncPrefixLabel}</span>
          <input
            className="settings-text-input"
            spellCheck={false}
            placeholder={currentConnection && !locked ? t.syncAutoPrefix : ""}
            value={config.prefix}
            onChange={(event) =>
              setConfig({ ...config, prefix: event.target.value })
            }
          />
        </label>
        {currentConnection && !config.prefix && !locked && (
          <p className="tx-list-note">{t.syncAutoPrefix}</p>
        )}
        <label className="sync-check">
          <input
            type="checkbox"
            checked={!!config.encrypted}
            disabled={!!savedConfig?.encrypted}
            onChange={(event) =>
              setConfig({ ...config, encrypted: event.target.checked })
            }
          />
          {t.syncEncryptionLabel}
        </label>
        {config.encrypted && (
          <label className="sync-field">
            <span className="settings-field-label">
              {t.syncEncryptionPasswordLabel}
            </span>
            <MaskedKeyInput
              className="settings-text-input"
              label={t.syncEncryptionPasswordLabel}
              disabled={!!savedConfig?.encrypted && savedPassword}
              placeholder={savedPassword ? t.syncSavedPlaceholder : ""}
              value={credentials.syncPassword ?? ""}
              onChange={(value) =>
                setCredentials({ ...credentials, syncPassword: value })
              }
            />
          </label>
        )}
        {config.encrypted && (
          <p className="tx-list-note">{t.syncEncryptionPasswordNote}</p>
        )}
        {savedConfig && !savedConfig.encrypted && config.encrypted && (
          <p className="tx-list-note">{t.syncEncryptionHint}</p>
        )}
        {!locked && (
          <>
            <label className="sync-field">
              <span className="settings-field-label">
                {isS3 ? t.syncAccessKeyLabel : t.syncAccountLabel}
              </span>
              <input
                className="settings-text-input"
                autoComplete="off"
                spellCheck={false}
                placeholder={saved ? t.syncSavedPlaceholder : ""}
                value={isS3 ? credentials.accessKey : credentials.username}
                onChange={(event) =>
                  setCredentials({
                    ...credentials,
                    ...(isS3
                      ? { accessKey: event.target.value }
                      : { username: event.target.value }),
                  })
                }
              />
            </label>
            <label className="sync-field">
              <span className="settings-field-label">
                {isS3 ? t.syncSecretKeyLabel : t.syncSecretLabel}
              </span>
              <MaskedKeyInput
                className="settings-text-input"
                label={isS3 ? t.syncSecretKeyLabel : t.syncSecretLabel}
                placeholder={saved ? t.syncSavedPlaceholder : ""}
                value={isS3 ? credentials.secretKey : credentials.password}
                onChange={(value) =>
                  setCredentials({
                    ...credentials,
                    ...(isS3 ? { secretKey: value } : { password: value }),
                  })
                }
              />
            </label>
          </>
        )}
        {isS3 && (
          <>
            <SettingRow label={t.syncS3FlavorLabel}>
              <Select
                className="settings-select"
                aria-label={t.syncS3FlavorLabel}
                disabled={locked}
                value={config.s3Flavor ?? "standard"}
                onChange={(event) =>
                  setConfig({
                    ...config,
                    s3Flavor: event.target.value as "standard" | "oss",
                  })
                }
              >
                <option value="standard">{t.syncS3Standard}</option>
                <option value="oss">{t.syncS3Oss}</option>
              </Select>
            </SettingRow>
            <label className="sync-check">
              <input
                type="checkbox"
                disabled={locked}
                checked={config.pathStyle}
                onChange={(event) =>
                  setConfig({ ...config, pathStyle: event.target.checked })
                }
              />
              {t.syncPathStyleLabel}
            </label>
          </>
        )}
      </div>
    </>
  );
}

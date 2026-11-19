// Settings › Sync: one folder's connection, its saved status, and the
// actions that save, run or disconnect it. Secrets are written once and
// never read back into the page; an empty field keeps the saved one.

import { useCallback, useEffect, useState } from "react";
import { fill } from "../../i18n/fill";
import {
  syncRunSaved,
  syncSettingsForget,
  syncSettingsGet,
  syncSettingsSave,
  syncStatus,
  type SyncConfig,
  type SyncCredentials,
  type SyncStatus,
} from "../../platform/ipc-sync";
import { showConfirm } from "../../engine/controls/app-dialog";
import { Select } from "../../engine/controls/Select";
import { SettingsGroup } from "./SettingsGroup";
import { MaskedKeyInput, SettingRow } from "../sections/controls";
import type { SettingsPageProps } from "./types";
import "./SyncPage.css";

const EMPTY: SyncConfig = {
  provider: "webdav",
  endpoint: "",
  bucket: "",
  prefix: "",
  region: "",
  pathStyle: true,
  keepDays: 90,
};

const EMPTY_CREDENTIALS: SyncCredentials = {
  username: "",
  password: "",
  accessKey: "",
  secretKey: "",
};

function errorText(t: SettingsPageProps["t"], reason: string): string {
  if (reason.includes("locked")) return t.syncErrorLocked;
  if (reason.includes("emptyScan")) return t.syncErrorEmpty;
  if (reason.includes("bulkDelete")) return t.syncErrorBulk;
  if (reason.includes("networkError") || reason.includes("httpError"))
    return t.syncErrorNetwork;
  if (
    reason.includes("invalidConfig") ||
    reason.includes("notConfigured") ||
    reason.includes("invalidPrefix")
  )
    return t.syncErrorConfig;
  return fill(t.syncErrorOther, { reason });
}

const folderName = (path: string) =>
  path.split(/[\\/]/).filter(Boolean).pop() ?? path;

export function SyncPage({ t, folderRoot, indexing }: SettingsPageProps) {
  const [config, setConfig] = useState<SyncConfig>(EMPTY);
  const [credentials, setCredentials] =
    useState<SyncCredentials>(EMPTY_CREDENTIALS);
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ error: boolean; text: string } | null>(
    null,
  );

  const reload = useCallback(async () => {
    if (!folderRoot || indexing) return;
    try {
      const [settings, current] = await Promise.all([
        syncSettingsGet(folderRoot),
        syncStatus(folderRoot),
      ]);
      if (settings.config) setConfig(settings.config);
      setSaved(settings.configured && !!settings.hasCredentials);
      setStatus(current);
    } catch (error) {
      setNote({ error: true, text: String(error) });
    }
  }, [folderRoot, indexing]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!folderRoot) {
    return (
      <SettingsGroup title={t.navSync}>
        <p className="tx-list-note">{t.syncNoFolder}</p>
      </SettingsGroup>
    );
  }

  const save = async () => {
    setBusy(true);
    setNote(null);
    try {
      await syncSettingsSave(folderRoot, config, credentials);
      setCredentials(EMPTY_CREDENTIALS);
      setSaved(true);
      setNote({ error: false, text: t.syncSaved });
      await reload();
    } catch (error) {
      setNote({ error: true, text: errorText(t, String(error)) });
    } finally {
      setBusy(false);
    }
  };

  const run = async (allowEmpty = false, allowBulk = false) => {
    setBusy(true);
    setNote({ error: false, text: t.syncRunning });
    try {
      await syncRunSaved(folderRoot, allowEmpty, allowBulk);
      await reload();
      setNote({ error: false, text: t.syncDone });
    } catch (error) {
      setNote({ error: true, text: errorText(t, String(error)) });
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const forget = async () => {
    const ok = await showConfirm(
      fill(t.syncDisconnectAsk, { folder: folderName(folderRoot) }),
      { danger: true, okLabel: t.syncDisconnect, cancelLabel: t.cancel },
    );
    if (!ok) return;
    setBusy(true);
    setNote(null);
    try {
      await syncSettingsForget(folderRoot);
      setConfig(EMPTY);
      setStatus(null);
      setSaved(false);
    } catch (error) {
      setNote({ error: true, text: errorText(t, String(error)) });
    } finally {
      setBusy(false);
    }
  };

  const last = status?.last;
  const statusText = !status?.configured
    ? t.syncNotConfigured
    : last?.error
      ? errorText(t, last.error)
      : last?.result
        ? t.syncDone
        : t.syncNever;
  const isS3 = config.provider === "s3";

  return (
    <>
      <SettingsGroup title={t.navSync}>
        <p className="tx-list-note">
          {t.syncFolderLabel}: {folderRoot}
        </p>
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
        <SettingRow label={t.syncProviderLabel}>
          <Select
            className="settings-select"
            aria-label={t.syncProviderLabel}
            value={config.provider}
            onChange={(event) =>
              setConfig({
                ...config,
                provider: event.target.value as SyncConfig["provider"],
              })
            }
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
              value={config.endpoint}
              onChange={(event) =>
                setConfig({ ...config, endpoint: event.target.value })
              }
            />
          </label>
          {isS3 && (
            <>
              <label className="sync-field">
                <span className="settings-field-label">
                  {t.syncBucketLabel}
                </span>
                <input
                  className="settings-text-input"
                  spellCheck={false}
                  value={config.bucket}
                  onChange={(event) =>
                    setConfig({ ...config, bucket: event.target.value })
                  }
                />
              </label>
              <label className="sync-field">
                <span className="settings-field-label">
                  {t.syncRegionLabel}
                </span>
                <input
                  className="settings-text-input"
                  spellCheck={false}
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
              value={config.prefix}
              onChange={(event) =>
                setConfig({ ...config, prefix: event.target.value })
              }
            />
          </label>
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
          {isS3 && (
            <label className="sync-check">
              <input
                type="checkbox"
                checked={config.pathStyle}
                onChange={(event) =>
                  setConfig({ ...config, pathStyle: event.target.checked })
                }
              />
              {t.syncPathStyleLabel}
            </label>
          )}
        </div>
        <div className="sync-actions">
          <button
            type="button"
            className="text-button settings-inline-button"
            disabled={busy}
            onClick={() => void save()}
          >
            {t.syncSave}
          </button>
          <button
            type="button"
            className="text-button settings-inline-button"
            disabled={busy || !status?.configured}
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
      </SettingsGroup>
    </>
  );
}

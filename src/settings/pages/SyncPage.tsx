// Settings › Sync: one folder's connection, its saved status, and the
// actions that save, run or disconnect it. Secrets are written once and
// never read back into the page; an empty field keeps the saved one.

import { useCallback, useEffect, useState } from "react";
import { fill } from "../../i18n/fill";
import {
  syncConflicts,
  syncHistory,
  syncLock,
  syncRestore,
  syncRunSaved,
  syncSettingsForget,
  syncSettingsGet,
  syncSettingsSave,
  syncConnectionUpdate,
  syncStatus,
  syncUnlock,
  syncVaults,
  type SyncConfig,
  type SyncConflict,
  type SyncConnection,
  type SyncCredentials,
  type SyncHistory,
  type SyncLock,
  type SyncStatus,
  type SyncVault,
} from "../../platform/ipc-sync";
import { showConfirm } from "../../engine/controls/app-dialog";
import { Select } from "../../engine/controls/Select";
import { SettingsGroup } from "./SettingsGroup";
import { MaskedKeyInput, SettingRow } from "../sections/controls";
import type { SettingsPageProps } from "./types";
import "./SyncPage.css";

const EMPTY: SyncConfig = {
  connectionId: "",
  provider: "webdav",
  endpoint: "",
  bucket: "",
  prefix: "",
  region: "",
  pathStyle: true,
  s3Flavor: "standard",
  keepDays: 90,
};

const EMPTY_CREDENTIALS: SyncCredentials = {
  username: "",
  password: "",
  accessKey: "",
  secretKey: "",
};

function errorText(t: SettingsPageProps["t"], reason: string): string {
  if (reason.includes("remoteMissing")) return t.syncErrorRemote;
  if (reason.includes("lockLost")) return t.syncErrorLockLost;
  if (reason.includes("locked")) return t.syncErrorLocked;
  if (reason.includes("invalidHistory")) return t.syncErrorHistory;
  if (reason.includes("integrityError") || reason.includes("missingBlock"))
    return t.syncErrorIntegrity;
  if (reason.includes("conditionalWriteUnsupported"))
    return t.syncErrorConditional;
  if (reason.includes("repositoryInUse")) return t.syncErrorRepository;
  if (reason.includes("fileOpen")) return t.syncErrorFileOpen;
  if (reason.includes("notFound")) return t.syncErrorVersionGone;
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

type ConnectionRef = Pick<
  SyncConnection,
  "provider" | "endpoint" | "bucket" | "prefix"
>;

function connectionLabel(connection: ConnectionRef): string {
  let where = connection.bucket;
  if (connection.provider === "webdav") {
    try {
      where = new URL(connection.endpoint).host;
    } catch {
      where = connection.endpoint;
    }
  }
  const base = connection.prefix ? ` · ${connection.prefix}` : "";
  return `${connection.provider === "s3" ? "S3" : "WebDAV"} · ${where || connection.endpoint}${base}`;
}

export function SyncPage({
  t,
  folderRoot,
  openPaths,
  indexing,
  onOpenFile,
}: SettingsPageProps) {
  const [config, setConfig] = useState<SyncConfig>(EMPTY);
  const [credentials, setCredentials] =
    useState<SyncCredentials>(EMPTY_CREDENTIALS);
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [savedConfig, setSavedConfig] = useState<SyncConfig | null>(null);
  const [connections, setConnections] = useState<SyncConnection[]>([]);
  const [vaults, setVaults] = useState<SyncVault[]>([]);
  const [editShared, setEditShared] = useState(false);
  const [lock, setLock] = useState<SyncLock | null>(null);
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [history, setHistory] = useState<SyncHistory | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ error: boolean; text: string } | null>(
    null,
  );

  const reload = useCallback(async () => {
    // The library list is global, so it loads even with no folder open.
    void syncVaults()
      .then(setVaults)
      .catch(() => {});
    if (!folderRoot || indexing) return;
    try {
      const [settings, current] = await Promise.all([
        syncSettingsGet(folderRoot),
        syncStatus(folderRoot),
      ]);
      setConfig(settings.config ?? EMPTY);
      setCredentials(EMPTY_CREDENTIALS);
      setConnections(settings.connections ?? []);
      setSavedConfig(settings.config ?? null);
      setSaved(settings.configured && !!settings.hasCredentials);
      setStatus(current);
      const [foundLock, foundConflicts, foundHistory] = await Promise.all([
        settings.configured
          ? syncLock(folderRoot).catch(() => null)
          : Promise.resolve(null),
        syncConflicts(folderRoot).catch(() => []),
        syncHistory(folderRoot).catch(() => null),
      ]);
      setLock(foundLock);
      setConflicts(foundConflicts);
      setHistory(foundHistory);
    } catch (error) {
      setNote({ error: true, text: String(error) });
    }
  }, [folderRoot, indexing]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const vaultsGroup = (
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

  if (!folderRoot) {
    return (
      <>
        <SettingsGroup title={t.navSync}>
          <p className="tx-list-note">{t.syncNoFolder}</p>
        </SettingsGroup>
        {vaultsGroup}
      </>
    );
  }

  const currentConnection =
    connections.find((connection) => connection.id === config.connectionId) ??
    null;
  const shared = !!currentConnection && currentConnection.usedBy > 1;
  const locked = shared && !editShared;

  const chooseConnection = (id: string) => {
    setEditShared(false);
    if (!id) {
      setConfig({
        ...EMPTY,
        keepDays: config.keepDays,
        keepChosen: config.keepChosen,
      });
      setCredentials(EMPTY_CREDENTIALS);
      return;
    }
    const connection = connections.find((candidate) => candidate.id === id);
    if (!connection) return;
    if (savedConfig?.connectionId === id) {
      setConfig(savedConfig);
    } else {
      setConfig({
        connectionId: id,
        provider: connection.provider,
        endpoint: connection.endpoint,
        bucket: connection.bucket,
        prefix: "",
        region: connection.region,
        pathStyle: connection.pathStyle,
        s3Flavor: connection.s3Flavor ?? "standard",
        keepDays: config.keepDays,
        keepChosen: config.keepChosen,
      });
    }
    setCredentials(EMPTY_CREDENTIALS);
  };

  const save = async () => {
    setBusy(true);
    setNote(null);
    try {
      if (shared && editShared && currentConnection) {
        await syncConnectionUpdate(
          currentConnection.id,
          { ...config, prefix: currentConnection.prefix },
          credentials,
        );
        setEditShared(false);
      }
      await syncSettingsSave(
        folderRoot,
        {
          ...config,
          keepChosen:
            config.keepChosen ||
            (savedConfig ? savedConfig.keepDays !== config.keepDays : false),
        },
        shared ? EMPTY_CREDENTIALS : credentials,
      );
      setCredentials(EMPTY_CREDENTIALS);
      setEditShared(false);
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
      await syncRunSaved(folderRoot, allowEmpty, allowBulk, openPaths);
      await reload();
      setNote({ error: false, text: t.syncDone });
    } catch (error) {
      const reason = String(error);
      const retry = async (empty: boolean, bulk: boolean) => {
        const ok = await showConfirm(errorText(t, reason), {
          okLabel: t.syncContinue,
          cancelLabel: t.cancel,
        });
        if (ok) await run(empty, bulk);
      };
      if (reason.includes("emptyScan")) {
        await retry(true, allowBulk);
      } else if (reason.includes("bulkDelete")) {
        await retry(allowEmpty, true);
      } else {
        setNote({ error: true, text: errorText(t, reason) });
      }
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

  const unlock = async () => {
    if (!lock?.token) return;
    const ok = await showConfirm(
      fill(t.syncUnlockAsk, {
        time: lock.startedAt
          ? new Date(lock.startedAt).toLocaleString()
          : t.syncUnlockUnknown,
      }),
      { danger: true, okLabel: t.syncUnlock, cancelLabel: t.cancel },
    );
    if (!ok) return;
    setBusy(true);
    setNote(null);
    try {
      await syncUnlock(folderRoot, lock.token);
      setNote({ error: false, text: t.syncUnlocked });
      await reload();
    } catch (error) {
      setNote({ error: true, text: errorText(t, String(error)) });
    } finally {
      setBusy(false);
    }
  };

  const fullPath = (relative: string) =>
    `${folderRoot.replace(/[\\/]$/, "")}/${relative}`;

  const restore = async (path: string, hash: string) => {
    setBusy(true);
    setNote(null);
    try {
      const restored = await syncRestore(folderRoot, path, hash, openPaths);
      await reload();
      setNote({
        error: false,
        text: fill(t.syncRestored, { path: restored.path }),
      });
      onOpenFile?.(fullPath(restored.path));
    } catch (error) {
      setNote({ error: true, text: errorText(t, String(error)) });
    } finally {
      setBusy(false);
    }
  };

  const last = status?.last;
  const dirty =
    !!savedConfig &&
    (JSON.stringify(savedConfig) !== JSON.stringify(config) ||
      credentials.username !== "" ||
      credentials.password !== "" ||
      credentials.accessKey !== "" ||
      credentials.secretKey !== "");
  const summary = last?.result
    ? fill(t.syncSummary, {
        uploaded: last.result.uploaded,
        downloaded: last.result.downloaded,
        removed: last.result.removed,
        conflicts: last.result.conflicts.length,
      })
    : "";
  const statusText = !status?.configured
    ? t.syncNotConfigured
    : last?.error
      ? errorText(t, last.error)
      : last?.result
        ? [
            t.syncDone,
            summary,
            last.result.deferred.length
              ? fill(t.syncDeferred, { count: last.result.deferred.length })
              : "",
          ]
            .filter(Boolean)
            .join(" ")
        : t.syncNever;
  const isS3 = config.provider === "s3";
  const historyRows = history
    ? Object.entries(history.versions)
        .flatMap(([path, versions]) =>
          versions.slice(0, 3).map((version) => ({ path, ...version })),
        )
        .slice(0, 40)
    : [];

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
                count: currentConnection.usedBy,
              })}
            </p>
            <button
              type="button"
              className="text-button settings-inline-button"
              onClick={() => setEditShared(true)}
            >
              {t.syncConnectionEdit}
            </button>
          </>
        )}
        {shared && editShared && (
          <>
            <p className="tx-list-note">
              {fill(t.syncConnectionEditWarning, {
                count: currentConnection.usedBy,
              })}
            </p>
            <button
              type="button"
              className="text-button settings-inline-button"
              onClick={() => {
                setEditShared(false);
                if (savedConfig) setConfig(savedConfig);
                setCredentials(EMPTY_CREDENTIALS);
              }}
            >
              {t.cancel}
            </button>
          </>
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
                <span className="settings-field-label">
                  {t.syncBucketLabel}
                </span>
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
                <span className="settings-field-label">
                  {t.syncRegionLabel}
                </span>
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
            disabled={busy || !status?.configured || dirty}
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
                  onClick={() => onOpenFile?.(fullPath(conflict.path))}
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
      {vaultsGroup}
    </>
  );
}

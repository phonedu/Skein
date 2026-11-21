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
  syncPreview,
  syncSettingsForget,
  syncSettingsGet,
  syncSettingsSave,
  syncConnectionUpdate,
  syncForkVault,
  syncPluginImport,
  syncStatus,
  syncUnlock,
  syncVaults,
  type SyncConfig,
  type SyncConflict,
  type SyncConnection,
  type SyncCredentials,
  type SyncHistory,
  type SyncLock,
  type SyncPreview,
  type SyncStatus,
  type SyncVault,
} from "../../platform/ipc-sync";
import { showConfirm } from "../../engine/controls/app-dialog";
import { Select } from "../../engine/controls/Select";
import { isMobileApp } from "../../platform/capabilities";
import { resolvedDocumentPath } from "../../platform/documents-path";
import { useAppDocumentsFolder } from "../../platform/native-files";
import { getUiState } from "../../storage/ui-state";
import { SHOW_SIDEBAR_TAB_EVENT, sendAppEvent } from "../../utils/events";
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
  encrypted: true,
};

const EMPTY_CREDENTIALS: SyncCredentials = {
  username: "",
  password: "",
  accessKey: "",
  secretKey: "",
  syncPassword: "",
};

function errorText(t: SettingsPageProps["t"], reason: string): string {
  if (reason.includes("vaultCopied")) return t.syncErrorVaultCopied;
  if (reason.includes("pluginNotFound")) return t.syncImportNotFound;
  if (reason.includes("alreadyConfigured")) return t.syncImportAlready;
  if (reason.includes("syncPasswordRequired"))
    return t.syncErrorEncryptionPassword;
  if (
    reason.includes("invalidSyncPassword") ||
    reason.includes("encryptedDataInvalid")
  )
    return t.syncErrorEncryptionWrong;
  if (reason.includes("encryptionChanged")) return t.syncErrorEncryptionChanged;
  if (reason.includes("legacyRemote")) return t.syncErrorLegacyRemote;
  if (reason.includes("encryptionMetadataMissing"))
    return t.syncErrorEncryptionMissing;
  if (reason.includes("alreadyRunning") || reason.includes("busy"))
    return t.syncErrorBusy;
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
  folderRoot: givenFolderRoot,
  openPaths,
  indexing,
  onOpenFile,
  onClose,
  openPage,
}: SettingsPageProps) {
  // The phone's home shows its own Documents when no folder was picked; the
  // page it opens from there gets no folder prop, so it syncs that folder.
  const appDocuments = useAppDocumentsFolder();
  // The settings sheet's own copy of the folder can lag behind the phone's
  // home; the stored open folder is the one the tree is showing.
  const storedFolder = isMobileApp ? getUiState("openFolder") : null;
  const phoneFolder =
    typeof storedFolder === "string" && storedFolder
      ? resolvedDocumentPath(storedFolder, appDocuments ?? "")
      : appDocuments;
  const folderRoot = isMobileApp
    ? (phoneFolder ?? givenFolderRoot)
    : givenFolderRoot;
  // A picked folder the app reads through a content:// grant can't be read
  // by the sync engine's plain paths. A plain path (the app's Documents, or
  // a folder the user gave the app access to) works.
  const unsupportedRoot =
    isMobileApp && !!folderRoot && folderRoot.startsWith("content://");
  const [config, setConfig] = useState<SyncConfig>(EMPTY);
  const [credentials, setCredentials] =
    useState<SyncCredentials>(EMPTY_CREDENTIALS);
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [savedConfig, setSavedConfig] = useState<SyncConfig | null>(null);
  const [connections, setConnections] = useState<SyncConnection[]>([]);
  const [vaults, setVaults] = useState<SyncVault[]>([]);
  const [editShared, setEditShared] = useState(false);
  const [connectionPrefix, setConnectionPrefix] = useState("");
  const [lock, setLock] = useState<SyncLock | null>(null);
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [history, setHistory] = useState<SyncHistory | null>(null);
  const [preview, setPreview] = useState<SyncPreview | null>(null);
  const [saved, setSaved] = useState(false);
  const [savedPassword, setSavedPassword] = useState(false);
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
      setSavedPassword(!!settings.hasEncryptionPassword);
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
    setConnectionPrefix("");
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
        encrypted: config.encrypted,
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
          connectionPrefix,
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
        shared
          ? {
              ...EMPTY_CREDENTIALS,
              syncPassword: credentials.syncPassword ?? "",
            }
          : credentials,
      );
      setCredentials(EMPTY_CREDENTIALS);
      setEditShared(false);
      setSaved(true);
      setNote({ error: false, text: t.syncSaved });
      await reload();
    } catch (error) {
      const reason = String(error);
      if (reason.includes("vaultCopied")) {
        const ok = await showConfirm(t.syncVaultCopiedAsk, {
          okLabel: t.syncVaultFork,
          cancelLabel: t.cancel,
        });
        if (!ok) return;
        try {
          await syncForkVault(folderRoot);
          await save();
        } catch (forkError) {
          setNote({ error: true, text: errorText(t, String(forkError)) });
        }
        return;
      }
      setNote({ error: true, text: errorText(t, reason) });
    } finally {
      setBusy(false);
    }
  };

  const importPlugin = async () => {
    const ok = await showConfirm(t.syncImportPluginAsk, {
      okLabel: t.syncImportPlugin,
      cancelLabel: t.cancel,
    });
    if (!ok) return;
    setBusy(true);
    setNote(null);
    try {
      await syncPluginImport(folderRoot);
      await reload();
      setNote({ error: false, text: t.syncImported });
    } catch (error) {
      setNote({ error: true, text: errorText(t, String(error)) });
    } finally {
      setBusy(false);
    }
  };

  const previewRun = async () => {
    setBusy(true);
    setNote(null);
    setPreview(null);
    try {
      setPreview(await syncPreview(folderRoot));
    } catch (error) {
      setNote({ error: true, text: errorText(t, String(error)) });
    } finally {
      setBusy(false);
    }
  };

  const openPlugins = () => {
    if (isMobileApp) {
      openPage("extensions");
      return;
    }
    sendAppEvent(SHOW_SIDEBAR_TAB_EVENT, "plugins");
    onClose?.();
  };

  const run = async (allowEmpty = false, allowBulk = false) => {
    // A manual run is allowed while the plugin is on (the remote lock still
    // serializes it), but not silently: both engines keep their own base.
    if (!allowEmpty && !allowBulk && status?.pluginRunning) {
      const ok = await showConfirm(t.syncPluginRunAsk, {
        okLabel: t.syncContinue,
        cancelLabel: t.cancel,
      });
      if (!ok) return;
    }
    setBusy(true);
    setPreview(null);
    setNote({ error: false, text: t.syncRunning });
    try {
      await syncRunSaved(folderRoot, allowEmpty, allowBulk, openPaths);
      await reload();
      // The reloaded status carries the summary and the deferred count.
      setNote(null);
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
      credentials.secretKey !== "" ||
      (credentials.syncPassword ?? "") !== "");
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
              className={
                status.pluginRunning ? "settings-error" : "tx-list-note"
              }
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
              onClick={() => {
                setConnectionPrefix(currentConnection.prefix);
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
                count: currentConnection.usedBy,
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

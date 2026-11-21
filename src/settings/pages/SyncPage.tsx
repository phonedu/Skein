// Settings › Sync: one folder's connection, its saved status, and the
// actions that save, run or disconnect it. Secrets are written once and
// never read back into the page; an empty field keeps the saved one.

import { useCallback, useEffect } from "react";
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
} from "../../platform/ipc-sync";
import { showConfirm } from "../../engine/controls/app-dialog";
import { isMobileApp } from "../../platform/capabilities";
import { resolvedDocumentPath } from "../../platform/documents-path";
import { useAppDocumentsFolder } from "../../platform/native-files";
import { getUiState } from "../../storage/ui-state";
import { SHOW_SIDEBAR_TAB_EVENT, sendAppEvent } from "../../utils/events";
import { SettingsGroup } from "./SettingsGroup";
import { SyncConnectionFields } from "./SyncConnectionFields";
import { SyncActions } from "./SyncActions";
import { SyncConflictsHistory, SyncVaults } from "./SyncSections";
import { SyncStatusHeader } from "./SyncStatusHeader";
import type { SettingsPageProps } from "./types";
import {
  EMPTY_CONFIG,
  EMPTY_CREDENTIALS,
  errorText,
  folderName,
  syncStatusText,
} from "./sync-page-model";
import {
  useSyncConnectionState,
  useSyncHistoryState,
  useSyncUiState,
} from "./useSyncPageState";
import "./SyncPage.css";

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
  const {
    config,
    setConfig,
    credentials,
    setCredentials,
    connections,
    setConnections,
    vaults,
    setVaults,
    savedConfig,
    setSavedConfig,
    saved,
    setSaved,
    savedPassword,
    setSavedPassword,
  } = useSyncConnectionState();
  const {
    status,
    setStatus,
    editShared,
    setEditShared,
    connectionPrefix,
    setConnectionPrefix,
    busy,
    setBusy,
    note,
    setNote,
    preview,
    setPreview,
  } = useSyncUiState();
  const { lock, setLock, conflicts, setConflicts, history, setHistory } =
    useSyncHistoryState();

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
      setConfig(settings.config ?? EMPTY_CONFIG);
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
  }, [
    folderRoot,
    indexing,
    setConfig,
    setCredentials,
    setConnections,
    setSavedConfig,
    setSaved,
    setSavedPassword,
    setStatus,
    setLock,
    setConflicts,
    setHistory,
    setNote,
    setVaults,
  ]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!folderRoot) {
    return (
      <>
        <SettingsGroup title={t.navSync}>
          <p className="tx-list-note">{t.syncNoFolder}</p>
        </SettingsGroup>
        <SyncVaults t={t} vaults={vaults} />
      </>
    );
  }

  const currentConnection =
    connections.find((connection) => connection.id === config.connectionId) ??
    null;
  const shared = !!currentConnection && currentConnection.usedBy > 1;

  const chooseConnection = (id: string) => {
    setEditShared(false);
    setConnectionPrefix("");
    if (!id) {
      setConfig({
        ...EMPTY_CONFIG,
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
      setConfig(EMPTY_CONFIG);
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
  const statusText = syncStatusText(t, status, last);
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
        <SyncStatusHeader
          t={t}
          folderRoot={folderRoot}
          unsupportedRoot={unsupportedRoot}
          note={note}
          dirty={dirty}
          statusText={statusText}
          last={last ?? null}
          status={status}
          lock={lock}
          busy={busy}
          unlock={() => void unlock()}
          openPlugins={openPlugins}
        />
        <SyncConnectionFields
          t={t}
          config={config}
          setConfig={setConfig}
          credentials={credentials}
          setCredentials={setCredentials}
          connections={connections}
          currentConnection={currentConnection}
          shared={shared}
          editShared={editShared}
          setEditShared={setEditShared}
          connectionPrefix={connectionPrefix}
          setConnectionPrefix={setConnectionPrefix}
          savedConfig={savedConfig}
          saved={saved}
          savedPassword={savedPassword}
          locked={shared && !editShared}
          isS3={isS3}
          chooseConnection={chooseConnection}
        />
        <SyncActions
          t={t}
          status={status}
          preview={preview}
          busy={busy}
          dirty={dirty}
          unsupportedRoot={unsupportedRoot}
          importPlugin={importPlugin}
          save={save}
          previewRun={previewRun}
          run={run}
          forget={forget}
        />
      </SettingsGroup>
      <SyncConflictsHistory
        t={t}
        status={status}
        conflicts={conflicts}
        historyRows={historyRows}
        busy={busy}
        onOpen={(path) => onOpenFile?.(fullPath(path))}
        restore={(path, hash) => void restore(path, hash)}
      />
      <SyncVaults t={t} vaults={vaults} />
    </>
  );
}

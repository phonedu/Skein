// The sync page's actions: save the binding (and preview what the next run
// would do), import from the plugin, run, preview, unlock, forget and
// restore. The page keeps which view is open; this keeps what the buttons do.
import type { Dispatch, SetStateAction } from "react";
import { fill } from "../../i18n/fill";
import type { Strings } from "../../i18n/strings";
import {
  syncPluginImport,
  syncPreview,
  syncRestore,
  syncRunSaved,
  syncSettingsForget,
  syncSettingsSave,
  syncConnectionUpdate,
  syncForkVault,
  syncUnlock,
  type SyncConfig,
  type SyncConnection,
  type SyncCredentials,
  type SyncLock,
  type SyncPreview,
  type SyncStatus,
} from "../../platform/ipc-sync";
import { showConfirm } from "../../engine/controls/app-dialog";
import {
  EMPTY_CONFIG,
  EMPTY_CREDENTIALS,
  errorText,
  folderName,
} from "./sync-page-model";

export interface SyncActionsOptions {
  t: Strings;
  folderRoot: string;
  config: SyncConfig;
  credentials: SyncCredentials;
  savedConfig: SyncConfig | null;
  currentConnection: SyncConnection | null;
  shared: boolean;
  editShared: boolean;
  status: SyncStatus | null;
  lock: SyncLock | null;
  openPaths: string[];
  onOpenFile?: (path: string) => void;
  reload: () => Promise<void>;
  setConfig: Dispatch<SetStateAction<SyncConfig>>;
  setCredentials: Dispatch<SetStateAction<SyncCredentials>>;
  setStatus: Dispatch<SetStateAction<SyncStatus | null>>;
  setSaved: Dispatch<SetStateAction<boolean>>;
  setEditShared: Dispatch<SetStateAction<boolean>>;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setChecking: Dispatch<SetStateAction<boolean>>;
  setNote: Dispatch<SetStateAction<{ error: boolean; text: string } | null>>;
  setPreview: Dispatch<SetStateAction<SyncPreview | null>>;
}

export function useSyncActions(options: SyncActionsOptions) {
  const {
    t,
    folderRoot,
    config,
    credentials,
    savedConfig,
    currentConnection,
    shared,
    editShared,
    status,
    lock,
    openPaths,
    onOpenFile,
    reload,
    setConfig,
    setCredentials,
    setStatus,
    setSaved,
    setEditShared,
    setBusy,
    setChecking,
    setNote,
    setPreview,
  } = options;

  const save = async (): Promise<boolean> => {
    setBusy(true);
    setNote(null);
    try {
      if (shared && editShared && currentConnection) {
        await syncConnectionUpdate(
          currentConnection.id,
          config,
          credentials,
          null,
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
      return true;
    } catch (error) {
      const reason = String(error);
      if (reason.includes("vaultCopied")) {
        const ok = await showConfirm(t.syncVaultCopiedAsk, {
          okLabel: t.syncVaultFork,
          cancelLabel: t.cancel,
        });
        if (!ok) return false;
        try {
          await syncForkVault(folderRoot);
          return await save();
        } catch (forkError) {
          setNote({ error: true, text: errorText(t, String(forkError)) });
          return false;
        }
      }
      setNote({ error: true, text: errorText(t, reason) });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const importPlugin = async (): Promise<boolean> => {
    const ok = await showConfirm(t.syncImportPluginAsk, {
      okLabel: t.syncImportPlugin,
      cancelLabel: t.cancel,
    });
    if (!ok) return false;
    setBusy(true);
    setNote(null);
    try {
      await syncPluginImport(folderRoot);
      await reload();
      setNote({ error: false, text: t.syncImported });
      return true;
    } catch (error) {
      setNote({ error: true, text: errorText(t, String(error)) });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const previewRun = async (): Promise<void> => {
    setChecking(true);
    setNote(null);
    setPreview(null);
    try {
      setPreview(await syncPreview(folderRoot));
    } catch (error) {
      setNote({ error: true, text: errorText(t, String(error)) });
    } finally {
      setChecking(false);
    }
  };

  const run = async (allowEmpty = false, allowBulk = false): Promise<void> => {
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

  const forget = async (): Promise<boolean> => {
    const ok = await showConfirm(
      fill(t.syncDisconnectAsk, { folder: folderName(folderRoot) }),
      { danger: true, okLabel: t.syncDisconnect, cancelLabel: t.cancel },
    );
    if (!ok) return false;
    setBusy(true);
    setNote(null);
    try {
      await syncSettingsForget(folderRoot);
      setConfig(EMPTY_CONFIG);
      setStatus(null);
      setSaved(false);
      return true;
    } catch (error) {
      setNote({ error: true, text: errorText(t, String(error)) });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const unlock = async (): Promise<void> => {
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

  const restore = async (path: string, hash: string): Promise<void> => {
    setBusy(true);
    setNote(null);
    try {
      const restored = await syncRestore(folderRoot, path, hash, openPaths);
      await reload();
      setNote({
        error: false,
        text: fill(t.syncRestored, { path: restored.path }),
      });
      onOpenFile?.(`${folderRoot.replace(/[\\/]$/, "")}/${restored.path}`);
    } catch (error) {
      setNote({ error: true, text: errorText(t, String(error)) });
    } finally {
      setBusy(false);
    }
  };

  return { save, importPlugin, previewRun, run, forget, unlock, restore };
}

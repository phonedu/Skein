// The sync page's data: the connection draft, the run's state and the
// conflict/history lists, loaded and reloaded together.
import { useCallback, useEffect, useState } from "react";
import {
  syncConflicts,
  syncHistory,
  syncLock,
  syncSettingsGet,
  syncStatus,
  syncVaults,
  type SyncStatus,
} from "../../platform/ipc-sync";
import { EMPTY_CONFIG, EMPTY_CREDENTIALS } from "./sync-page-model";
import {
  useSyncConnectionState,
  useSyncHistoryState,
  useSyncUiState,
} from "./useSyncPageState";

export function useSyncPageData(folderRoot: string | null, indexing: boolean) {
  const connection = useSyncConnectionState();
  const ui = useSyncUiState();
  const history = useSyncHistoryState();
  // Each vault's last run, for the list; the open one is also in `ui.status`.
  const [vaultStatuses, setVaultStatuses] = useState<
    Record<string, SyncStatus | null>
  >({});
  const {
    setConfig,
    setCredentials,
    setConnections,
    setVaults,
    setSavedConfig,
    setSaved,
    setSavedPassword,
  } = connection;
  const { setStatus, setNote } = ui;
  const { setLock, setConflicts, setHistory } = history;

  const reload = useCallback(async () => {
    // The library list is global, so it loads even with no folder open.
    void syncVaults()
      // A host that answers nothing (a preview without the engine) leaves
      // it empty rather than null.
      .then(async (list) => {
        const found = Array.isArray(list) ? list : [];
        setVaults(found);
        const entries = await Promise.all(
          found.map(async (vault) => {
            try {
              return [vault.root, await syncStatus(vault.root)] as const;
            } catch {
              return [vault.root, null] as const;
            }
          }),
        );
        setVaultStatuses(Object.fromEntries(entries));
      })
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
    setVaultStatuses,
  ]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { ...connection, ...ui, ...history, vaultStatuses, reload };
}

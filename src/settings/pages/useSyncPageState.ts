// The sync page's state, split by what owns it: the connection form, the
// run's status and its conflict/history lists.
import { useState } from "react";
import type {
  SyncConflict,
  SyncConnection,
  SyncCredentials,
  SyncHistory,
  SyncLock,
  SyncPreview,
  SyncStatus,
  SyncVault,
  SyncConfig,
} from "../../platform/ipc-sync";
import { EMPTY_CONFIG, EMPTY_CREDENTIALS } from "./sync-page-model";

export function useSyncConnectionState() {
  const [config, setConfig] = useState<SyncConfig>(EMPTY_CONFIG);
  const [credentials, setCredentials] =
    useState<SyncCredentials>(EMPTY_CREDENTIALS);
  const [connections, setConnections] = useState<SyncConnection[]>([]);
  const [vaults, setVaults] = useState<SyncVault[]>([]);
  const [savedConfig, setSavedConfig] = useState<SyncConfig | null>(null);
  const [saved, setSaved] = useState(false);
  const [savedPassword, setSavedPassword] = useState(false);
  return {
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
  };
}

export function useSyncUiState() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [editShared, setEditShared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState<{ error: boolean; text: string } | null>(
    null,
  );
  const [preview, setPreview] = useState<SyncPreview | null>(null);
  return {
    status,
    setStatus,
    editShared,
    setEditShared,
    busy,
    setBusy,
    checking,
    setChecking,
    note,
    setNote,
    preview,
    setPreview,
  };
}

export function useSyncHistoryState() {
  const [lock, setLock] = useState<SyncLock | null>(null);
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [history, setHistory] = useState<SyncHistory | null>(null);
  return {
    lock,
    setLock,
    conflicts,
    setConflicts,
    history,
    setHistory,
  };
}

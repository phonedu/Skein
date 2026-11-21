// The built-in sync's commands. Settings keeps the connection per folder and
// the backend stores the secrets apart from it; these wrappers only move JSON.

import { commands } from "./bindings/files";

export interface SyncConfig {
  /** The connection this vault binds to; empty or "new" makes one. */
  connectionId?: string;
  provider: "webdav" | "s3";
  endpoint: string;
  bucket: string;
  prefix: string;
  region: string;
  pathStyle: boolean;
  /** `standard` uses If-None-Match; `oss` uses x-oss-forbid-overwrite. */
  s3Flavor?: "standard" | "oss";
  keepDays: number;
  /** Whether this device chose keepDays; only then does it replace the folder's. */
  keepChosen?: boolean;
  /** Whether this vault's repository is end-to-end encrypted. */
  encrypted?: boolean;
  /** Local vault identity; the encryption password is keyed by it. */
  vaultId?: string;
}

export interface SyncCredentials {
  username: string;
  password: string;
  accessKey: string;
  secretKey: string;
  /** Per-vault encryption password; never a connection credential. */
  syncPassword?: string;
}

interface SyncResult {
  revision: string;
  uploaded: number;
  downloaded: number;
  removed: number;
  moved: number;
  conflicts: string[];
  deferred: string[];
  unchanged: number;
  identityReassigned?: string[];
}

export interface SyncLast {
  at: string;
  result?: SyncResult | null;
  error?: string | null;
}

export interface SyncConnection {
  id: string;
  provider: "webdav" | "s3";
  endpoint: string;
  bucket: string;
  region: string;
  pathStyle: boolean;
  s3Flavor?: "standard" | "oss";
  prefix: string;
  usedBy: number;
  hasCredentials: boolean;
  current: boolean;
}

export interface SyncVault {
  root: string;
  name: string;
  connectionId: string;
  provider: "webdav" | "s3";
  endpoint: string;
  bucket: string;
  prefix: string;
}

export interface SyncSettings {
  configured: boolean;
  config?: SyncConfig;
  hasCredentials?: boolean;
  hasEncryptionPassword?: boolean;
  connections?: SyncConnection[];
}

export interface SyncStatus {
  configured: boolean;
  last?: SyncLast | null;
  /** The Cloud Sync plugin still holds a connection for this folder. */
  pluginConfigured?: boolean;
  /** …and is switched on: the two syncs would write different bases. */
  pluginRunning?: boolean;
}

export interface SyncPreview {
  uploaded: number;
  downloaded: number;
  removedRemote: number;
  removedLocal: number;
  conflicts: number;
  moved: number;
  unchanged: number;
  uploadBytes: number;
  downloadBytes: number;
  emptyScan: boolean;
  bulkDelete: boolean;
}

export interface SyncReply {
  result: SyncResult;
  base: unknown;
}

const parse = <T>(json: string): T => JSON.parse(json) as T;

export const syncSettingsGet = (root: string): Promise<SyncSettings> =>
  commands.sync_settings_get(root).then((json) => parse<SyncSettings>(json));

export const syncSettingsSave = (
  root: string,
  config: SyncConfig,
  credentials: SyncCredentials,
): Promise<void> =>
  commands
    .sync_settings_save(
      root,
      JSON.stringify(config),
      JSON.stringify(credentials),
    )
    .then(() => undefined);

export const syncConnectionUpdate = (
  connectionId: string,
  config: SyncConfig,
  credentials: SyncCredentials,
  defaultPrefix: string | null = null,
): Promise<{ changed: boolean; vaults: number }> =>
  commands
    .sync_connection_update(
      connectionId,
      JSON.stringify(config),
      JSON.stringify(credentials),
      defaultPrefix,
    )
    .then((json) => parse<{ changed: boolean; vaults: number }>(json));

export interface PluginImport {
  provider: "webdav" | "s3";
  prefix: string;
  encrypted: boolean;
  files: number;
}

export const syncPluginImport = (root: string): Promise<PluginImport> =>
  commands.sync_plugin_import(root).then((json) => parse<PluginImport>(json));

export const syncForkVault = (root: string): Promise<void> =>
  commands.sync_fork_vault(root).then(() => undefined);

export const syncSettingsForget = (root: string): Promise<void> =>
  commands.sync_settings_forget(root).then(() => undefined);

export const syncVaults = (): Promise<SyncVault[]> =>
  commands.sync_vaults().then((json) => parse<SyncVault[]>(json));

export const syncStatus = (root: string): Promise<SyncStatus> =>
  commands.sync_status(root).then((json) => parse<SyncStatus>(json));

export interface SyncLock {
  locked: boolean;
  startedAt?: string;
  /** The lock's exact bytes; unlocking passes them back. */
  token?: string;
}

export const syncLock = (root: string): Promise<SyncLock> =>
  commands.sync_lock(root).then((json) => parse<SyncLock>(json));

export const syncUnlock = (
  root: string,
  token: string,
): Promise<{ state: "unlocked" | "noLock" }> =>
  commands
    .sync_unlock(root, token)
    .then((json) => parse<{ state: "unlocked" | "noLock" }>(json));

export const syncPreview = (root: string): Promise<SyncPreview> =>
  commands.sync_preview(root).then((json) => parse<SyncPreview>(json));

export const syncRunSaved = (
  root: string,
  allowEmptyScan = false,
  allowBulkDelete = false,
  openPaths: string[] = [],
): Promise<SyncReply> =>
  commands
    .sync_run_saved(root, allowEmptyScan, allowBulkDelete, openPaths)
    .then((json) => parse<SyncReply>(json));

export interface SyncConflict {
  path: string;
  name: string;
  size: number;
  modifiedMs?: number | null;
}

interface SyncHistoryVersion {
  hash: string;
  size: number;
  at: string;
  device?: string | null;
  until?: string | null;
}

export interface SyncHistory {
  format: string;
  current: Record<string, { at: string; device?: string | null }>;
  versions: Record<string, SyncHistoryVersion[]>;
  head?: string | null;
  previous?: string | null;
  keep: { days: number; at: string };
}

export const syncConflicts = (root: string): Promise<SyncConflict[]> =>
  commands.sync_conflicts(root).then((json) => parse<SyncConflict[]>(json));

export const syncHistory = (root: string): Promise<SyncHistory | null> =>
  commands.sync_history(root).then((json) => parse<SyncHistory | null>(json));

export const syncRestore = (
  root: string,
  path: string,
  hash: string,
  openPaths: string[] = [],
): Promise<{ path: string }> =>
  commands
    .sync_restore(root, path, hash, openPaths)
    .then((json) => parse<{ path: string }>(json));

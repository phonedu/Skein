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
}

export interface SyncCredentials {
  username: string;
  password: string;
  accessKey: string;
  secretKey: string;
}

export interface SyncResult {
  revision: string;
  uploaded: number;
  downloaded: number;
  removed: number;
  moved: number;
  conflicts: string[];
  deferred: string[];
  unchanged: number;
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

export interface SyncSettings {
  configured: boolean;
  config?: SyncConfig;
  hasCredentials?: boolean;
  connections?: SyncConnection[];
}

export interface SyncStatus {
  configured: boolean;
  last?: SyncLast | null;
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

export const syncSettingsForget = (root: string): Promise<void> =>
  commands.sync_settings_forget(root).then(() => undefined);

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

export interface SyncHistoryVersion {
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

// The built-in sync's commands. Settings keeps the connection per folder and
// the backend stores the secrets apart from it; these wrappers only move JSON.

import { commands } from "./bindings/files";

export interface SyncConfig {
  provider: "webdav" | "s3";
  endpoint: string;
  bucket: string;
  prefix: string;
  region: string;
  pathStyle: boolean;
  keepDays: number;
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

export interface SyncSettings {
  configured: boolean;
  config?: SyncConfig;
  hasCredentials?: boolean;
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

export const syncRunSaved = (
  root: string,
  allowEmptyScan = false,
  allowBulkDelete = false,
): Promise<SyncReply> =>
  commands
    .sync_run_saved(root, allowEmptyScan, allowBulkDelete)
    .then((json) => parse<SyncReply>(json));

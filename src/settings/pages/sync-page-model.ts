// The sync page's values that are not state: its empty form, its error
// words and the two labels a connection shows by.
import { fill } from "../../i18n/fill";
import type {
  SyncConfig,
  SyncConnection,
  SyncCredentials,
  SyncLast,
  SyncStatus,
} from "../../platform/ipc-sync";
import type { SettingsPageProps } from "./types";

export const EMPTY_CONFIG: SyncConfig = {
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

export const EMPTY_CREDENTIALS: SyncCredentials = {
  username: "",
  password: "",
  accessKey: "",
  secretKey: "",
  syncPassword: "",
};

export function errorText(t: SettingsPageProps["t"], reason: string): string {
  if (reason.includes("identityFork")) return t.syncErrorIdentityFork;
  if (reason.includes("identityConflict")) return t.syncErrorIdentityConflict;
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

export const folderName = (path: string) =>
  path.split(/[\\/]/).filter(Boolean).pop() ?? path;

type ConnectionRef = Pick<
  SyncConnection,
  "provider" | "endpoint" | "bucket" | "prefix"
>;

export function connectionLabel(connection: ConnectionRef): string {
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

export function syncStatusText(
  t: SettingsPageProps["t"],
  status: SyncStatus | null,
  last: SyncLast | null | undefined,
): string {
  const summary = last?.result
    ? fill(t.syncSummary, {
        uploaded: last.result.uploaded,
        downloaded: last.result.downloaded,
        removed: last.result.removed,
        conflicts: last.result.conflicts.length,
      })
    : "";
  const reassigned = last?.result?.identityReassigned?.length ?? 0;
  return !status?.configured
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
            reassigned
              ? `· ${fill(t.syncReassigned, { count: reassigned })}`
              : "",
          ]
            .filter(Boolean)
            .join(" ")
        : t.syncNever;
}

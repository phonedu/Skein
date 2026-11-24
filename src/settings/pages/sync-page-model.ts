// The sync page's values that are not state: its empty form, its error
// words and the two labels a connection shows by.
import { fill } from "../../i18n/fill";
import type {
  SyncConfig,
  SyncConnection,
  SyncCredentials,
  SyncLast,
  SyncStatus,
  SyncVault,
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
  // Encryption is off in the basic form; the advanced fold offers it.
  encrypted: false,
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
  if (reason.includes("unsupportedRegion")) return t.syncErrorRegion;
  if (reason.includes("noLanAddress")) return t.syncHubNoAddress;
  if (reason.includes("portInUse")) return t.syncHubPortBusy;
  if (reason.includes("invalidCode")) return t.syncHubErrorCode;
  if (reason.includes("expired")) return t.syncHubErrorExpired;
  if (reason.includes("tooManyAttempts")) return t.syncHubErrorTooMany;
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

/** The three ways a vault connects; "hub" is WebDAV to a local Hub. */
export type SyncConnectionType = "webdav" | "s3" | "hub";

/** A connection to a local-network Hub: its endpoint is the desktop's
 *  `/hub/<id>`, with no bucket. */
export function isHubConnection(
  connection: Pick<SyncConnection, "id" | "provider" | "endpoint">,
): boolean {
  return (
    connection.id.startsWith("hub-") ||
    (connection.provider === "webdav" &&
      /\/hub\/[^/]+\/?$/.test(connection.endpoint.trim()))
  );
}

/** What an S3 endpoint's host says about its provider and region: the
 *  flavours Textus knows by name, and the region in them. Anything else is
 *  left to the fields, so an unknown provider still works as standard S3. */
export function s3DefaultsFromEndpoint(endpoint: string): {
  region?: string;
  s3Flavor?: "oss" | "kodo";
  pathStyle?: boolean;
} {
  let host: string;
  try {
    host = new URL(endpoint.trim()).hostname.toLowerCase();
  } catch {
    return {};
  }
  let match = host.match(/^s3[.-]([a-z0-9-]+)\.qiniucs\.com$/);
  if (match) return { region: match[1], s3Flavor: "kodo" };
  match = host.match(/^oss-([a-z0-9-]+)\.aliyuncs\.com$/);
  if (match) return { region: match[1], s3Flavor: "oss" };
  match = host.match(/^s3[.-]([a-z0-9-]+)\.amazonaws\.com(\.cn)?$/);
  // AWS prefers virtual-hosted buckets; the S3-compatible providers Textus
  // knows by name address the bucket in the path.
  if (match) return { region: match[1], pathStyle: false };
  return {};
}

/** The type's word in a badge: S3, WebDAV or the Hub's own name. */
export function connectionTypeLabel(
  t: SettingsPageProps["t"],
  connection: Pick<SyncConnection, "id" | "provider" | "endpoint">,
): string {
  if (isHubConnection(connection)) return t.syncHubTitle;
  return connection.provider === "s3" ? "S3" : "WebDAV";
}

/** A synced vault's method in a badge: its binding's connection type. */
export function vaultTypeLabel(
  t: SettingsPageProps["t"],
  vault: Pick<SyncVault, "connectionId" | "provider" | "endpoint">,
): string {
  const hub =
    vault.connectionId.startsWith("hub-") ||
    (vault.provider === "webdav" &&
      /\/hub\/[^/]+\/?$/.test(vault.endpoint.trim()));
  if (hub) return t.syncHubTitle;
  return vault.provider === "s3" ? "S3" : "WebDAV";
}

/** Where a connection points, without the prefix: the host or the bucket. */
export function connectionWhere(connection: ConnectionRef): string {
  if (connection.provider === "s3") {
    return connection.bucket || connection.endpoint;
  }
  try {
    return new URL(connection.endpoint).host;
  } catch {
    return connection.endpoint;
  }
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

/** The one-time payload a desktop Hub's QR code carries. The prefix keeps
 *  an unrelated QR code from being read as a pairing request. */
export const HUB_PAIR_PREFIX = "TEXTUS-HUB-PAIR/1";

export interface HubPairPayload {
  address: string;
  code: string;
  repoId: string;
}

export function parseHubPairPayload(text: string): HubPairPayload | null {
  if (!text.startsWith(HUB_PAIR_PREFIX)) return null;
  try {
    const value = JSON.parse(text.slice(HUB_PAIR_PREFIX.length).trim()) as {
      address?: unknown;
      code?: unknown;
      repoId?: unknown;
    };
    if (
      typeof value.address !== "string" ||
      typeof value.code !== "string" ||
      typeof value.repoId !== "string" ||
      value.code.length !== 6 ||
      !value.address.startsWith("http://")
    ) {
      return null;
    }
    return {
      address: value.address,
      code: value.code,
      repoId: value.repoId,
    };
  } catch {
    return null;
  }
}

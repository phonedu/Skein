// A connection's required fields only: its service-specific address (or
// Kodo's region) and the credentials that service asks for. The remote
// folder, the provider and the S3 compatibility are decided by the app;
// encryption is the one choice kept under Advanced.
import { fill } from "../../i18n/fill";
import type { Strings } from "../../i18n/strings";
import type { SyncConfig, SyncCredentials } from "../../platform/ipc-sync";
import { ChevronIcon } from "../../engine/controls/icons";
import { InfoTip } from "../../engine/controls/InfoTip";
import { MaskedKeyInput } from "../sections/controls";
import {
  BITIFUL_ENDPOINT,
  BITIFUL_REGION,
  KODO_REGIONS,
  isBitifulEndpoint,
  isKodoRegion,
  kodoEndpoint,
  kodoRegionLabel,
  s3DefaultsFromEndpoint,
  s3ProviderOf,
  type S3Provider,
} from "./sync-page-model";

export interface SyncConnectionFieldsProps {
  t: Strings;
  config: SyncConfig;
  setConfig: (config: SyncConfig) => void;
  credentials: SyncCredentials;
  setCredentials: (credentials: SyncCredentials) => void;
  savedConfig: SyncConfig | null;
  saved: boolean;
  savedPassword: boolean;
  locked: boolean;
  /** How many vaults share this connection (only meaningful when editing). */
  sharedCount: number;
}

export function SyncConnectionFields(props: SyncConnectionFieldsProps) {
  const {
    t,
    config,
    setConfig,
    credentials,
    setCredentials,
    savedConfig,
    saved,
    savedPassword,
    locked,
    sharedCount,
  } = props;
  const isS3 = config.provider === "s3";
  const provider = s3ProviderOf(config) ?? "standard";
  const isKodo = provider === "kodo";
  const isBitiful = provider === "bitiful";

  // A standard S3 address says which service and region it is; what it
  // implies is filled in, not asked. Kodo has no address field (below).
  const changeEndpoint = (endpoint: string) => {
    const next = { ...config, endpoint };
    if (isS3) {
      const derived = s3DefaultsFromEndpoint(endpoint);
      if (derived.s3Flavor === "kodo") {
        // Pasting a Qiniu address switches to Kodo; keep only a region
        // that Kodo's picker can show, and let the region decide the
        // address that is saved.
        const region = isKodoRegion(config.region)
          ? config.region
          : (derived.region ?? "");
        next.s3Flavor = "kodo";
        next.region = region;
        next.endpoint = region ? kodoEndpoint(region) : "";
        next.pathStyle = true;
      } else if (isBitifulEndpoint(endpoint)) {
        // Bitiful is one address and one region; the address wins over any
        // region typed for another service.
        next.s3Flavor = "standard";
        next.region = BITIFUL_REGION;
        next.pathStyle = true;
      } else {
        if (derived.region && !config.region.trim())
          next.region = derived.region;
        if (derived.s3Flavor) next.s3Flavor = derived.s3Flavor;
        if (derived.pathStyle !== undefined) next.pathStyle = derived.pathStyle;
      }
    }
    setConfig(next);
  };

  // The service decides which fields exist: Kodo has no address (the region
  // makes it), Bitiful has a fixed address and region, and standard S3 / OSS
  // take the address the user was given. A provider change drops the address
  // that belonged to the old one.
  const changeProvider = (next: S3Provider) => {
    if (next === "kodo") {
      const region = isKodoRegion(config.region) ? config.region : "";
      setConfig({
        ...config,
        s3Flavor: "kodo",
        region,
        endpoint: region ? kodoEndpoint(region) : "",
        pathStyle: true,
      });
      return;
    }
    if (next === "bitiful") {
      setConfig({
        ...config,
        s3Flavor: "standard",
        endpoint: BITIFUL_ENDPOINT,
        region: BITIFUL_REGION,
        pathStyle: true,
      });
      return;
    }
    setConfig({ ...config, s3Flavor: next, endpoint: "", region: "" });
  };

  const changeKodoRegion = (region: string) => {
    setConfig({
      ...config,
      region,
      endpoint: region ? kodoEndpoint(region) : "",
      pathStyle: true,
    });
  };

  return (
    <>
      {sharedCount > 1 && (
        <p className="tx-list-note">
          {fill(t.syncConnectionEditWarning, { count: sharedCount })}
        </p>
      )}
      <div className="sync-form">
        {isS3 && (
          <label className="sync-field">
            <span className="settings-field-label">{t.syncS3FlavorLabel}</span>
            <select
              className="settings-text-input"
              disabled={locked}
              value={provider}
              onChange={(event) =>
                changeProvider(event.target.value as S3Provider)
              }
            >
              <option value="standard">{t.syncS3Standard}</option>
              <option value="bitiful">{t.syncS3Bitiful}</option>
              <option value="oss">{t.syncS3Oss}</option>
              <option value="kodo">{t.syncS3Kodo}</option>
            </select>
          </label>
        )}
        {isS3 && (
          <div className="sync-form-help">
            <InfoTip label={fill(t.infoTipLabel, { label: t.syncS3HelpLabel })}>
              {t.syncS3Help}
            </InfoTip>
            <span className="sync-form-help-text">{t.syncS3ProvidersHint}</span>
          </div>
        )}
        {isBitiful && <p className="sync-form-hint">{t.syncS3BitifulFixed}</p>}
        {!isKodo && (
          <label className="sync-field">
            <span className="settings-field-label">{t.syncEndpointLabel}</span>
            <input
              className="settings-text-input"
              type="url"
              spellCheck={false}
              placeholder="https://"
              disabled={locked || isBitiful}
              value={config.endpoint}
              onChange={(event) => changeEndpoint(event.target.value)}
            />
          </label>
        )}
        {isS3 && (
          <>
            <label className="sync-field">
              <span className="settings-field-label">{t.syncBucketLabel}</span>
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
            {isKodo ? (
              <div className="sync-field">
                <span className="settings-field-label">
                  {t.syncRegionLabel}
                </span>
                <div className="sync-kodo-region">
                  <select
                    className="settings-text-input"
                    aria-label={t.syncRegionLabel}
                    disabled={locked}
                    value={config.region}
                    onChange={(event) => changeKodoRegion(event.target.value)}
                  >
                    <option value="">{t.syncRegionChoose}</option>
                    {KODO_REGIONS.map((region) => (
                      <option key={region.id} value={region.id}>
                        {kodoRegionLabel(t, region.id)} ({region.id})
                      </option>
                    ))}
                  </select>
                  <span className="tx-list-note">
                    {config.region
                      ? kodoEndpoint(config.region)
                      : t.syncKodoNote}
                  </span>
                </div>
              </div>
            ) : (
              <label className="sync-field">
                <span className="settings-field-label">
                  {t.syncRegionLabel}
                </span>
                <input
                  className="settings-text-input"
                  spellCheck={false}
                  disabled={locked || isBitiful}
                  value={config.region}
                  onChange={(event) =>
                    setConfig({ ...config, region: event.target.value })
                  }
                />
              </label>
            )}
          </>
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
      </div>
      <details className="settings-fold sync-advanced">
        <summary className="settings-row">
          <span className="settings-row-label">{t.syncAdvanced}</span>
          {config.encrypted && (
            <span className="sync-advanced-tag">{t.syncEncrypted}</span>
          )}
          <ChevronIcon className="settings-fold-chevron" />
        </summary>
        <div className="settings-fold-body">
          <label className="sync-check">
            <input
              type="checkbox"
              className="ui-check"
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
        </div>
      </details>
    </>
  );
}

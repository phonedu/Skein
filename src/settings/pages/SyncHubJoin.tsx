// Joining a local-network Hub: the phone pairs by finding it or scanning
// the desktop's code; the desktop types the address and code it was shown.
import { useState } from "react";
import { createPortal } from "react-dom";
import type { Strings } from "../../i18n/strings";
import {
  hubDiscover,
  hubPair,
  syncSettingsSave,
  type HubAnnouncement,
} from "../../platform/ipc-sync";
import { SyncScan } from "./SyncScan";
import { errorText, parseHubPairPayload } from "./sync-page-model";

export interface SyncHubJoinProps {
  t: Strings;
  root: string;
  mobile: boolean;
  /** This folder cannot be synced by the engine (a content:// grant). */
  disabled?: boolean;
  /** The vault is bound to the Hub now. */
  onPaired: () => void;
}

export function SyncHubJoin({
  t,
  root,
  mobile,
  disabled = false,
  onPaired,
}: SyncHubJoinProps) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ error: boolean; text: string } | null>(
    null,
  );
  const [join, setJoin] = useState({ address: "", code: "" });
  const [found, setFound] = useState<HubAnnouncement[]>([]);
  const [discovering, setDiscovering] = useState(false);
  // Choosing the Hub on a phone is a request to scan: the code travels in
  // the QR. Cancel leaves the manual address and code as the fallback.
  const [scanning, setScanning] = useState(mobile);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setNote(null);
    try {
      await work();
    } catch (error) {
      const reason = String(error);
      setNote({
        error: true,
        text: reason.includes("networkError")
          ? t.syncHubErrorNetwork
          : errorText(t, reason),
      });
    } finally {
      setBusy(false);
    }
  };

  const pairWith = (address: string, code: string) =>
    run(async () => {
      const paired = await hubPair(
        address.trim(),
        code.trim(),
        t.syncHubThisDevice,
      );
      await syncSettingsSave(
        root,
        {
          connectionId: "new",
          provider: "webdav",
          endpoint: `${address.trim().replace(/\/+$/, "")}/hub/${paired.repoId}`,
          bucket: "",
          prefix: "",
          region: "",
          pathStyle: false,
          s3Flavor: "standard",
          keepDays: 90,
          encrypted: false,
        },
        {
          username: paired.username,
          password: paired.token,
          accessKey: "",
          secretKey: "",
          syncPassword: "",
        },
      );
      setJoin((current) => ({ ...current, code: "" }));
      onPaired();
    });

  const discover = () =>
    run(async () => {
      setDiscovering(true);
      try {
        const list = await hubDiscover();
        setFound(list);
        if (list.length === 0) {
          setNote({ error: true, text: t.syncHubNoFound });
        }
      } finally {
        setDiscovering(false);
      }
    });

  const scanned = (content: string) => {
    setScanning(false);
    const payload = parseHubPairPayload(content);
    if (!payload) {
      setNote({ error: true, text: t.syncHubScanInvalid });
      return;
    }
    setJoin({ address: payload.address, code: payload.code });
    void pairWith(payload.address, payload.code);
  };

  const scanFailed = (error: unknown) => {
    setScanning(false);
    const reason = String(error).toLowerCase();
    setNote({
      error: true,
      text:
        reason.includes("permission") || reason.includes("denied")
          ? t.syncHubScanPermission
          : t.syncHubScanFailed,
    });
  };

  return (
    <>
      <p className="tx-list-note">{t.syncHubJoinIntro}</p>
      {note && (
        <p className={note.error ? "settings-error" : "settings-success"}>
          {note.text}
        </p>
      )}
      {mobile && (
        <div className="sync-actions">
          <button
            type="button"
            className="text-button settings-inline-button"
            disabled={busy || disabled || discovering}
            onClick={() => void discover()}
          >
            {discovering ? t.syncHubDiscovering : t.syncHubDiscover}
          </button>
          <button
            type="button"
            className="text-button settings-inline-button"
            disabled={busy || disabled || scanning}
            onClick={() => {
              setNote(null);
              setScanning(true);
            }}
          >
            {scanning ? t.syncHubScanning : t.syncHubScan}
          </button>
        </div>
      )}
      {found.length > 0 && (
        <div className="sync-hub-found">
          {found.map((hub) => (
            <button
              type="button"
              key={`${hub.address}-${hub.repoId}`}
              className="sync-hub-found-row"
              onClick={() =>
                setJoin((current) => ({
                  ...current,
                  address: hub.address,
                  code: "",
                }))
              }
            >
              <span className="sync-list-text">{hub.name}</span>
              <span className="sync-last">
                {hub.address} · {hub.source}
              </span>
            </button>
          ))}
        </div>
      )}
      <label className="sync-field">
        <span className="settings-field-label">{t.syncHubAddress}</span>
        <input
          className="settings-text-input"
          type="url"
          spellCheck={false}
          placeholder="http://192.168.1.10:7419"
          value={join.address}
          onChange={(event) =>
            setJoin((current) => ({ ...current, address: event.target.value }))
          }
        />
      </label>
      <label className="sync-field">
        <span className="settings-field-label">{t.syncHubCode}</span>
        <input
          className="settings-text-input"
          inputMode="numeric"
          maxLength={6}
          value={join.code}
          onChange={(event) =>
            setJoin((current) => ({ ...current, code: event.target.value }))
          }
        />
      </label>
      <div className="sync-actions">
        <button
          type="button"
          className="tx-button primary sync-join-submit"
          disabled={
            busy ||
            disabled ||
            !join.address.trim() ||
            join.code.trim().length !== 6
          }
          onClick={() => void pairWith(join.address, join.code)}
        >
          {t.syncHubPair}
        </button>
      </div>
      {scanning &&
        createPortal(
          <SyncScan
            t={t}
            onCode={scanned}
            onCancel={() => setScanning(false)}
            onError={scanFailed}
          />,
          document.body,
        )}
    </>
  );
}

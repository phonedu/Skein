// Settings › Sync › Local network Hub: start the desktop's WebDAV repository,
// show the one-time code and paired devices, or join another Hub from a phone.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { fill } from "../../i18n/fill";
import type { Strings } from "../../i18n/strings";
import {
  hubBind,
  hubClear,
  hubCode,
  hubDiscover,
  hubPair,
  hubPairingQr,
  hubRevoke,
  hubStart,
  hubStatus,
  hubStop,
  syncSettingsSave,
  type HubAnnouncement,
  type HubReply,
} from "../../platform/ipc-sync";
import { showConfirm } from "../../engine/controls/app-dialog";
import { CopyIcon } from "../../engine/controls/icons";
import { SyncScan } from "./SyncScan";
import { SettingsGroup } from "./SettingsGroup";
import { errorText, parseHubPairPayload } from "./sync-page-model";

export interface SyncHubProps {
  t: Strings;
  root: string;
  mobile: boolean;
  reload: () => Promise<void>;
}

export function SyncHub({ t, root, mobile, reload }: SyncHubProps) {
  const [reply, setReply] = useState<HubReply>({
    running: false,
    lanAddresses: [],
  });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ error: boolean; text: string } | null>(
    null,
  );
  const [readOnly, setReadOnly] = useState(false);
  const [port, setPort] = useState("7419");
  const [bind, setBind] = useState("");
  const [joinAddress, setJoinAddress] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [joinDevice, setJoinDevice] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  const [found, setFound] = useState<HubAnnouncement[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [scanning, setScanning] = useState(false);

  const status = reply.running ? reply.status : null;
  const pairingCode = status?.pairing?.code ?? null;
  const addresses = reply.running
    ? reply.status.lanAddresses
    : reply.lanAddresses;

  const load = async () => {
    try {
      const current = await hubStatus();
      setReply(current);
      if (!current.running) {
        setBind((chosen) => chosen || current.lanAddresses[0] || "");
      }
    } catch {
      // A host without the Hub commands (a preview) simply shows nothing.
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!reply.running) return;
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, [reply.running]);

  useEffect(() => {
    if (!scanning) return;
    const root = document.documentElement;
    root.classList.add("sync-scanning");
    return () => root.classList.remove("sync-scanning");
  }, [scanning]);

  useEffect(() => {
    if (!pairingCode) {
      setQr(null);
      return;
    }
    let cancelled = false;
    void hubPairingQr().then(
      (image) => {
        if (!cancelled) setQr(image);
      },
      () => {
        if (!cancelled) setQr(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [pairingCode]);

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

  const start = () =>
    run(async () => {
      const started = await hubStart(
        root,
        readOnly,
        Number.parseInt(port, 10) || null,
        bind || null,
      );
      setReply({
        running: true,
        localConnectionId: started.localConnectionId,
        status: started,
      });
    });

  const stop = () =>
    run(async () => {
      await hubStop();
      setReply((current) => ({
        running: false,
        lanAddresses: current.running
          ? current.status.lanAddresses
          : current.lanAddresses,
      }));
    });

  const newCode = () =>
    run(async () => {
      const pairing = await hubCode(readOnly);
      setReply((current) =>
        current.running
          ? {
              ...current,
              status: { ...current.status, pairing },
            }
          : current,
      );
    });

  const revoke = (id: string) =>
    run(async () => {
      await hubRevoke(id);
      await load();
    });

  const bindVault = () =>
    run(async () => {
      await hubBind(root);
      await reload();
      setNote({ error: false, text: t.syncHubBound });
    });

  const clear = () =>
    run(async () => {
      const ok = await showConfirm(t.syncHubClearConfirm, {
        okLabel: t.syncHubClear,
        cancelLabel: t.cancel,
      });
      if (!ok) return;
      await hubClear();
      setReply((current) => ({
        running: false,
        lanAddresses: current.running
          ? current.status.lanAddresses
          : current.lanAddresses,
      }));
    });

  const copy = (text: string) => {
    void navigator.clipboard.writeText(text).then(
      () => setNote({ error: false, text: t.syncHubCopied }),
      () => undefined,
    );
  };

  const pairWith = (address: string, code: string) =>
    run(async () => {
      const device = joinDevice.trim() || t.syncHubThisDevice;
      const paired = await hubPair(address.trim(), code.trim(), device);
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
      setJoinCode("");
      await reload();
      setNote({ error: false, text: t.syncHubPaired });
    });

  const join = () => pairWith(joinAddress, joinCode);

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

  const scanQr = () => {
    setNote(null);
    setScanning(true);
  };

  const scanned = (content: string) => {
    setScanning(false);
    const payload = parseHubPairPayload(content);
    if (!payload) {
      setNote({ error: true, text: t.syncHubScanInvalid });
      return;
    }
    setJoinAddress(payload.address);
    setJoinCode(payload.code);
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
    <SettingsGroup
      title={t.syncHubTitle}
      className="sync-page"
      note={t.syncHubHttpWarning}
    >
      <p className="tx-list-note">{t.syncHubIntro}</p>
      {note && (
        <p className={(note.error ? "tx-list-note " : "") + "sync-hub-note"}>
          {note.text}
        </p>
      )}

      {!mobile && !status && (
        <>
          <label className="sync-field">
            <span className="settings-field-label">{t.syncHubAddress}</span>
            <select
              className="settings-select"
              value={bind}
              aria-label={t.syncHubAddress}
              onChange={(event) => setBind(event.target.value)}
            >
              {addresses.map((address) => (
                <option value={address} key={address}>
                  {address}
                </option>
              ))}
            </select>
          </label>
          <p className="tx-list-note">{t.syncHubAddressHint}</p>
          <label className="sync-field">
            <span className="settings-field-label">{t.syncHubPort}</span>
            <input
              className="settings-text-input"
              inputMode="numeric"
              value={port}
              onChange={(event) => setPort(event.target.value)}
            />
          </label>
          <label className="sync-check">
            <input
              type="checkbox"
              className="ui-check"
              checked={readOnly}
              onChange={(event) => setReadOnly(event.target.checked)}
            />
            {t.syncHubReadOnly}
          </label>
          {addresses.length === 0 && (
            <p className="tx-list-note">{t.syncHubNoAddress}</p>
          )}
          <div className="sync-actions">
            <button
              type="button"
              className="text-button settings-inline-button"
              disabled={busy || addresses.length === 0}
              onClick={() => void start()}
            >
              {t.syncHubStart}
            </button>
          </div>
        </>
      )}

      {!mobile && status && (
        <>
          <div className="sync-hub-row">
            <span className="settings-field-label">{t.syncHubAddress}</span>
            <span className="sync-hub-value" title={status.address}>
              {status.address}
            </span>
            <button
              type="button"
              className="tx-icon-button"
              aria-label={t.syncHubCopy}
              title={t.syncHubCopy}
              onClick={() => copy(status.address)}
            >
              <CopyIcon />
            </button>
          </div>
          <div className="sync-hub-row">
            <span className="settings-field-label">{t.syncHubCode}</span>
            <span className="sync-hub-value sync-hub-code">
              {status.pairing ? status.pairing.code : "—"}
            </span>
            <button
              type="button"
              className="text-button settings-inline-button"
              disabled={busy}
              onClick={() => void newCode()}
            >
              {t.syncHubNewCode}
            </button>
          </div>
          <p className="tx-list-note">{t.syncHubCodeNote}</p>
          {qr && (
            <div className="sync-hub-qr">
              <img src={qr} alt={t.syncHubQrAlt} />
              <span className="tx-list-note">{t.syncHubQrHint}</span>
            </div>
          )}
          <label className="sync-check">
            <input
              type="checkbox"
              className="ui-check"
              checked={readOnly}
              onChange={(event) => setReadOnly(event.target.checked)}
            />
            {t.syncHubReadOnly}
          </label>

          <h3 className="sync-hub-subhead">{t.syncHubDevices}</h3>
          {status.devices.length === 0 ? (
            <p className="tx-list-note">{t.syncHubNoDevices}</p>
          ) : (
            status.devices.map((device) => (
              <div className="sync-list-row" key={device.id}>
                <span className="sync-list-text">
                  {device.name}
                  <span className="sync-last">
                    {[
                      device.readOnly ? t.syncHubReadOnlyDevice : "",
                      device.online
                        ? t.syncHubOnline
                        : device.lastSeen
                          ? fill(t.syncHubLastSeen, {
                              time: new Date(device.lastSeen).toLocaleString(),
                            })
                          : t.syncHubOffline,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                {device.id !== "local" && (
                  <button
                    type="button"
                    className="text-button settings-inline-button danger"
                    disabled={busy}
                    onClick={() => void revoke(device.id)}
                  >
                    {t.syncHubRevoke}
                  </button>
                )}
              </div>
            ))
          )}

          <div className="sync-actions">
            <button
              type="button"
              className="text-button settings-inline-button"
              disabled={busy}
              onClick={() => void bindVault()}
            >
              {t.syncHubBind}
            </button>
            <button
              type="button"
              className="text-button settings-inline-button"
              disabled={busy}
              onClick={() => void stop()}
            >
              {t.syncHubStop}
            </button>
            <button
              type="button"
              className="text-button settings-inline-button danger"
              disabled={busy}
              onClick={() => void clear()}
            >
              {t.syncHubClear}
            </button>
          </div>
        </>
      )}

      {mobile && (
        <>
          <h3 className="sync-hub-subhead">{t.syncHubJoinTitle}</h3>
          <p className="tx-list-note">{t.syncHubJoinIntro}</p>
          <div className="sync-actions">
            <button
              type="button"
              className="text-button settings-inline-button"
              disabled={busy || discovering}
              onClick={() => void discover()}
            >
              {discovering ? t.syncHubDiscovering : t.syncHubDiscover}
            </button>
            <button
              type="button"
              className="text-button settings-inline-button"
              disabled={busy || scanning}
              onClick={() => void scanQr()}
            >
              {scanning ? t.syncHubScanning : t.syncHubScan}
            </button>
          </div>
          {found.length > 0 && (
            <div className="sync-hub-found">
              {found.map((hub) => (
                <button
                  type="button"
                  key={`${hub.address}-${hub.repoId}`}
                  className="sync-hub-found-row"
                  onClick={() => {
                    setJoinAddress(hub.address);
                    setJoinCode("");
                  }}
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
              value={joinAddress}
              onChange={(event) => setJoinAddress(event.target.value)}
            />
          </label>
          <label className="sync-field">
            <span className="settings-field-label">{t.syncHubCode}</span>
            <input
              className="settings-text-input"
              inputMode="numeric"
              maxLength={6}
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value)}
            />
          </label>
          <label className="sync-field">
            <span className="settings-field-label">
              {t.syncHubDeviceName}
            </span>
            <input
              className="settings-text-input"
              value={joinDevice}
              placeholder={t.syncHubThisDevice}
              onChange={(event) => setJoinDevice(event.target.value)}
            />
          </label>
          <div className="sync-actions">
            <button
              type="button"
              className="text-button settings-inline-button"
              disabled={busy || !joinAddress.trim() || joinCode.trim().length !== 6}
              onClick={() => void join()}
            >
              {t.syncHubPair}
            </button>
          </div>
        </>
      )}
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
    </SettingsGroup>
  );
}

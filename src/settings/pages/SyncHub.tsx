// Settings › Sync › This device's service: start the desktop's local-network
// WebDAV repository, show the one-time code and paired devices. Joining
// someone else's Hub is a connection type (SyncHubJoin).
import { useState } from "react";
import { fill } from "../../i18n/fill";
import type { Strings } from "../../i18n/strings";
import {
  hubBind,
  hubClear,
  hubCode,
  hubRevoke,
  hubStart,
  hubStop,
} from "../../platform/ipc-sync";
import { showConfirm } from "../../engine/controls/app-dialog";
import { ChevronIcon, CopyIcon } from "../../engine/controls/icons";
import { SettingsGroup } from "./SettingsGroup";
import { useHubStatus } from "./useHubStatus";
import { errorText } from "./sync-page-model";

export interface SyncHubProps {
  t: Strings;
  root: string;
  formatTime: (value: string | number) => string;
  reload: () => Promise<void>;
  /** This vault is bound to the Hub now: the page returns to its summary. */
  onBound?: () => void;
  /** Back to the connection summary without binding anything. */
  onBack?: () => void;
}

export function SyncHub({
  t,
  root,
  formatTime,
  reload,
  onBound,
  onBack,
}: SyncHubProps) {
  const { reply, setReply, qr, load } = useHubStatus();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ error: boolean; text: string } | null>(
    null,
  );
  const [readOnly, setReadOnly] = useState(false);
  const [port, setPort] = useState("7419");
  const [bind, setBind] = useState("");

  const status = reply.running ? reply.status : null;
  const addresses = reply.running
    ? reply.status.lanAddresses
    : reply.lanAddresses;

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setNote(null);
    try {
      await work();
    } catch (error) {
      setNote({ error: true, text: errorText(t, String(error)) });
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
      onBound?.();
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

  return (
    <SettingsGroup
      title={t.syncLocalService}
      className="sync-page"
      note={t.syncHubHttpWarning}
    >
      <p className="tx-list-note">{t.syncHubIntro}</p>
      {note && (
        <p className={(note.error ? "tx-list-note " : "") + "sync-hub-note"}>
          {note.text}
        </p>
      )}

      <div className="sync-actions">
        {!status && (
          <button
            type="button"
            className="tx-button primary"
            disabled={busy || addresses.length === 0}
            onClick={() => void start()}
          >
            {t.syncHubStart}
          </button>
        )}
      </div>
      {!status && addresses.length === 0 && (
        <p className="tx-list-note">{t.syncHubNoAddress}</p>
      )}

      {status && (
        <>
          <div className="sync-hub-pair">
            {qr && (
              <img className="sync-hub-qr-big" src={qr} alt={t.syncHubQrAlt} />
            )}
            <div className="sync-hub-pair-text">
              <span className="tx-list-note">{t.syncHubQrHint}</span>
              <span className="sync-hub-code-big">
                {status.pairing
                  ? `${status.pairing.code.slice(0, 3)} ${status.pairing.code.slice(3)}`
                  : "—"}
              </span>
              <span className="tx-list-note">{t.syncHubCodeNote}</span>
              <span className="sync-hub-address-line" title={status.address}>
                {status.address}
                <button
                  type="button"
                  className="tx-icon-button"
                  aria-label={t.syncHubCopy}
                  title={t.syncHubCopy}
                  onClick={() => copy(status.address)}
                >
                  <CopyIcon />
                </button>
              </span>
            </div>
          </div>

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
                              time: formatTime(device.lastSeen),
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
              onClick={() => void newCode()}
            >
              {t.syncHubNewCode}
            </button>
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

      <details className="settings-fold sync-advanced">
        <summary className="settings-row">
          <span className="settings-row-label">{t.syncAdvanced}</span>
          <ChevronIcon className="settings-fold-chevron" />
        </summary>
        <div className="settings-fold-body">
          {!status && (
            <>
              <label className="sync-field">
                <span className="settings-field-label">{t.syncHubAddress}</span>
                <select
                  className="settings-select"
                  value={bind || addresses[0] || ""}
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
            </>
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
        </div>
      </details>

      {onBack && (
        <div className="sync-actions sync-form-actions">
          <span className="sync-actions-end">
            <button
              type="button"
              className="text-button settings-inline-button"
              disabled={busy}
              onClick={onBack}
            >
              {t.phoneBack}
            </button>
          </span>
        </div>
      )}
    </SettingsGroup>
  );
}

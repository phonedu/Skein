// The built-in sync's state on the phone's home, above the tree: the same
// last-run summary the desktop's Sync settings shows, on one quiet row that
// opens those settings. A phone has no window bar for a status item.
import { useEffect, useState } from "react";
import { fill } from "../i18n/fill";
import type { Strings } from "../i18n/strings";
import { syncStatus, type SyncStatus } from "../platform/ipc-sync";
import { openSettingsPage } from "../settings/settings-nav";

const REFRESH_MS = 15_000;

export function PhoneSyncStatus({
  folder,
  t,
}: {
  folder: string | null;
  t: Strings;
}) {
  const [status, setStatus] = useState<SyncStatus | null>(null);

  useEffect(() => {
    if (!folder) {
      setStatus(null);
      return;
    }
    let alive = true;
    const load = () => {
      void syncStatus(folder)
        .then((next) => alive && setStatus(next))
        .catch(() => {});
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [folder]);

  if (!status?.configured) return null;
  const last = status.last;
  const text = last?.error
    ? fill(t.syncErrorOther, { reason: last.error })
    : last?.result
      ? t.syncDone
      : t.syncNever;
  return (
    <button
      type="button"
      className="ph-sync"
      aria-label={`${t.navSync}: ${text}`}
      onClick={() => openSettingsPage("sync")}
    >
      <span className="ph-sync-dot" aria-hidden />
      <span className="ph-sync-text">
        {t.navSync} · {text}
      </span>
      <svg
        className="ph-sync-chev"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="m9 6 6 6-6 6" />
      </svg>
    </button>
  );
}

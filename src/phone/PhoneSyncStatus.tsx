// The built-in sync's state on a phone: no permanent box under Today /
// Files. A run that finishes while this screen is open (or just before it
// opened) says so in a notice that goes by itself.
import { useEffect } from "react";
import { fill } from "../i18n/fill";
import type { Strings } from "../i18n/strings";
import { showNotice } from "../engine/controls/notices";
import { syncStatus } from "../platform/ipc-sync";

const REFRESH_MS = 15_000;
/** A result this fresh when the screen opens is worth saying once. */
const FRESH_MS = 15_000;
/** One announcement per folder and run, across both phone home screens. */
const announced = new Map<string, string>();

export function PhoneSyncStatus({
  folder,
  t,
}: {
  folder: string | null;
  t: Strings;
}) {
  useEffect(() => {
    if (!folder) return;
    let alive = true;
    const load = () => {
      void syncStatus(folder)
        .then((next) => {
          if (!alive || !next.configured) return;
          const last = next.last;
          if (!last?.at) return;
          if (announced.get(folder) === last.at) return;
          announced.set(folder, last.at);
          const at = Date.parse(last.at);
          if (!Number.isFinite(at) || Date.now() - at > FRESH_MS) return;
          showNotice(
            `${t.navSync} · ${
              last.error
                ? fill(t.syncErrorOther, { reason: last.error })
                : t.syncDone
            }`,
            { tone: last.error ? "error" : "info" },
          );
        })
        .catch(() => {});
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [folder, t]);

  return null;
}

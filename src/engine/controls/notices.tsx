import { useEffect, useState, type CSSProperties } from "react";
import "./notices.css";
import { createSubscribers } from "../../utils/store";

/** Short notes at the bottom of the window that go by themselves, and
 *  progress bars for slow work: what a plugin says without stopping the user.
 *  Shown by the one NoticeHost App mounts. */

interface Notice {
  id: number;
  text: string;
  tone: "info" | "warning" | "error";
  /** Who says it (a plugin's name), before the text. */
  source?: string;
  /** A progress bar: 0 to 1, or null while it can't tell. */
  progress?: { fraction: number | null; message?: string };
  cancelLabel?: string;
  onCancel?: () => void;
  /** A button that does what the note suggests, and closes it. */
  action?: { label: string; run: () => void };
  /** Called once it has gone, acted on or not. */
  onGone?: () => void;
}

/** How long a note stays: long enough to read a line, or to act on one. */
const NOTICE_MS = 4500;
const ACTION_NOTICE_MS = 12000;
/** At most this many at once; an older one gives way. */
const MAX_SHOWN = 3;

let nextId = 1;
let notices: Notice[] = [];
const shownNow =
  createSubscribers<[notices: Notice[], instant: readonly number[]]>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();

/** `instant`: the notes in this change that go at once, without the exit
 *  (taken away to make room, so a burst never leaves a pile of fading
 *  boxes). */
const publish = (instant: readonly number[] = []) =>
  shownNow.publish(notices, instant);

function remove(id: number, animate = true) {
  clearTimeout(timers.get(id));
  timers.delete(id);
  notices.find((n) => n.id === id)?.onGone?.();
  notices = notices.filter((n) => n.id !== id);
  publish(animate ? [] : [id]);
}

/** Removes a note after `ms`; a pointer resting on it holds it (hold). */
function arm(id: number, ms: number) {
  clearTimeout(timers.get(id));
  timers.set(
    id,
    setTimeout(() => remove(id), ms),
  );
}

function hold(id: number) {
  clearTimeout(timers.get(id));
  timers.delete(id);
}

/** What a note has left once the pointer moves off it. */
const AFTER_HOLD_MS = 1500;

function add(notice: Omit<Notice, "id">): number {
  // Said again while showing: the one note stays, its time starts over.
  const same = notices.find(
    (n) =>
      !n.progress &&
      !notice.progress &&
      n.text === notice.text &&
      n.source === notice.source,
  );
  if (same) return same.id;
  const id = nextId++;
  notices = [...notices, { ...notice, id }];
  // The oldest plain note makes room, this one too: an error or an offer
  // (Undo) gives way only to one of its kind. A progress bar stays.
  const plain = (n: Notice) => !n.progress && !n.action && n.tone === "info";
  while (notices.length > MAX_SHOWN) {
    const old = notices.find(plain) ?? notices.find((n) => !n.progress);
    if (!old) break;
    remove(old.id, false);
  }
  publish();
  return id;
}

export function showNotice(
  text: string,
  options: {
    tone?: Notice["tone"];
    source?: string;
    action?: Notice["action"];
    onGone?: () => void;
  } = {},
): void {
  const { action } = options;
  const id = add({
    text,
    tone: options.tone ?? "info",
    source: options.source,
    action: action && {
      label: action.label,
      // Acted on first, then gone: a caller hears which.
      run: () => {
        action.run();
        remove(id);
      },
    },
    onGone: options.onGone,
  });
  arm(id, action ? ACTION_NOTICE_MS : NOTICE_MS);
}

/** A progress bar that stays until endProgress; `onCancel` adds a way to
 *  stop the work. */
export function startProgress(
  title: string,
  options: {
    source?: string;
    cancelLabel?: string;
    onCancel?: () => void;
  } = {},
): number {
  return add({
    text: title,
    tone: "info",
    source: options.source,
    progress: { fraction: null },
    cancelLabel: options.cancelLabel,
    onCancel: options.onCancel,
  });
}

export function reportProgress(
  id: number,
  report: { fraction?: number; message?: string },
): void {
  notices = notices.map((n) =>
    n.id === id && n.progress
      ? {
          ...n,
          progress: {
            fraction:
              report.fraction === undefined
                ? n.progress.fraction
                : Math.min(1, Math.max(0, report.fraction)),
            message: report.message ?? n.progress.message,
          },
        }
      : n,
  );
  publish();
}

export function endProgress(id: number): void {
  // A progress bar is a fact about work, not a toast: when the work ends it
  // goes at once, no farewell.
  remove(id, false);
}

/** Mounted once per window, by App. A note that goes plays its exit out
 *  first: it is kept for the animation's length after the store dropped
 *  it (`--dur-base`, motion-moves.css motion-sink-out). */
const EXIT_MS = 200;

export function NoticeHost() {
  const [shown, setShown] = useState<Notice[]>(notices);
  const [retiring, setRetiring] = useState<Notice[]>([]);
  useEffect(() => {
    let seen = notices;
    return shownNow.subscribe((next, instant) => {
      const gone = seen.filter((n) => !next.some((m) => m.id === n.id));
      seen = next;
      // A note culled for room is not one that went by itself: it is gone
      // on this frame, not kept to fade.
      const leaving = gone.filter((n) => !instant.includes(n.id));
      if (leaving.length) {
        setRetiring((current) => [
          ...current.filter((n) => !leaving.some((g) => g.id === n.id)),
          ...leaving,
        ]);
        const ids = new Set(leaving.map((n) => n.id));
        setTimeout(
          () => setRetiring((current) => current.filter((n) => !ids.has(n.id))),
          EXIT_MS,
        );
      }
      setShown(next);
    });
  }, []);
  const rows = [...shown, ...retiring];
  if (!rows.length) return null;
  const leaving = new Set(retiring.map((n) => n.id));
  return (
    <div className="notice-stack" role="status" aria-live="polite">
      {rows.map((notice) => (
        <div
          key={notice.id}
          className="notice floating-surface"
          data-tone={notice.tone}
          data-state={leaving.has(notice.id) ? "closing" : undefined}
          aria-hidden={leaving.has(notice.id) || undefined}
          onMouseEnter={
            notice.progress || leaving.has(notice.id)
              ? undefined
              : () => hold(notice.id)
          }
          onMouseLeave={
            notice.progress || leaving.has(notice.id)
              ? undefined
              : () => arm(notice.id, AFTER_HOLD_MS)
          }
        >
          <div className="notice-text">
            {notice.source && (
              <span className="notice-source">{notice.source}</span>
            )}
            <span>{notice.text}</span>
            {notice.progress?.message && (
              <span className="notice-detail">{notice.progress.message}</span>
            )}
          </div>
          {notice.action && (
            <button
              type="button"
              className="notice-cancel"
              onClick={notice.action.run}
            >
              {notice.action.label}
            </button>
          )}
          {notice.onCancel && notice.cancelLabel && (
            <button
              type="button"
              className="notice-cancel"
              onClick={() => notice.onCancel?.()}
            >
              {notice.cancelLabel}
            </button>
          )}
          {/* Under the words and their buttons, the bar across. */}
          {notice.progress && (
            <div
              className={`tx-progress notice-bar${notice.progress.fraction === null ? " is-indeterminate" : ""}`}
              style={
                notice.progress.fraction === null
                  ? undefined
                  : ({ "--value": notice.progress.fraction } as CSSProperties)
              }
              role="progressbar"
              aria-label={notice.text}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={
                notice.progress.fraction === null
                  ? undefined
                  : Math.round(notice.progress.fraction * 100)
              }
            />
          )}
        </div>
      ))}
    </div>
  );
}

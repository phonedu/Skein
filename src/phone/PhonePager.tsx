import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePagerSwipe, type PhonePagerPage } from "./usePagerSwipe";
import "./PhonePager.css";

/** A phone has laid out the library by the time its first swipe comes; the
 *  warm-up waits only for the app to be free, never for the user. */
const WARM_MS = 900;

/**
 * Today and the library as two pages of one track. Both keep their own bar,
 * capsule and body - they are separate surfaces, not two lists under one
 * header - so the whole page travels, as a pushed page does. The library is
 * laid out on its first need, not with the window's first frame, so opening
 * the app costs what it did before the swipe existed.
 */
export function PhonePager({
  page,
  onChange,
  header,
  today,
  files,
}: {
  page: PhonePagerPage;
  onChange: (page: PhonePagerPage) => void;
  /** The fixed top row: the library chip, actions and segment. */
  header: ReactNode;
  today: ReactNode;
  files: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [filesBorn, setFilesBorn] = useState(page === "files");
  usePagerSwipe({
    root,
    track,
    page,
    onChange,
    needFiles: () => setFilesBorn(true),
  });
  // A tap or a swipe may come before the app is idle; until either, the
  // library waits, so its tree is not read on every launch.
  useEffect(() => {
    if (filesBorn) return;
    const idle = window.requestIdleCallback;
    if (idle) {
      const id = idle.call(window, () => setFilesBorn(true), { timeout: 2500 });
      return () => window.cancelIdleCallback?.(id);
    }
    const timer = window.setTimeout(() => setFilesBorn(true), WARM_MS);
    return () => window.clearTimeout(timer);
  }, [filesBorn]);

  return (
    <div className="phone-pager" data-page={page} ref={root}>
      <div className="phone-pager-head">{header}</div>
      <div className="phone-pager-track" ref={track}>
        <div
          className="phone-pager-page"
          data-pager-page="today"
          aria-hidden={page !== "today" || undefined}
          inert={page !== "today" || undefined}
        >
          {today}
        </div>
        <div
          className="phone-pager-page"
          data-pager-page="files"
          aria-hidden={page !== "files" || undefined}
          inert={page !== "files" || undefined}
        >
          {filesBorn ? files : null}
        </div>
      </div>
    </div>
  );
}

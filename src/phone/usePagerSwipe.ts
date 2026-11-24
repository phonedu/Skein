import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { HOLD_MS } from "../engine/drag/hold-drag";
import { swallowNextClick } from "../engine/drag/pointer-drag";
import { scaledPx } from "../engine/tokens/chrome-scale";
import { TOUCH_SLOP_PX } from "../utils/gesture";
import {
  pagerOffset,
  pagerTarget,
  pagerVelocity,
  type PagerSample,
} from "./pager-model";

/** The phone's two home surfaces, left to right. */
const PHONE_PAGES = ["today", "files"] as const;
export type PhonePagerPage = (typeof PHONE_PAGES)[number];

const pageAt = (page: PhonePagerPage) => PHONE_PAGES.indexOf(page);

/** Where a page-switch gesture may begin: the left edge is the pushed
 *  sidebar's and the system's, so the swipe starts inside it (the screen's
 *  middle, where a page is read). */
const EDGE = 32;

/** A finger still this long has a press of its own (a row's hold: its menu
 *  or its drag); the page swipe yields to it. */
const CLAIM_BEFORE_MS = HOLD_MS;

/** A drag in progress, and what it took. */
interface Swipe {
  x0: number;
  y0: number;
  /** When the finger went down: past CLAIM_BEFORE_MS, a hold owns it. */
  t0: number;
  /** The track's offset when the finger took it, px. */
  origin: number;
  width: number;
  /** The page the drag began on. */
  base: number;
  claimed: boolean;
  /** Something else took the gesture: a scroll, a hold, or a page change. */
  dead: boolean;
  samples: PagerSample[];
}

interface Flow {
  drag: Swipe | null;
  timer: number;
  /** The page last drawn: an outside change (the capsule, Back) moves the
   *  track without a finger. */
  page: PhonePagerPage;
}

/** The track's offset as drawn now: a CSS transition may have it between
 *  pages when a finger takes it. */
function trackOffsetPx(
  track: HTMLDivElement,
  width: number,
  page: PhonePagerPage,
): number {
  const transform = getComputedStyle(track).transform;
  if (!transform || transform === "none") return -pageAt(page) * width;
  return new DOMMatrixReadOnly(transform).m41;
}

function setTrack(track: HTMLDivElement, offset: number): void {
  track.style.transform = `translate3d(${offset}px, 0, 0)`;
}

/** The transition the track's stylesheet gives it, in ms: the release's own
 *  timer, so it ends even where transitions are switched off. */
function settleMs(track: HTMLDivElement): number {
  const [first = "0s"] = getComputedStyle(track).transitionDuration.split(",");
  const value = Number.parseFloat(first);
  if (!Number.isFinite(value)) return 0;
  return first.trim().endsWith("ms") ? value : value * 1000;
}

/** Both pages show while the track travels; the one it left stops being
 *  reachable once it has come to rest. */
function beginMove(
  root: HTMLElement,
  track: HTMLDivElement,
  flow: Flow,
  ms: number,
): void {
  root.dataset.moving = "on";
  if (flow.timer) window.clearTimeout(flow.timer);
  flow.timer = window.setTimeout(() => endMove(root, track, flow), ms + 64);
}

function endMove(root: HTMLElement, track: HTMLDivElement, flow: Flow): void {
  // A finger on the track owns it: its release ends the move instead.
  if (flow.drag) return;
  if (flow.timer) window.clearTimeout(flow.timer);
  flow.timer = 0;
  delete root.dataset.moving;
  delete root.dataset.dragging;
  track.style.transform = "";
}

/** Whether the touch is in something a sideways drag edits rather than a
 *  page's: a field keeps its own selection. */
function editsText(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    !!target.closest(
      "input, textarea, [contenteditable]:not([contenteditable='false'])",
    )
  );
}

/**
 * Today and the library as one track under a finger: a sideways drag takes
 * the track where it goes, a release lands on the page the drag and its
 * speed choose, and a change from outside (the capsule, Back) slides the
 * track the same way. Purely the gesture: the pages themselves are the
 * caller's.
 */
export function usePagerSwipe({
  root,
  track,
  page,
  onChange,
  needFiles,
}: {
  root: RefObject<HTMLDivElement | null>;
  track: RefObject<HTMLDivElement | null>;
  page: PhonePagerPage;
  onChange: (page: PhonePagerPage) => void;
  /** The library's page must be laid out before it can slide in. */
  needFiles: () => void;
}): void {
  const live = useRef({ page, onChange, needFiles });
  live.current = { page, onChange, needFiles };
  const flow = useRef<Flow>({ drag: null, timer: 0, page });

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    // The same object throughout the gesture (`flow.current` is never
    // replaced): the cleanup may read the timer it left behind.
    const state = flow.current;
    const down = (e: TouchEvent) => {
      // A second finger, or a new press: the old drag is not this one, and
      // whatever it moved comes to rest on the page it was on.
      if (flow.current.drag) {
        flow.current.drag = null;
        const trackNow = track.current;
        if (trackNow) endMove(el, trackNow, flow.current);
      }
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      if (!touch || editsText(e.target) || !track.current) return;
      const width = el.clientWidth;
      const edge = scaledPx(EDGE);
      if (width <= 0 || touch.clientX < edge || touch.clientX > width - edge)
        return;
      flow.current.drag = {
        x0: touch.clientX,
        y0: touch.clientY,
        t0: performance.now(),
        origin: 0,
        width,
        base: pageAt(live.current.page),
        claimed: false,
        dead: false,
        samples: [],
      };
    };
    const move = (e: TouchEvent) => {
      const drag = flow.current.drag;
      if (!drag || drag.dead) return;
      if (e.touches.length !== 1) {
        drag.dead = true;
        return;
      }
      const touch = e.touches[0];
      if (!touch) return;
      const dx = touch.clientX - drag.x0;
      const dy = touch.clientY - drag.y0;
      if (!drag.claimed) {
        if (Math.hypot(dx, dy) < TOUCH_SLOP_PX) return;
        // A finger that stayed put first is holding what it is on (a row's
        // menu or its drag), and a mostly-vertical run is the page's scroll.
        if (
          performance.now() - drag.t0 > CLAIM_BEFORE_MS ||
          Math.abs(dx) <= 2 * Math.abs(dy)
        ) {
          drag.dead = true;
          return;
        }
        drag.claimed = true;
        // The slop is the finger's run-up, not the page's: the track starts
        // where the finger now is, so it does not jump to catch up.
        drag.x0 = touch.clientX;
        drag.y0 = touch.clientY;
        const trackNow = track.current;
        if (!trackNow) return;
        drag.origin = trackOffsetPx(trackNow, drag.width, live.current.page);
        drag.samples = [{ x: touch.clientX, t: performance.now() }];
        live.current.needFiles();
        el.dataset.moving = "on";
        el.dataset.dragging = "on";
        if (flow.current.timer) {
          window.clearTimeout(flow.current.timer);
          flow.current.timer = 0;
        }
        setTrack(trackNow, drag.origin);
      }
      if (e.cancelable) e.preventDefault();
      const moved = touch.clientX - drag.x0;
      if (track.current)
        setTrack(
          track.current,
          pagerOffset(drag.origin, moved, drag.width, PHONE_PAGES.length),
        );
      drag.samples.push({ x: touch.clientX, t: performance.now() });
      if (drag.samples.length > 24) drag.samples.shift();
    };
    const release = (e: TouchEvent, dropped: boolean) => {
      const drag = flow.current.drag;
      flow.current.drag = null;
      const trackNow = track.current;
      if (!drag || !drag.claimed || !trackNow) return;
      // An outside change took the page mid-drag: show it, not the stale drag.
      if (drag.dead) {
        endMove(el, trackNow, flow.current);
        return;
      }
      const touch = e.changedTouches[0];
      const moved = (touch?.clientX ?? drag.x0) - drag.x0;
      const offset = pagerOffset(
        drag.origin,
        moved,
        drag.width,
        PHONE_PAGES.length,
      );
      const target = dropped
        ? pagerTarget(
            offset,
            pagerVelocity(drag.samples),
            drag.width,
            PHONE_PAGES.length,
          )
        : drag.base;
      if (dropped) {
        // Also stops the click a released touch would send to what it was on.
        if (e.cancelable) e.preventDefault();
        swallowNextClick();
      }
      // The finger let go: the stylesheet's transition carries the track the
      // rest of the way. The reflow makes the drag's position the start.
      delete el.dataset.dragging;
      void trackNow.offsetWidth;
      setTrack(trackNow, -target * drag.width);
      beginMove(el, trackNow, flow.current, settleMs(trackNow));
      if (target !== pageAt(live.current.page))
        live.current.onChange(PHONE_PAGES[target]);
    };
    const up = (e: TouchEvent) => release(e, true);
    const cancel = (e: TouchEvent) => release(e, false);
    el.addEventListener("touchstart", down, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", up);
    el.addEventListener("touchcancel", cancel);
    return () => {
      el.removeEventListener("touchstart", down);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", up);
      el.removeEventListener("touchcancel", cancel);
      if (state.timer) window.clearTimeout(state.timer);
    };
  }, [root, track]);

  // The capsule's tap, Back, a file opening: the page changed without a
  // finger, and the track travels there on its own.
  useLayoutEffect(() => {
    const current = flow.current;
    if (current.page === page) return;
    current.page = page;
    live.current.needFiles();
    const el = root.current;
    const trackNow = track.current;
    if (!el || !trackNow) return;
    if (current.drag) {
      current.drag = null;
      delete el.dataset.dragging;
      trackNow.style.transform = "";
    }
    beginMove(el, trackNow, current, settleMs(trackNow));
  }, [page, root, track]);
}

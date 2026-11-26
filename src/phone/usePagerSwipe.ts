import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { HOLD_MS } from "../engine/drag/hold-drag";
import { swallowNextClick } from "../engine/drag/pointer-drag";
import { motionAllowed } from "../engine/motion/motion";
import { runSpring, type SpringRun } from "../engine/motion/spring";
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
  spring: SpringRun | null;
  /** The last offset drawn: a finger or a page change starts from here,
   *  not from the class's resting place. */
  offset: number | null;
  /** The page last drawn: an outside change (the capsule, Back) moves the
   *  track without a finger. */
  page: PhonePagerPage;
}

/** The track's offset as drawn now: a spring may have it between pages
 *  when a finger takes it. */
function trackOffsetPx(track: HTMLDivElement): number {
  const transform = getComputedStyle(track).transform;
  if (!transform || transform === "none") return 0;
  return new DOMMatrixReadOnly(transform).m41;
}

/** The track where it is, and the segment's thumb with it: the thumb's
 *  fractional place is the track's own, so a drag moves both. */
function drawTrack(
  root: HTMLElement,
  track: HTMLDivElement,
  flow: Flow,
  offset: number,
  width: number,
): void {
  track.style.transform = `translate3d(${offset}px, 0, 0)`;
  flow.offset = offset;
  const at = width > 0 ? Math.min(1, Math.max(0, -offset / width)) : 0;
  root.style.setProperty("--pager-seg-at", String(at));
}

/** Both pages show while the track travels; the one it left stops being
 *  reachable once it has come to rest. */
function endMove(root: HTMLElement, track: HTMLDivElement, flow: Flow): void {
  // A finger on the track owns it: its release ends the move instead.
  if (flow.drag) return;
  flow.spring?.stop();
  flow.spring = null;
  delete root.dataset.moving;
  root.style.removeProperty("--pager-seg-at");
  track.style.transform = "";
}

/** Carries the track the rest of the way on a spring that starts with the
 *  finger's own speed: a flick keeps going, a slow drag eases in. The next
 *  touch may take it again from wherever it is. */
function startSpring(
  root: HTMLElement,
  track: HTMLDivElement,
  flow: Flow,
  from: number,
  to: number,
  velocity: number,
  width: number,
): void {
  flow.spring?.stop();
  const draw = (value: number) => drawTrack(root, track, flow, value, width);
  if (!motionAllowed()) {
    endMove(root, track, flow);
    return;
  }
  flow.spring = runSpring({
    from,
    to,
    velocity,
    draw,
    done: () => {
      flow.spring = null;
      endMove(root, track, flow);
    },
  });
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
 * the track where it goes, a release hands its speed to a spring that
 * lands on the page the drag and its speed choose, and a change from
 * outside (the capsule, Back) travels the same way. The segment's thumb
 * follows the track's fractional place, so the two move as one. Purely the
 * gesture: the pages themselves are the caller's.
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
  const flow = useRef<Flow>({
    drag: null,
    spring: null,
    offset: null,
    page,
  });

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    // The same object throughout the gesture (`flow.current` is never
    // replaced): the cleanup may read the spring it left behind.
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
        // A spring still carrying the track is stopped where it is: the
        // finger takes it from there. The track as drawn is the truth here,
        // also after a resize moved the class's resting place.
        flow.current.spring?.stop();
        flow.current.spring = null;
        drag.origin = trackOffsetPx(trackNow);
        drag.samples = [{ x: touch.clientX, t: performance.now() }];
        live.current.needFiles();
        el.dataset.moving = "on";
        drawTrack(el, trackNow, flow.current, drag.origin, drag.width);
      }
      if (e.cancelable) e.preventDefault();
      const trackNow = track.current;
      if (!trackNow) return;
      const moved = touch.clientX - drag.x0;
      drawTrack(
        el,
        trackNow,
        flow.current,
        pagerOffset(drag.origin, moved, drag.width, PHONE_PAGES.length),
        drag.width,
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
      const velocity = pagerVelocity(drag.samples);
      const offset = pagerOffset(
        drag.origin,
        moved,
        drag.width,
        PHONE_PAGES.length,
      );
      const target = dropped
        ? pagerTarget(offset, velocity, drag.width, PHONE_PAGES.length)
        : drag.base;
      if (dropped) {
        // Also stops the click a released touch would send to what it was on.
        if (e.cancelable) e.preventDefault();
        swallowNextClick();
      }
      // The page this very gesture decided is not an outside change: the
      // layout effect must not start a second spring and lose the speed.
      flow.current.page = PHONE_PAGES[target];
      if (target !== pageAt(live.current.page))
        live.current.onChange(PHONE_PAGES[target]);
      // The finger's speed is the spring's own: px/ms becomes px/s.
      startSpring(
        el,
        trackNow,
        flow.current,
        offset,
        -target * drag.width,
        dropped ? velocity * 1000 : 0,
        drag.width,
      );
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
      state.spring?.stop();
    };
  }, [root, track]);

  // The capsule's tap, Back, a file opening: the page changed without a
  // finger, and the track travels there on its own.
  useLayoutEffect(() => {
    const current = flow.current;
    if (current.page === page) return;
    const previous = current.page;
    current.page = page;
    live.current.needFiles();
    const el = root.current;
    const trackNow = track.current;
    if (!el || !trackNow) return;
    if (current.drag) {
      current.drag = null;
      endMove(el, trackNow, current);
      return;
    }
    const width = el.clientWidth;
    if (width <= 0) {
      endMove(el, trackNow, current);
      return;
    }
    // The class's transform has already moved to the new page; the inline
    // one puts the track back where it was seen before the first frame,
    // and the spring carries it from there. A spring already running has
    // its last drawn offset; at rest, the previous page's place (read at
    // this width, so a turned screen still starts true).
    const running = current.spring !== null;
    const from =
      running && current.offset !== null
        ? current.offset
        : -pageAt(previous) * width;
    const target = -pageAt(page) * width;
    endMove(el, trackNow, current);
    if (!motionAllowed()) return;
    el.dataset.moving = "on";
    drawTrack(el, trackNow, current, from, width);
    startSpring(el, trackNow, current, from, target, 0, width);
  }, [page, root, track]);
}

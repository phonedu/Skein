/** How far a pressed mouse or pen moves before the press becomes a drag. */
export const DRAG_START_PX = 5;

/** How far a finger may travel and still be tapping or holding rather than
 *  scrolling (UIKit's own slop is about this). */
export const TOUCH_SLOP_PX = 10;

/** A touch's run across from `start`: its dx while it goes more than twice
 *  as far sideways as down, else null. */
export function across(
  start: { x: number; y: number },
  t: { clientX: number; clientY: number },
): number | null {
  const dx = t.clientX - start.x;
  return Math.abs(dx) > 2 * Math.abs(t.clientY - start.y) ? dx : null;
}

export interface SwipeSample {
  /** What the finger moves along: x across, y down. */
  value: number;
  t: number;
}

/** The speed over the last `windowMs` of a drag, in the sample's unit per
 *  millisecond (positive as the value grows). A release reads what the
 *  finger did just before it lifted, not the whole drag. */
export function swipeVelocity(
  samples: readonly SwipeSample[],
  windowMs = 120,
): number {
  if (samples.length < 2) return 0;
  const last = samples[samples.length - 1];
  let first = last;
  for (let i = samples.length - 1; i >= 0; i--) {
    if (last.t - samples[i].t > windowMs) break;
    first = samples[i];
  }
  const span = last.t - first.t;
  return span > 0 ? (last.value - first.value) / span : 0;
}

let lastTouch = 0;
if (typeof window !== "undefined")
  window.addEventListener(
    "pointerdown",
    (e) => {
      if (e.pointerType === "touch") lastTouch = e.timeStamp;
    },
    true,
  );

/**
 * Whether a contextmenu came from a finger (Android's WebView sends one on
 * a hold, and as a "mouse" one on a double tap or a selection handle
 * dragged; WebKit sends none): the system's own selection and the app's
 * touch menus answer that, not the mouse's right-click menu.
 */
export function heldByFinger(e: Event): boolean {
  const type = (e as PointerEvent).pointerType;
  if (type === "touch") return true;
  if (type === "pen") return false;
  // No button at all: a selection handle let go, however long after the
  // last touch went down. A right-click is button 2.
  if ((e as MouseEvent).button === -1) return true;
  return lastTouch > 0 && e.timeStamp - lastTouch < 1500;
}

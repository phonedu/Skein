import { swipeVelocity } from "../utils/gesture";

/** How far past the first or last page the track can be pulled, as a share
 *  of the page: the edge gives with the finger and approaches this, never
 *  passing it. */
const EDGE_GIVE = 0.35;

/** How far a release projects the finger's speed: a flick lands on the next
 *  page without having to cross half the screen first. */
const PROJECT_MS = 200;

/** Faster than this is read as this, in px/ms: a release is a finger, not a
 *  throw, and one fast frame at the end must not carry two pages. */
const VELOCITY_CAP = 3;

export interface PagerSample {
  x: number;
  t: number;
}

/** The track's offset while the finger is `dx` from where it took it:
 *  it follows the finger across the pages' span, and gives only
 *  EDGE_GIVE past either end, less and less as it goes. `count` pages stand
 *  from 0 to -(count-1) widths. */
export function pagerOffset(
  origin: number,
  dx: number,
  width: number,
  count: number,
): number {
  const raw = origin + dx;
  const last = -(count - 1) * width;
  const give = Math.max(0, width) * EDGE_GIVE;
  const resisted = (over: number) =>
    give > 0 ? give * (1 - Math.exp(-over / give)) : 0;
  if (raw > 0) return resisted(raw);
  if (raw < last) return last - resisted(last - raw);
  return raw;
}

/** The page a release lands on: where the offset plus the finger's speed
 *  would come to rest, rounded to the nearest page. A page's own width is
 *  the ruler, so a short screen needs a shorter drag. */
export function pagerTarget(
  offset: number,
  velocity: number,
  width: number,
  count: number,
): number {
  if (width <= 0) return 0;
  const capped = Math.max(-VELOCITY_CAP, Math.min(VELOCITY_CAP, velocity));
  const projected = offset + capped * PROJECT_MS;
  const at = Math.round(-projected / width);
  return Math.max(0, Math.min(count - 1, at));
}

/** Pixels per millisecond over the last moves of the drag. */
export function pagerVelocity(samples: readonly PagerSample[]): number {
  return swipeVelocity(samples.map(({ x, t }) => ({ value: x, t })));
}

/** How many of `centers` (ascending) lie before `at`. */
export function passedCount(centers: readonly number[], at: number): number {
  let lo = 0;
  let hi = centers.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (centers[mid] < at) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** The shift of the other item at `i` (its place among the others) when
 *  the dragged one, first at `from` among them, would land at `to`. */
export function shiftAt(i: number, from: number, to: number, room: number) {
  if (to > from && i >= from && i < to) return -room;
  if (to < from && i >= to && i < from) return room;
  return 0;
}

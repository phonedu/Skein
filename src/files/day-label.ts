// A tree row's date line, the phone board's form (今天 / 周二 / 11-14):
// the calendar day decides which of the three a note gets.

/** Which form a row's date takes: today says so, the past week says the
 *  weekday, older says the month and day. */
export type DayLabelKind = "today" | "weekday" | "date";

/** Calendar days between `now` and `then`: positive when `then` is past,
 *  never fooled by a month or year rolling over. */
function daysBetween(now: Date, then: Date): number {
  const day = (d: Date) =>
    d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  return day(now) - day(then);
}

export function dayLabelKind(
  modifiedMs: number | null | undefined,
  now: Date,
): DayLabelKind | null {
  if (!modifiedMs) return null;
  const diff = daysBetween(now, new Date(modifiedMs));
  // Zero is today; a negative diff is a clock skew into the future, which
  // reads as today rather than as a weekday of a week that hasn't been.
  if (diff <= 0) return "today";
  if (diff < 7) return "weekday";
  return "date";
}

/** The month-day line ("11-14"), the board's form for an older note. */
export function monthDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getMonth() + 1}-${d.getDate()}`;
}

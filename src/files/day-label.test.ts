import { describe, expect, it } from "vitest";
import { dayLabelKind, monthDay } from "./day-label";

// Fixed noon dates: a row written this morning and one from last week
// must not depend on the hour the test runs at.
const now = new Date(2026, 10, 18, 12, 0); // 2026-11-18 12:00
const at = (y: number, m: number, d: number, h = 12) =>
  new Date(y, m - 1, d, h).getTime();

describe("a row's date line", () => {
  it("has no line without a date", () => {
    expect(dayLabelKind(null, now)).toBeNull();
    expect(dayLabelKind(undefined, now)).toBeNull();
    expect(dayLabelKind(0, now)).toBeNull();
  });

  it("says today across the hours of one day", () => {
    expect(dayLabelKind(at(2026, 11, 18, 0), now)).toBe("today");
    expect(dayLabelKind(at(2026, 11, 18, 23), now)).toBe("today");
  });

  it("reads a clock skew into the future as today", () => {
    expect(dayLabelKind(at(2026, 11, 19), now)).toBe("today");
  });

  it("says the weekday within the past week, not today", () => {
    expect(dayLabelKind(at(2026, 11, 17), now)).toBe("weekday");
    expect(dayLabelKind(at(2026, 11, 12), now)).toBe("weekday");
  });

  it("says month-day past the week, over month and year edges", () => {
    expect(dayLabelKind(at(2026, 11, 11), now)).toBe("date");
    expect(dayLabelKind(at(2026, 10, 31), now)).toBe("date");
    expect(dayLabelKind(at(2025, 12, 30), now)).toBe("date");
  });

  it("formats the month-day as the board writes it", () => {
    expect(monthDay(at(2026, 11, 14))).toBe("11-14");
    expect(monthDay(at(2026, 3, 5))).toBe("3-5");
  });
});

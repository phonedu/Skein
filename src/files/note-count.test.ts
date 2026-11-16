import { describe, expect, it } from "vitest";
import { countNotes, noteCountLabel } from "./note-count";

describe("countNotes", () => {
  it("counts markdown files only, any case", () => {
    expect(
      countNotes([
        { rel: "笔记.md" },
        { rel: "IMAGE.PNG" },
        { rel: "diagram.MD" },
        { rel: "notes.txt" },
        { rel: "sub/readme.Md" },
      ]),
    ).toBe(3);
  });

  it("an empty folder counts nothing", () => {
    expect(countNotes([])).toBe(0);
  });
});

describe("noteCountLabel", () => {
  it("the plain count", () => {
    expect(
      noteCountLabel(
        [{ rel: "a.md" }, { rel: "b.md" }, { rel: "c.md" }],
        false,
      ),
    ).toBe("3");
  });

  it("a truncated index stays honest with a plus", () => {
    expect(noteCountLabel([{ rel: "a.md" }, { rel: "b.md" }], true)).toBe("2+");
  });

  it("nothing truncated of nothing shows zero, no plus", () => {
    expect(noteCountLabel([], true)).toBe("0");
  });
});

import { describe, expect, it } from "vitest";
import { frontmatterKeys } from "./frontmatter-collapse";

describe("the front matter's property line", () => {
  it("counts one top-level key a line", () => {
    expect(
      frontmatterKeys("id: A-1\nstatus: inbox\ncreated_at: 2026-09-01"),
    ).toBe(3);
  });

  it("leaves nested and blank lines out", () => {
    expect(
      frontmatterKeys("boundary:\n  applies_when:\n    - a\n\n# comment\nx: 1"),
    ).toBe(2);
  });

  it("is zero for an empty block", () => {
    expect(frontmatterKeys("")).toBe(0);
  });
});

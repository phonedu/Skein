import { describe, expect, it } from "vitest";
import { ensureTextusId, textusIdOf } from "./document-identity";

const ID = "5f1c9a2e-4b7d-4c8a-9e3f-1a2b3c4d5e6f";

describe("document identity", () => {
  it("leaves a valid id alone", () => {
    const text = `---\ntitle: t\ntextus_id: ${ID}\n---\n\nbody`;
    expect(ensureTextusId(text)).toEqual({ text, id: ID });
  });

  it("adds the field to existing front matter without reordering it", () => {
    const out = ensureTextusId("---\ntitle: t\n# note\n---\n\nbody");
    expect(out.text).toBe(
      `---\ntitle: t\n# note\ntextus_id: ${out.id}\n---\n\nbody`,
    );
    expect(textusIdOf(out.text)).toBe(out.id);
  });

  it("creates front matter when there is none", () => {
    const out = ensureTextusId("# body");
    expect(out.text).toBe(`---\ntextus_id: ${out.id}\n---\n\n# body`);
  });

  it("reuses the id an earlier save wrote", () => {
    const out = ensureTextusId("# body", ID);
    expect(out.id).toBe(ID);
    expect(textusIdOf(out.text)).toBe(ID);
  });

  it("replaces a malformed id", () => {
    const out = ensureTextusId("---\ntextus_id: nope\n---\n\nbody");
    expect(out.id).not.toBe("nope");
    expect(textusIdOf(out.text)).toBe(out.id);
  });
});

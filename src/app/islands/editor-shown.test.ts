import { describe, expect, it } from "vitest";
import { keepsEditorLoaded } from "./editor-shown";
import type { DocTab } from "../../document/doc-tabs";

const doc = (over: Partial<DocTab> = {}): DocTab =>
  ({
    id: "doc",
    title: "doc",
    content: "",
    savedContent: "",
    path: "/w/doc.md",
    ...over,
  }) as DocTab;

const base = {
  activeTabId: "doc",
  inFront: "doc",
  pane: false,
  aiInFront: false,
};

describe("a document's editor while out of sight", () => {
  it("stays while its tab is the window's tab in use", () => {
    expect(keepsEditorLoaded(doc(), base)).toBe(true);
  });

  it("stays while it is a pane's front in a split", () => {
    expect(
      keepsEditorLoaded(doc(), { ...base, activeTabId: "other", pane: true }),
    ).toBe(true);
  });

  it("stays behind the phone's AI page, which reads the document in front", () => {
    expect(
      keepsEditorLoaded(doc(), {
        ...base,
        activeTabId: "ai",
        aiInFront: true,
      }),
    ).toBe(true);
  });

  it("is let go with the AI page in front when it is not the document in front", () => {
    expect(
      keepsEditorLoaded(doc(), {
        ...base,
        activeTabId: "ai",
        inFront: "other",
        aiInFront: true,
      }),
    ).toBe(false);
  });

  it("is let go when another tab is in use", () => {
    expect(keepsEditorLoaded(doc(), { ...base, activeTabId: "other" })).toBe(
      false,
    );
  });

  it("keeps a draft with no file, whose undo would not come back", () => {
    expect(
      keepsEditorLoaded(doc({ path: null, content: "written" }), {
        ...base,
        activeTabId: "other",
      }),
    ).toBe(true);
  });
});

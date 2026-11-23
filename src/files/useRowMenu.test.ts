// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "../i18n/locales/en";
import { TreeSelection } from "./tree-selection";
import { trashTargets, useRowMenu } from "./useRowMenu";

const platform = vi.hoisted(() => ({ mobile: false }));
vi.mock("../platform/capabilities", async (real) => ({
  ...(await real<typeof import("../platform/capabilities")>()),
  get isMobileApp() {
    return platform.mobile;
  },
  // Android's: no Trash. iOS's is the Files app's Recently Deleted.
  get canTrashFiles() {
    return !platform.mobile;
  },
}));

const labelsFor = (path: string, isDir: boolean) => {
  const noop = () => {};
  const { result } = renderHook(() =>
    useRowMenu(
      "/proj",
      "/proj",
      en,
      noop,
      noop,
      noop,
      noop,
      null,
      new TreeSelection(),
    ),
  );
  act(() => result.current.openRowMenu({ x: 0, y: 0 }, path, isDir));
  return {
    title: result.current.menu?.title,
    labels: (result.current.menu?.items ?? []).map((i) =>
      i === "separator" ? "-" : i.label,
    ),
  };
};

describe("a group's trash", () => {
  afterEach(() => {
    platform.mobile = false;
  });

  const rows = [
    { path: "/proj", isDir: true },
    { path: "/proj/sub", isDir: true },
    { path: "/proj/a.md", isDir: false },
  ];

  it("leaves the shown folder out, and takes files and folders to a Trash", () => {
    const { targets, permanent } = trashTargets(rows, "/proj");
    expect(targets.map((row) => row.path)).toEqual(["/proj/sub", "/proj/a.md"]);
    expect(permanent).toBe(false);
  });

  it("without a Trash, deletes documents only, and says it is permanent", () => {
    platform.mobile = true;
    expect(trashTargets(rows, "/proj")).toEqual({
      targets: [{ path: "/proj/a.md", isDir: false }],
      permanent: true,
    });
  });

  it("is empty when only the shown folder or non-trashable folders are picked", () => {
    platform.mobile = true;
    expect(trashTargets([{ path: "/proj", isDir: true }], "/proj")).toEqual({
      targets: [],
      permanent: false,
    });
    expect(trashTargets([{ path: "/proj/sub", isDir: true }], "/proj")).toEqual(
      { targets: [], permanent: false },
    );
  });
});

describe("a tree row's menu", () => {
  afterEach(() => {
    platform.mobile = false;
  });

  it("is named for the row, heading a phone's sheet", () => {
    expect(labelsFor("/proj/a.md", false).title).toBe("a.md");
  });

  it("moves to the Trash where there is one; without (Android), deletes documents only", () => {
    expect(labelsFor("/proj/a.md", false).labels).toContain(en.treeTrash);
    expect(labelsFor("/proj/sub", true).labels).toContain(en.treeTrash);
    platform.mobile = true;
    const file = labelsFor("/proj/a.md", false).labels;
    expect(file).toContain(en.docDelete);
    expect(file).toContain(en.treeRenameItem);
    expect(file).not.toContain(en.treeTrash);
    const folder = labelsFor("/proj/sub", true).labels;
    expect(folder).toContain(en.treeRenameItem);
    expect(folder).not.toContain(en.docDelete);
    expect(folder).not.toContain(en.treeTrash);
  });
});

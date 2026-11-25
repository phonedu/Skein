import { describe, expect, it, vi } from "vitest";
import en from "../i18n/locales/en";
import type { Strings } from "../i18n/strings";
import { fileActionEntries } from "./file-actions";
import type {
  ContextMenuEntry,
  ContextMenuGroup,
  ContextMenuItem,
} from "../engine/controls/ContextMenu";

const isGroup = (entry: unknown): entry is ContextMenuGroup =>
  typeof entry === "object" && entry !== null && "items" in entry;

/** The menu's rows, a group's rows in its place. */
function flat(entries: ContextMenuEntry[]): ContextMenuItem[] {
  return entries.flatMap((entry) => {
    if (entry === "separator") return [];
    if (isGroup(entry)) return flat(entry.items);
    return [entry as ContextMenuItem];
  });
}

const labels = (entries: ReturnType<typeof fileActionEntries>) =>
  flat(entries).map((item) => item.label);

const build = (over: Partial<Parameters<typeof fileActionEntries>[0]> = {}) =>
  fileActionEntries({
    t: en as Strings,
    sort: "name",
    folder: null,
    canOpenAsFolder: true,
    onNew: vi.fn(),
    onOpenAsFolder: vi.fn(),
    onCloseFolder: vi.fn(),
    ...over,
  });

describe("the file page's actions", () => {
  it("creates, opens the folder, sorts and refreshes", () => {
    const entries = build();
    expect(labels(entries)).toEqual([
      en.menuNewFile,
      en.treeNewFolder,
      en.treeOpenAsFolder,
      en.treeSortName,
      en.treeSortModified,
      en.treeRefresh,
    ]);
    expect(labels(entries)).not.toContain(en.menuCloseFolder);
    // The sort in force is the one ticked.
    const sort = flat(entries).filter((item) =>
      [en.treeSortName, en.treeSortModified].includes(item.label),
    );
    expect(sort.map((item) => item.checked)).toEqual([true, false]);
  });

  it("closes an opened folder instead of opening it", () => {
    const onCloseFolder = vi.fn();
    const entries = build({ folder: "/notes", onCloseFolder });
    expect(labels(entries)).toContain(en.menuCloseFolder);
    expect(labels(entries)).not.toContain(en.treeOpenAsFolder);
    flat(entries)
      .find((item) => item.label === en.menuCloseFolder)
      ?.onSelect();
    expect(onCloseFolder).toHaveBeenCalledOnce();
  });

  it("leaves Open as Folder out where the platform cannot", () => {
    expect(labels(build({ canOpenAsFolder: false }))).not.toContain(
      en.treeOpenAsFolder,
    );
  });

  it("asks for the kind chosen", () => {
    const onNew = vi.fn();
    const entries = build({ onNew });
    flat(entries)
      .find((item) => item.label === en.menuNewFile)
      ?.onSelect();
    flat(entries)
      .find((item) => item.label === en.treeNewFolder)
      ?.onSelect();
    expect(onNew.mock.calls).toEqual([["document"], ["folder"]]);
  });
});

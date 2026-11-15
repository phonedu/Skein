// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { useRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSettingsDialogSearch } from "./settings-search";
import { useReveal, type SearchablePage } from "../../settings/SettingsSearch";
import type { SearchEntry, SearchMatch } from "../../settings/settings-search";
import type { Strings } from "../../i18n/strings";

/**
 * The dialog's search (spec Task 6, ruling 4): the capsule field at the nav
 * column's top; results stand in for the page; picking one opens its page
 * and jumps to the row (the engine's reveal); ⌘F focuses the field while
 * the dialog is open; Escape during composition belongs to the input
 * method, clearing only on a plain Escape.
 */
const css = readFileSync("src/features/settings/settings-search.css", "utf8");

beforeEach(() => {
  localStorage.clear();
  // jsdom lacks CSS.escape (the index's selectors use it) and scrolling;
  // the page keys here need no escaping, and the scroll is the browser's.
  const css = globalThis as { CSS?: { escape?: (v: string) => string } };
  css.CSS ??= {};
  css.CSS.escape ??= (value) => value;
  Element.prototype.scrollIntoView = () => {};
});
afterEach(cleanup);

const t = {
  settingsSearchPlaceholder: "搜索设置",
  settingsSearchResults: "搜索结果",
  settingsSearchNoMatches: "没有匹配",
} as unknown as Strings;

/** A searchable page whose rows the index can read: the same class names
 *  the harvest looks for, drawn through the dialog's own row. */
const pages: SearchablePage[] = [
  {
    key: "general",
    name: "通用",
    render: () => (
      <div className="settings-page-group">
        <div className="settings-row">
          <div className="settings-row-label">
            <span className="settings-row-name">语言</span>
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-row-label">
            <span className="settings-row-name">自动保存</span>
          </div>
        </div>
      </div>
    ),
  },
];

/** The frame the dialog composes: the search's three pieces, and the
 *  content that receives the jump. */
function Frame(props: {
  owns?: boolean;
  onPick: (match: SearchMatch) => void;
}) {
  const content = useRef<HTMLDivElement>(null);
  const [jump, setJump] = useState<SearchEntry | null>(null);
  const search = useSettingsDialogSearch({
    t,
    pages,
    owns: props.owns ?? true,
    // The wiring's pick opens the page; here it only jumps.
    onPick: (match) => {
      props.onPick(match);
      setJump(match.entry);
    },
  });
  useReveal(content, jump, () => setJump(null));
  return (
    <>
      {search.index}
      {search.field}
      <div ref={content}>
        {search.searching ? (
          search.results
        ) : (
          // The page the dialog would show, the jump's target.
          <div className="settings-row" data-testid="page-row">
            <div className="settings-row-label">
              <span>自动保存</span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

describe("the dialog's settings search", () => {
  it("the field is a capsule at the nav column's top", () => {
    expect(css).toContain("var(--shape-pill)");
  });

  it("typing finds rows across the pages, grouped by page", () => {
    render(<Frame onPick={() => {}} />);
    const field = screen.getByPlaceholderText("搜索设置");
    fireEvent.change(field, { target: { value: "语言" } });
    expect(screen.getByText("搜索结果")).toBeTruthy();
    expect(screen.getByRole("option", { name: "语言" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "自动保存" })).toBeNull();
  });

  it("picking a result goes to its row: the pick, then the jump", () => {
    const onPick = vi.fn();
    render(<Frame onPick={onPick} />);
    const field = screen.getByPlaceholderText("搜索设置");
    fireEvent.change(field, { target: { value: "自动保存" } });
    fireEvent.click(screen.getByRole("option", { name: "自动保存" }));
    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({
        entry: expect.objectContaining({ page: "general", label: "自动保存" }),
      }),
    );
    // The query is done with: the results give the page back.
    expect(screen.queryByText("搜索结果")).toBeNull();
    expect(
      (screen.getByPlaceholderText("搜索设置") as HTMLInputElement).value,
    ).toBe("");
    // And the jump: the row revealed - focused, tinted for a moment.
    const row = screen.getByTestId("page-row");
    expect(document.activeElement).toBe(row);
    expect(row.classList.contains("settings-search-hit")).toBe(true);
  });

  it("⌘F focuses the field while the dialog is open, not when shut", () => {
    const { rerender } = render(<Frame owns onPick={() => {}} />);
    const field = screen.getByPlaceholderText("搜索设置");
    fireEvent.keyDown(window, { key: "f", ctrlKey: true });
    expect(document.activeElement).toBe(field);
    // Away from the field, so the second assert means something.
    (document.activeElement as HTMLElement).blur();
    rerender(<Frame owns={false} onPick={() => {}} />);
    fireEvent.keyDown(window, { key: "f", ctrlKey: true });
    expect(document.activeElement).not.toBe(field);
  });

  it("a plain Escape clears the query; a composing one belongs to the IME", () => {
    render(<Frame onPick={() => {}} />);
    const field = screen.getByPlaceholderText("搜索设置") as HTMLInputElement;
    fireEvent.change(field, { target: { value: "语言" } });
    fireEvent.keyDown(field, { key: "Escape", keyCode: 229 });
    expect(field.value).toBe("语言");
    fireEvent.keyDown(field, { key: "Escape", keyCode: 27 });
    expect(field.value).toBe("");
  });
});

// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "../i18n/locales/en";
import type { OpenFolder } from "../app/useOpenFolder";
import {
  removeStatusItem,
  setStatusItem,
} from "../plugins/contributions/status-items";
import { PhoneToday } from "./PhoneToday";

const { runCommand } = vi.hoisted(() => ({ runCommand: vi.fn() }));

vi.mock("../files/useTodayChanges", () => ({ useTodayChanges: () => [] }));
vi.mock("../registry/commands", () => ({ runCommand }));

afterEach(() => {
  cleanup();
  removeStatusItem("skein.collect");
  runCommand.mockClear();
});

/**
 * Today's phone surface, as the 2026-11-22 board settled it: a borderless
 * bar whose vault mark is a bare line icon, the capture in the view
 * capsule's row, and the day's changes as one glass card of two-line rows.
 */
const css = readFileSync("src/phone/PhoneToday.css", "utf8");

describe("Phone Today, the design board", () => {
  it("drops the bar's hairline and the vault icon's tinted tile", () => {
    // A bare 22px line icon replaces the accent-tinted tile.
    expect(css).toMatch(/\.ptop \{[^}]*border-bottom: 0;/s);
    expect(css).toMatch(
      /\.ptop-vault-icon \{[^}]*width: 22px;[^}]*height: 22px;[^}]*background: none;[^}]*color: var\(--ui-muted\);/s,
    );
  });

  it("keeps a long delivery title inside its card", () => {
    // A button's flex default is flex-start: the title took its full length,
    // the page scrolled sideways and the card's label rode off the edge.
    expect(css).toMatch(/\.pcard \{[^}]*align-items: stretch;/s);
    expect(css).toMatch(/\.pbody \{[^}]*overflow-x: hidden;/s);
  });

  it("puts the current delivery and today's changes in glass cards", () => {
    expect(css).toMatch(
      /\.pcard \{[^}]*border: 0;[^}]*border-radius: var\(--shape-card\);[^}]*background: var\(--ui-surface\);[^}]*box-shadow: var\(--shadow-card\);/s,
    );
    expect(css).toMatch(
      /\.pchanges \{[^}]*border: 0;[^}]*border-radius: var\(--shape-card\);[^}]*background: var\(--ui-surface\);[^}]*box-shadow: var\(--shadow-card\);/s,
    );
    // Written 80 draws 72 at the phone's 10/11. The hairline starts after
    // the file icon and stops 16 short. It is the following row's top edge,
    // so the first row has none and the last row keeps the line above it.
    expect(css).toMatch(/\.prow-doc \{[^}]*min-height: 80px;/s);
    // 2026-11-22 fix: the old offset (24px icon + --space-3 gap, 52px) used
    // the wrong icon width and gap token and landed inside the text; the
    // row's own inset plus the 16px icon and an 8px gap (--space-2) is
    // where the text actually starts.
    expect(css).toMatch(
      /\.pchanges \.prow \{[^}]*transparent calc\(var\(--space-4\) \+ 16px \+ var\(--space-2\)\)[^}]*transparent calc\(100% - var\(--space-4\)\)/s,
    );
    expect(css).not.toMatch(
      /\.pchanges \.prow:last-child\s*\{[^}]*background-image:\s*none/,
    );
    expect(css).toMatch(
      /\.pchanges \.prow:first-child \{[^}]*background-image: none;/s,
    );
    // The card's shorthand padding wiped the two-line row's block padding,
    // so the title sat on the top edge and the hairline on the empty bottom.
    // The card keeps its side inset; the two-line row keeps its own block
    // padding and centres the pair.
    expect(css).toMatch(
      /\.pchanges \.prow \{[^}]*padding-inline: var\(--space-4\);/s,
    );
    expect(css).toMatch(
      /\.pchanges \.prow-doc \{[^}]*align-items: center;[^}]*padding-block: var\(--space-2\);/s,
    );
  });
});

const openFolder = {
  folder: null,
  treeRoot: null,
  revealed: null,
  openFolderDialog: vi.fn(),
  setTreeRoot: vi.fn(),
  openFolder: vi.fn(),
  closeFolder: vi.fn(),
} as unknown as OpenFolder;

function renderToday(props: {
  activeTitle: string;
  activePath: string | null;
  onOpenFile: (path: string) => void;
  onOpenCurrent: () => void;
}) {
  return render(
    <PhoneToday
      t={en}
      activeTitle={props.activeTitle}
      activePath={props.activePath}
      openFolder={openFolder}
      onOpenFile={props.onOpenFile}
      onOpenCurrent={props.onOpenCurrent}
    />,
  );
}

describe("Phone Today, the current document card", () => {
  it("opens an unsaved document by its tab, and says it is a draft", () => {
    // The card opened only a path, so a capture's unsaved document - which
    // has none - could not be tapped at all. It keeps the way in, and its
    // line says what it is rather than leaving the card looking broken.
    const onOpenFile = vi.fn();
    const onOpenCurrent = vi.fn();
    renderToday({
      activeTitle: "未命名",
      activePath: null,
      onOpenFile,
      onOpenCurrent,
    });
    expect(screen.getByText("Draft · not saved")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /未命名/ }));
    expect(onOpenCurrent).toHaveBeenCalledTimes(1);
    expect(onOpenFile).not.toHaveBeenCalled();
  });

  it("opens a saved document by its path", () => {
    const onOpenFile = vi.fn();
    const onOpenCurrent = vi.fn();
    renderToday({
      activeTitle: "note.md",
      activePath: "/proj/note.md",
      onOpenFile,
      onOpenCurrent,
    });
    fireEvent.click(screen.getByRole("button", { name: /note\.md/ }));
    expect(onOpenFile).toHaveBeenCalledWith("/proj/note.md");
    expect(onOpenCurrent).not.toHaveBeenCalled();
    expect(screen.queryByText("Draft · not saved")).toBeNull();
  });
});

describe("Phone Today, the plugin rows", () => {
  it("shows a plugin's rows under its name and runs the row's command", () => {
    // The today page is the daily entry: what the plugin
    // reports is a row, not something behind More › Plugins.
    setStatusItem("skein.collect", "pending", {
      text: "2 to confirm",
      command: "skein.collect.confirm",
    });
    setStatusItem("skein.collect", "assets", {
      text: "Assets · 12 cards",
      command: "skein.collect.assets",
    });
    renderToday({
      activeTitle: "",
      activePath: null,
      onOpenFile: vi.fn(),
      onOpenCurrent: vi.fn(),
    });
    // One group label for the plugin's two rows.
    expect(screen.getAllByText("skein.collect")).toHaveLength(1);
    expect(screen.getByText("2 to confirm")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Assets · 12 cards/ }));
    expect(runCommand).toHaveBeenCalledWith("skein.collect.assets");
    // The rows stand in the day's body: the empty state is gone.
    expect(screen.queryByText(en.todayEmptyTitle)).toBeNull();
  });

  it("leaves a row without a command unpressable", () => {
    setStatusItem("skein.collect", "idle", { text: "Nothing to confirm" });
    renderToday({
      activeTitle: "",
      activePath: null,
      onOpenFile: vi.fn(),
      onOpenCurrent: vi.fn(),
    });
    const row = screen.getByRole("button", {
      name: /Nothing to confirm/,
    }) as HTMLButtonElement;
    expect(row.disabled).toBe(true);
  });
});

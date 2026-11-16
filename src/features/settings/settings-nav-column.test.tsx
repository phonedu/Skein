// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsNavColumn } from "./settings-nav-column";
import {
  SETTINGS_GROUPS,
  type SettingsPageDef,
} from "../../settings/settings-pages";
import type { Strings } from "../../i18n/strings";

/**
 * The nav column's contract (spec Task 3, ruling 6): its pages under their
 * groups, folded until opened; a row at the board's 32 high, active =
 * surface + hair ring + 500 weight; plugins' group semantics hold. The
 * column is pure over its `pages` data - the registry is wired in later.
 */
const css = readFileSync(
  "src/features/settings/settings-nav-column.css",
  "utf8",
);

afterEach(cleanup);

const t = {
  navGeneral: "通用",
  navAppearance: "外观",
  navShortcuts: "快捷键",
  navPrivacyData: "隐私与数据",
  navAbout: "关于",
  navEditText: "编辑文字",
  navAi: "Textus AI",
  navProvidersModels: "模型",
} as unknown as Strings;

const pages: SettingsPageDef[] = [
  { id: "general", label: () => t.navGeneral as string },
  { id: "look-basic", label: () => t.navAppearance as string },
  { id: "providers", group: "ai", label: () => t.navProvidersModels as string },
  { id: "edit-text", group: "edit", label: () => t.navEditText as string },
];

function column(active = "general", onOpen = () => {}) {
  return (
    <SettingsNavColumn t={t} pages={pages} active={active} onOpen={onOpen} />
  );
}

describe("the settings nav column", () => {
  it("lists its pages, ungrouped first then under their groups", () => {
    render(column());
    expect(screen.getByText("通用")).toBeTruthy();
    expect(screen.getByText("外观")).toBeTruthy();
    expect(screen.getByText("Textus AI")).toBeTruthy(); // the group heading
  });

  it("folds a group until its heading is opened", () => {
    render(column());
    expect(screen.queryByText("模型")).toBeNull();
    fireEvent.click(screen.getByText("Textus AI"));
    expect(screen.getByText("模型")).toBeTruthy();
  });

  it("opens the page a row is pressed on, and marks the active one", () => {
    const onOpen = vi.fn();
    render(column("look-basic", onOpen));
    fireEvent.click(screen.getByText("通用"));
    expect(onOpen).toHaveBeenCalledWith("general");
    const active = screen
      .getByText("外观")
      .closest("button") as HTMLButtonElement;
    expect(active.getAttribute("aria-current")).toBe("page");
  });

  it("rows are the board's 32 high", () => {
    expect(css).toContain("min-height: 32px");
    expect(css).not.toContain("min-height: 30px");
  });

  it("the registry's groups are the same two the current app folds by", () => {
    expect(Object.keys(SETTINGS_GROUPS).sort()).toEqual(["ai", "edit"]);
  });

  it("the group holding the open page is open, so the page is in sight", () => {
    render(column("providers"));
    // The AI group's page is the active one: the group shows it.
    expect(screen.getByText("模型")).toBeTruthy();
    expect(
      screen.getByText("模型").closest("button")?.getAttribute("aria-current"),
    ).toBe("page");
  });
});

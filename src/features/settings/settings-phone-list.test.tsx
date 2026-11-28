// @vitest-environment jsdom
// The phone's grouped list, now the desktop dialog's too: every page in
// sight (no folding), and the dialog's open page marked.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsPhoneList } from "./settings-phone-list";
import type { SettingsPageDef } from "../../settings/settings-pages";
import type { Strings } from "../../i18n/strings";

afterEach(cleanup);

const t = {
  settingsTitle: "设置",
  navGeneral: "通用",
  navAbout: "关于",
} as unknown as Strings;

const pages: SettingsPageDef[] = [
  { id: "general", label: () => "通用" },
  { id: "about", label: () => "关于" },
];

describe("the settings list shared by the phone and the dialog", () => {
  it("shows every page, without folding a group", () => {
    render(<SettingsPhoneList t={t} pages={pages} onOpen={() => {}} />);
    expect(screen.getByText("通用")).toBeTruthy();
    expect(screen.getByText("关于")).toBeTruthy();
  });

  it("marks the dialog's open page and opens the one pressed", () => {
    const onOpen = vi.fn();
    render(
      <SettingsPhoneList t={t} pages={pages} active="about" onOpen={onOpen} />,
    );
    const active = screen.getByText("关于").closest("button")!;
    expect(active.getAttribute("aria-current")).toBe("page");
    expect(
      screen.getByText("通用").closest("button")!.getAttribute("aria-current"),
    ).toBeNull();
    fireEvent.click(screen.getByText("通用"));
    expect(onOpen).toHaveBeenCalledWith("general");
  });

  it("draws the cards in the pages' own order, not the group table's", () => {
    // The ledger's order is the list's order: a run of one group is one
    // card, in sequence - AI's group before Editing's, and an ungrouped
    // run after the groups draws without a caption rather than jumping
    // back into the first card.
    const t2 = {
      ...t,
      navOptions: "选项",
      navAi: "Textus AI",
      navEditing: "编辑",
    } as unknown as Strings;
    const ordered: SettingsPageDef[] = [
      { id: "general", label: () => "通用" },
      { id: "sync", label: () => "同步" },
      { id: "providers", group: "ai", label: () => "模型设置" },
      { id: "chat", group: "ai", label: () => "对话与写作" },
      { id: "edit-text", group: "edit", label: () => "文档" },
      { id: "shortcuts", label: () => "快捷键" },
      { id: "about", label: () => "关于" },
    ];
    const { container } = render(
      <SettingsPhoneList t={t2} pages={ordered} onOpen={() => {}} />,
    );
    const captions = [
      ...container.querySelectorAll(".settings-phone-section-title"),
    ].map((h) => h.textContent);
    expect(captions).toEqual(["选项", "Textus AI", "编辑"]);
    const rows = [
      ...container.querySelectorAll(".settings-phone-row-label"),
    ].map((r) => r.textContent);
    expect(rows).toEqual([
      "通用",
      "同步",
      "模型设置",
      "对话与写作",
      "文档",
      "快捷键",
      "关于",
    ]);
  });
});

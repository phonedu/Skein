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
});

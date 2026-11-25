// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "../i18n/locales/en";
import type { Strings } from "../i18n/strings";
import type { OpenFolder } from "../app/useOpenFolder";
import { PHONE_PAGE_MORE_EVENT } from "../utils/events";
import { PhonePageHeader } from "./PhonePageHeader";

vi.mock("../platform/menu-events", () => ({
  emitToThisWindow: vi.fn(),
}));

import { emitToThisWindow } from "../platform/menu-events";

afterEach(cleanup);

const folder = {
  folder: "/notes",
  treeRoot: "/notes",
  setTreeRoot: vi.fn(),
  revealed: null,
  openFolder: vi.fn(),
  openFolderDialog: vi.fn(),
  closeFolder: vi.fn(),
} as unknown as OpenFolder;

const renderHeader = (page: "today" | "files" = "today") => {
  const onChange = vi.fn();
  const onCapture = vi.fn();
  render(
    <PhonePageHeader
      t={en as Strings}
      page={page}
      openFolder={folder}
      onChange={onChange}
      onCapture={onCapture}
    />,
  );
  return { onChange, onCapture };
};

describe("the phone home's fixed top", () => {
  it("names the library and keeps More and Settings in the row", () => {
    renderHeader();
    expect(screen.getByRole("button", { name: /notes/ })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: en.phoneMoreActions }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: en.settingsTitle }));
    expect(emitToThisWindow).toHaveBeenCalledWith("menu-settings");
  });

  it("asks the page in front for its More sheet", () => {
    renderHeader("files");
    const heard = vi.fn();
    window.addEventListener(PHONE_PAGE_MORE_EVENT, heard);
    fireEvent.click(screen.getByRole("button", { name: en.phoneMoreActions }));
    expect((heard.mock.calls[0][0] as CustomEvent).detail).toBe("files");
    window.removeEventListener(PHONE_PAGE_MORE_EVENT, heard);
  });

  it("switches pages from the segment and keeps the capture beside it", () => {
    const { onChange, onCapture } = renderHeader();
    fireEvent.click(screen.getByRole("tab", { name: /files/i }));
    expect(onChange).toHaveBeenCalledWith("files");
    fireEvent.click(screen.getByRole("button", { name: en.todayCapture }));
    expect(onCapture).toHaveBeenCalledOnce();
  });
});

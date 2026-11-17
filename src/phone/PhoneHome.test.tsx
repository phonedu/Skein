// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import en from "../i18n/locales/en";
import type { Strings } from "../i18n/strings";
import { PhoneHome } from "./PhoneHome";

vi.mock("../files/FileTree", () => ({
  FileTree: () => (
    <div data-testid="phone-file-tree">
      <div className="tree-toolbar">desktop controls</div>
    </div>
  ),
}));

vi.mock("../platform/capabilities", () => ({
  canOpenFolder: false,
}));

vi.mock("../platform/menu-events", () => ({
  emitToThisWindow: vi.fn(),
}));

const openFolder = {
  folder: "/notes",
  treeRoot: "/notes",
  revealed: null,
  setTreeRoot: vi.fn(),
  openFolder: vi.fn(),
  closeFolder: vi.fn(),
} as never;

describe("the phone library home", () => {
  afterEach(cleanup);

  it("shows the paper library search affordance above the tree", () => {
    render(
      <PhoneHome
        t={en as Strings}
        openFolder={openFolder}
        activePath={null}
        onOpenFile={vi.fn()}
        onNewFile={vi.fn()}
        onEntryMoved={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("searchbox", { name: en.phoneSearchPlaceholder }),
    ).toBeTruthy();
    expect(screen.getByTestId("phone-file-tree")).toBeTruthy();
  });

  it("keeps the new-document control connected to the existing callback", () => {
    const onNewFile = vi.fn();
    render(
      <PhoneHome
        t={en as Strings}
        openFolder={openFolder}
        activePath={null}
        onOpenFile={vi.fn()}
        onNewFile={onNewFile}
        onEntryMoved={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: en.menuNewFile }));
    expect(onNewFile).toHaveBeenCalledOnce();
  });
});

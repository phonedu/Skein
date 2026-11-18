// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import en from "../i18n/locales/en";
import type { Strings } from "../i18n/strings";
import { PhoneHome } from "./PhoneHome";

const phoneHomeCss = readFileSync("src/phone/PhoneHome.css", "utf8");

vi.mock("../files/FileTree", () => ({
  FileTree: () => (
    <div data-testid="phone-file-tree">
      <div className="tree-toolbar">desktop controls</div>
    </div>
  ),
}));

vi.mock("../platform/capabilities", () => ({
  canOpenFolder: true,
}));

vi.mock("../platform/menu-events", () => ({
  emitToThisWindow: vi.fn(),
}));

// Pick a stub Sheet so the test doesn't need the SettingsProvider or the
// Presence transitions; the sheet's own file has its contract covered.
vi.mock("../engine/controls/ActionSheet", async () => {
  const { createElement } = await import("react");
  type Item = {
    label: string;
    onSelect: () => void;
    Icon?: unknown;
    current?: boolean;
    sub?: string;
  };
  return {
    ActionSheet: ({
      title,
      items,
      onClose,
    }: {
      title?: string;
      items: (Item | "separator")[];
      onClose: () => void;
    }) =>
      createElement(
        "div",
        { role: "menu", "aria-label": title },
        items
          .filter((it): it is Item => it !== "separator")
          .map((item, i) =>
            createElement(
              "button",
              {
                key: i,
                role: "menuitem",
                "aria-label": item.label,
                "aria-current": item.current ? "true" : undefined,
                onClick: () => {
                  onClose();
                  item.onSelect();
                },
              },
              item.label,
            ),
          ),
      ),
  };
});

vi.mock("../engine/motion/usePresence", () => ({
  Presence: ({ show, children }: { show: boolean; children: unknown }) =>
    show ? children : null,
}));

const openFolder = {
  folder: "/notes",
  treeRoot: "/notes",
  revealed: null,
  setTreeRoot: vi.fn(),
  openFolder: vi.fn(),
  openFolderDialog: vi.fn(),
  closeFolder: vi.fn(),
};
const openFolderProp = openFolder as unknown as Parameters<
  typeof PhoneHome
>[0]["openFolder"];

describe("the phone library home", () => {
  afterEach(cleanup);

  it("shows the paper library search affordance above the tree", () => {
    render(
      <PhoneHome
        t={en as Strings}
        openFolder={openFolderProp}
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
        openFolder={openFolderProp}
        activePath={null}
        onOpenFile={vi.fn()}
        onNewFile={onNewFile}
        onEntryMoved={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: en.menuNewFile }));
    expect(onNewFile).toHaveBeenCalledOnce();
  });

  it("opens the library switcher sheet and can call the folder picker", () => {
    render(
      <PhoneHome
        t={en as Strings}
        openFolder={openFolderProp}
        activePath={null}
        onOpenFile={vi.fn()}
        onNewFile={vi.fn()}
        onEntryMoved={vi.fn()}
      />,
    );
    // The chip opens the sheet.
    fireEvent.click(screen.getByRole("button", { name: /notes/ }));
    // The current library is ticked and the folder picker row is present.
    const current = screen.getByRole("menuitem", { name: "notes" });
    expect(current.getAttribute("aria-current")).toBe("true");
    const openOther = screen.getByRole("menuitem", {
      name: en.phoneVaultOpenOther,
    });
    fireEvent.click(openOther);
    expect(openFolder.openFolderDialog).toHaveBeenCalledOnce();
  });

  it("uses the Android phone rhythm for search and library rows", () => {
    expect(phoneHomeCss).toContain("min-height: 56px;");
    expect(phoneHomeCss).toContain("padding: 0 var(--space-4);");
  });

  it("keeps the tree's depth indent under the phone row's padding", () => {
    // The row's shorthand once wiped pane.css's --tree-indent padding,
    // and a folder's children drew flush with the root. The phone rule
    // must re-state the indent, files level with the folders' icons.
    expect(phoneHomeCss).toContain(
      "padding-left: max(var(--space-2), var(--tree-indent));",
    );
    expect(phoneHomeCss).toContain(
      "calc(var(--tree-indent) + var(--tree-chevron) + var(--space-2))",
    );
  });
});

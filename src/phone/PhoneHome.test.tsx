// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import en from "../i18n/locales/en";
import type { Strings } from "../i18n/strings";
import {
  removeStatusItem,
  setStatusItem,
} from "../plugins/contributions/status-items";
import { extensionsStartTab } from "../settings/pages/extensions-tab";
import { emitToThisWindow } from "../platform/menu-events";
import { openSettingsPage } from "../settings/settings-nav";
import { PhoneHome } from "./PhoneHome";

const phoneHomeCss = readFileSync("src/phone/PhoneHome.css", "utf8");

const fileTreeProps = vi.hoisted(() => ({
  last: null as Record<string, unknown> | null,
}));

vi.mock("../files/FileTree", () => ({
  FileTree: (props: Record<string, unknown>) => {
    fileTreeProps.last = props;
    return (
      <div data-testid="phone-file-tree">
        <div className="tree-toolbar">desktop controls</div>
      </div>
    );
  },
}));

vi.mock("../platform/capabilities", () => ({
  canOpenFolder: true,
  isDesktopApp: false,
}));

vi.mock("../platform/native-files", () => ({
  useAppDocumentsFolder: () => "/app/Documents",
}));

vi.mock("../platform/ipc-sync", () => ({
  syncStatus: vi.fn().mockResolvedValue({ configured: false, last: null }),
}));

vi.mock("../platform/menu-events", () => ({
  emitToThisWindow: vi.fn(),
}));

vi.mock("../settings/settings-nav", () => ({
  openSettingsPage: vi.fn(),
}));

// Pick a stub Sheet so the test doesn't need the SettingsProvider or the
// Presence transitions; the sheet's own file has its contract covered.
vi.mock("../engine/controls/ActionSheet", async () => {
  const { createElement } = await import("react");
  type Item = {
    label: string;
    onSelect: () => void;
    Icon?: unknown;
    checked?: boolean;
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
                "aria-checked": item.checked ? "true" : undefined,
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
  afterEach(() => {
    cleanup();
    removeStatusItem("test.plugin");
    vi.mocked(openSettingsPage).mockClear();
  });

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

  it("keeps Plugins out of the library's top row", () => {
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

    // The library is a pushed page under Today; plugins stay in Today's
    // ⋯ sheet and the top bar's launcher, so the row keeps its room.
    expect(screen.queryByRole("button", { name: en.pluginsTitle })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: en.settingsTitle }));
    expect(emitToThisWindow).toHaveBeenCalledWith("menu-settings");
  });

  it("shows a plugin's status and opens Plugins from it", () => {
    act(() =>
      setStatusItem("test.plugin", "status", { text: "Synced 2m ago" }),
    );
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

    fireEvent.click(screen.getByRole("button", { name: "Synced 2m ago" }));
    expect(openSettingsPage).toHaveBeenCalledWith("extensions");
    expect(extensionsStartTab()).toBe("plugins");
  });

  it("lets the phone search field receive text, and clear itself", () => {
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

    const input = screen.getByRole("searchbox", {
      name: en.phoneSearchPlaceholder,
    });
    expect(input.hasAttribute("readonly")).toBe(false);
    // No clear while the field is empty; typing brings it, and it empties.
    expect(
      screen.queryByRole("button", { name: en.phoneSearchClear }),
    ).toBeNull();
    fireEvent.change(input, { target: { value: "guide" } });
    expect((input as HTMLInputElement).value).toBe("guide");
    fireEvent.click(screen.getByRole("button", { name: en.phoneSearchClear }));
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("opens the app's own Documents from the empty state", () => {
    const empty = {
      ...openFolder,
      folder: null,
      treeRoot: null,
      openFolder: vi.fn(),
    } as unknown as Parameters<typeof PhoneHome>[0]["openFolder"];
    render(
      <PhoneHome
        t={en as Strings}
        openFolder={empty}
        activePath={null}
        onOpenFile={vi.fn()}
        onNewFile={vi.fn()}
        onEntryMoved={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: en.phoneUseAppDocuments }),
    );
    expect(empty.openFolder).toHaveBeenCalledWith("/app/Documents");
  });

  it("keeps the new note in the top row, over an empty library too", () => {
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

    // No floating button: the top row's + is there whether the tree is
    // empty or full.
    expect(screen.getByRole("button", { name: en.menuNewFile })).toBeTruthy();
    expect(document.querySelector(".ph-fab")).toBeNull();
  });

  it("asks which new thing on a held +, and names a folder in place", () => {
    vi.useFakeTimers();
    try {
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

      const fab = screen.getByRole("button", { name: en.menuNewFile });
      fireEvent.touchStart(fab, {
        touches: [{ clientX: 12, clientY: 12 }],
      });
      act(() => vi.advanceTimersByTime(500));
      // The sheet's rows, and only then.
      const folder = screen.getByRole("menuitem", {
        name: en.treeNewFolder,
      });
      expect(
        screen.getByRole("menuitem", { name: en.menuNewFile }),
      ).toBeTruthy();
      fireEvent.click(folder);
      // Choosing a folder asks the tree for one named in place at the root.
      const ask = fileTreeProps.last?.["draftRequest"] as {
        kind: string;
        seq: number;
      } | null;
      expect(ask?.kind).toBe("folder");
      expect(ask?.seq).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("hands the tree the empty vault's state and the search's no-results", () => {
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

    expect(fileTreeProps.last?.["noResults"]).toBe(en.phoneSearchNoResults);
    const empty = fileTreeProps.last?.["emptyState"] as Record<string, unknown>;
    expect(empty.title).toBe(en.phoneVaultEmptyTitle);
    expect(empty.hint).toBe(en.phoneVaultEmptyHint);
    expect(empty.label).toBe(en.menuNewFile);
    expect(typeof empty.start).toBe("function");
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
    expect(current.getAttribute("aria-checked")).toBe("true");
    const openOther = screen.getByRole("menuitem", {
      name: en.phoneVaultOpenOther,
    });
    fireEvent.click(openOther);
    expect(openFolder.openFolderDialog).toHaveBeenCalledOnce();
  });

  it("uses the Android phone rhythm for search and library rows", () => {
    // Rows stay 56 drawn (62 written at the chrome's 10/11). The search is
    // no longer a bordered pill: the 2026-11-22 board makes it a bare 44px
    // row (48 written), icon and placeholder, with no focus ring.
    expect(phoneHomeCss).toContain("min-height: 62px;");
    expect(phoneHomeCss).toContain("padding: 0 var(--space-4);");
    expect(phoneHomeCss).toMatch(
      /\.ph-search \{[^}]*min-height: 48px;[^}]*border: 0;[^}]*background: none;/s,
    );
    expect(phoneHomeCss).toMatch(
      /\.ph-search:focus-within \{[^}]*border: 0;[^}]*box-shadow: none;/s,
    );
  });

  it("keeps the vault switcher borderless, its folder a bare line icon", () => {
    // The tinted tile is gone (2026-11-22): a bare 22px line icon.
    expect(phoneHomeCss).toMatch(
      /\.ph-vault \{[^}]*border: 0;[^}]*background: none;/s,
    );
    expect(phoneHomeCss).toMatch(
      /\.ph-vault \.vic \{[^}]*width: 22px;[^}]*height: 22px;[^}]*background: none;[^}]*color: var\(--phone-muted\);/s,
    );
    // The chip is a bar action: no frame, its inset in the bar's own air.
    expect(phoneHomeCss).toContain("padding: 0 var(--space-2) 0 0;");
    // The board's small quiet disclosure: 13px drawn from the 10px design
    // (1.4 at the phone's 10/11), seated in its 22px box.
    expect(phoneHomeCss).toContain("--tree-chevron: 24.2px;");
    expect(phoneHomeCss).toContain("--icon-scale: 1.4;");
  });

  it("draws a folder as a bare line icon, not a tinted chip", () => {
    // 2026-11-22: the fire-tinted folder chip is a bare 22px line icon.
    // 15px design at 1.6 draws about 22 at the phone's 10/11. The old 2.2
    // chip scale must not return.
    expect(phoneHomeCss).toContain("--icon-scale: 1.6;");
    expect(phoneHomeCss).not.toContain("--icon-scale: 2.2;");
    expect(phoneHomeCss).toMatch(
      /\.phone-home \.tree-row:not\(\.tree-row-file\) \.tree-icon \{[^}]*background: none;[^}]*color: var\(--phone-muted\);/s,
    );
  });

  it("keeps the tree's levels one step apart, files level with folders", () => {
    // The row's shorthand once wiped pane.css's --tree-indent padding,
    // and a folder's children drew flush with the root. 2026-11-24: the
    // root's inset is part of the measure (else the first step came out
    // shorter than the rest), and a file's icon takes the folders' icons'
    // left edge at its own depth - the old extra +10px seat centred it
    // under them and read a level off.
    expect(phoneHomeCss).toContain(
      "var(--space-2) + max(var(--depth, 1) - 1, 0) * var(--tree-step)",
    );
    expect(phoneHomeCss).toContain("padding-left: var(--tree-indent);");
    expect(phoneHomeCss).toContain(
      "var(--tree-indent) + var(--tree-chevron) + var(--space-2)",
    );
    expect(phoneHomeCss).not.toContain("+ 10px");
    // The guide lines land on the enclosing folder's chevron centre.
    expect(phoneHomeCss).toContain("background-position-x: calc(");
    expect(phoneHomeCss).toContain(
      "var(--space-2) + var(--tree-chevron) / 2 - var(--tree-step) + 1px",
    );
  });

  it("marks the open document with the selection, not the fire dot", () => {
    // 2026-11-22: selection replaces the fire dot. The dot stays off the
    // desktop, and the phone hides it too; the open row takes the selected
    // fill, an accent icon and a 600 name.
    expect(phoneHomeCss).toMatch(/\.tree-fdot \{[^}]*display: none;/s);
    expect(phoneHomeCss).toMatch(
      /\.phone-home \.tree-fdot \{[^}]*display: none;/s,
    );
    // 2026-11-22: the plain --ui-selected fill (#EEF1F5 on the light
    // page's #F0F1F3) was too faint to read as selected; the ruling tints
    // it with the accent instead of the flat selection colour.
    expect(phoneHomeCss).toMatch(
      /\.phone-home \.tree-row-active \{[^}]*background: color-mix\(in srgb, var\(--ui-accent\) 8%, var\(--ui-selected\)\);[^}]*font-weight: 600;/s,
    );
    expect(phoneHomeCss).toMatch(
      /\.phone-home \.tree-row-active \.tree-icon \{[^}]*color: var\(--ui-accent\);/s,
    );
    // The row's ⋯ stays a 44px touch target (48 written at 10/11).
    expect(phoneHomeCss).toMatch(
      /\.phone-home \.tree-more \{[^}]*width: 48px;[^}]*height: 48px;/s,
    );
  });
});

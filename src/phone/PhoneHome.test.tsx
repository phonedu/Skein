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

  it("opens Plugins from the home's top row", () => {
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

    fireEvent.click(screen.getByRole("button", { name: en.pluginsTitle }));
    expect(openSettingsPage).toHaveBeenCalledWith("extensions");
    expect(extensionsStartTab()).toBe("plugins");
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

  it("steps the floating action aside over an empty library", () => {
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

    // Loaded, the tree reports its count; nothing there hides the +.
    expect(screen.getByRole("button", { name: en.menuNewFile })).toBeTruthy();
    const report = fileTreeProps.last?.["onRootCount"] as (n: number) => void;
    act(() => report(0));
    expect(screen.queryByRole("button", { name: en.menuNewFile })).toBeNull();
    act(() => report(3));
    expect(screen.getByRole("button", { name: en.menuNewFile })).toBeTruthy();
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
    // The user's ruling from the reference app: rows stand 56px drawn
    // (62 written at the chrome's 10/11), and the search pill 46px (50
    // written).
    expect(phoneHomeCss).toContain("min-height: 62px;");
    expect(phoneHomeCss).toContain("padding: 0 var(--space-4);");
    expect(phoneHomeCss).toContain("min-height: 50px;");
  });

  it("keeps the library control unframed and the tree disclosure quiet", () => {
    expect(phoneHomeCss).toMatch(
      /\.ph-vault \{[^}]*border: 0;[^}]*background: none;/s,
    );
    // The board's library inset: rows stand in 12px from each edge.
    expect(phoneHomeCss).toContain("padding: 0 var(--space-3);");
    // The board's small quiet disclosure: 13px drawn from the 10px design,
    // seated in its 22px box (24.2 written at the chrome's 10/11).
    expect(phoneHomeCss).toContain("--tree-chevron: 24.2px;");
    expect(phoneHomeCss).toContain("--icon-scale: 1.43;");
  });

  it("draws the board's folder chip: fire-tinted, bronze glyph, svg-sized", () => {
    // The chip is the icon's own inline size (icons.tsx's iconSize wins
    // over any width here): 15px design at 2.2 draws 30px. A width rule
    // once starved the glyph to a 0 viewport under the chip's padding.
    expect(phoneHomeCss).toContain("--icon-scale: 2.2;");
    expect(phoneHomeCss).toContain(
      "background: color-mix(in srgb, var(--phone-fire) 8%, transparent);",
    );
    expect(phoneHomeCss).toContain("color: var(--phone-fold);");
  });

  it("keeps the tree's depth indent under the phone row's padding", () => {
    // The row's shorthand once wiped pane.css's --tree-indent padding,
    // and a folder's children drew flush with the root. The phone rule
    // must re-state the indent - from the second level on, the board's
    // root rows standing at the pane's inset - and files level with the
    // folders' chips.
    expect(phoneHomeCss).toContain(
      "padding-left: max(var(--space-2), var(--tree-indent));",
    );
    expect(phoneHomeCss).toContain(
      "calc(var(--tree-indent) + var(--tree-chevron) + var(--space-2) + 10px)",
    );
  });

  it("marks the open document with the board's fire dot", () => {
    // Off the desktop's tree by default, on at the phone's home only.
    expect(phoneHomeCss).toMatch(/\.tree-fdot \{[^}]*display: none;/s);
    expect(phoneHomeCss).toMatch(
      /\.phone-home \.tree-fdot \{[^}]*display: inline-block;[^}]*background: var\(--phone-fire\);/s,
    );
  });
});

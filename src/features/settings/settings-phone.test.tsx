// @vitest-environment jsdom
// The phone's settings: the list is the first sight, a section pushes as
// its own page under a back row, and the desktop's dialog never mounts.
import { readFileSync } from "node:fs";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsHost } from ".";
import { SettingsProvider } from "../../prefs/SettingsContext";
import { back as androidBack } from "../../mobile/back";
import en from "../../i18n/locales/en";

const settingsPhoneCss = readFileSync(
  "src/features/settings/settings-phone.css",
  "utf8",
);

vi.mock("../../engine/controls/usePhoneLayout", () => ({
  usePhoneLayout: () => true,
}));

// The legacy pages' effects ask Tauri for the window's events and the CLI's
// status on render; jsdom has none (settings-host.test's stand-ins).
vi.mock("../../platform/events", () => ({
  listenToThisWindow: () => Promise.resolve(() => {}),
  listenToThisWebview: () => Promise.resolve(() => {}),
  emitToWindow: () => Promise.resolve(),
  unlistenAll:
    (...subs: Promise<() => void>[]) =>
    () => {
      void Promise.all(subs);
    },
}));
vi.mock("../../platform/ipc", async (importOriginal) => {
  const ipc = await importOriginal<Record<string, unknown>>();
  return {
    ...ipc,
    cli: {
      ...(ipc.cli as object),
      cliCommandStatus: () => Promise.resolve("missing"),
    },
    updater: { ...(ipc.updater as object), check: () => Promise.resolve(null) },
  };
});

beforeEach(() => {
  localStorage.clear();
  const g = globalThis as { CSS?: { escape?: (v: string) => string } };
  g.CSS ??= {};
  g.CSS.escape ??= (value: string) => value;
  Element.prototype.scrollIntoView = () => {};
});
afterEach(cleanup);

function host(page = "general", onClose: () => void = () => {}) {
  return render(
    <SettingsProvider>
      <SettingsHost
        page={page}
        jump={null}
        onClose={onClose}
        fixedShortcuts={[]}
        pluginCommands={[]}
      />
    </SettingsProvider>,
  );
}

describe("the phone's settings", () => {
  it("opens at the list, not a section, and never mounts the dialog", () => {
    host();
    expect(screen.getByText(en.settingsTitle)).toBeTruthy();
    expect(document.querySelector(".settings-phone")).toBeTruthy();
    expect(document.querySelector(".settings-dialog")).toBeNull();
    // The gear's "general" is not pushed: no back row, no content host.
    expect(document.querySelector(".settings-phone-back")).toBeNull();
  });

  it("pushes a section as its own page and goes back to the list", () => {
    host();
    fireEvent.click(screen.getByRole("button", { name: en.navGeneral }));
    expect(document.querySelector(".settings-content-host")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: en.phoneBack }));
    expect(document.querySelector(".settings-content-host")).toBeNull();
    expect(screen.getByText(en.settingsTitle)).toBeTruthy();
  });

  it("pushes a deep link's page at once", () => {
    host("about");
    expect(document.querySelector(".settings-content-host")).toBeTruthy();
    expect(screen.getAllByText(en.navAbout).length).toBeGreaterThan(0);
  });

  it("Android's Back pops a section to the list, then closes Settings", async () => {
    const onClose = vi.fn();
    host("general", onClose);
    fireEvent.click(screen.getByRole("button", { name: en.navGeneral }));
    expect(document.querySelector(".settings-content-host")).toBeTruthy();

    await act(async () => {
      expect(androidBack()).toBe(true);
    });
    expect(document.querySelector(".settings-content-host")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      expect(androidBack()).toBe(true);
    });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("leads the bar with a back arrow and centres the title", () => {
    const onClose = vi.fn();
    render(
      <SettingsProvider>
        <SettingsHost
          page="general"
          jump={null}
          onClose={onClose}
          fixedShortcuts={[]}
          pluginCommands={[]}
        />
      </SettingsProvider>,
    );
    const bar = document.querySelector(".settings-phone-top")!;
    const back = bar.firstElementChild as HTMLElement;
    expect(back.getAttribute("aria-label")).toBe(en.phoneBack);
    expect(back.querySelector(".settings-phone-arrow")).toBeTruthy();
    expect(bar.children[1].classList.contains("settings-phone-title")).toBe(
      true,
    );
    fireEvent.click(back);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("lists every page in sections, grouped pages in sight unfolded", () => {
    host();
    const sections = document.querySelectorAll(".settings-phone-section");
    expect(sections.length).toBeGreaterThan(1);
    expect(screen.getByText(en.navEditing)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: en.navEditText }));
    expect(document.querySelector(".settings-content-host")).toBeTruthy();
  });

  it("keeps the search and the cards inside the page's margins", () => {
    expect(settingsPhoneCss).toContain(".settings-phone .settings-search");
    expect(settingsPhoneCss).toMatch(
      /\.settings-phone \.settings-search \{[^}]*margin: 0;/,
    );
    expect(settingsPhoneCss).toContain("box-sizing: border-box;");
  });

  it("draws the phone list as glass cards under a borderless bar and a bare search row", () => {
    // Design board (2026-11-22): the phone bar has no hairline, search is
    // a bare 44px row (no border, no fill, no focus ring), section titles
    // sit flush with the card, and the card is glass without a stroke.
    // The row hairline starts at the text and stops 16px short of the edge.
    expect(settingsPhoneCss).toMatch(
      /\.settings-phone-top \{[^}]*border-bottom: 0;/s,
    );
    expect(settingsPhoneCss).toMatch(
      /\.settings-phone \.settings-search \{[^}]*height: 44px;[^}]*border: 0;[^}]*background: none;/s,
    );
    expect(settingsPhoneCss).toMatch(
      /\.settings-phone \.settings-search:focus-within \{[^}]*border: 0;[^}]*box-shadow: none;/s,
    );
    expect(settingsPhoneCss).toMatch(
      /\.settings-phone-section-title \{[^}]*padding: 0;/s,
    );
    expect(settingsPhoneCss).toMatch(
      /\.settings-phone-card \{[^}]*border: 0;[^}]*border-radius: var\(--shape-card\);[^}]*background: var\(--ui-surface\);[^}]*box-shadow: var\(--shadow-card\);/s,
    );
    expect(settingsPhoneCss).toMatch(
      /\.settings-phone-row \+ \.settings-phone-row::before \{[^}]*right: var\(--space-4\);/s,
    );
    expect(settingsPhoneCss).toMatch(
      /\.settings-phone-card > \.settings-phone-row:last-child::before \{[^}]*display: none;/s,
    );
  });

  it("draws a subpage's rows as a glass card: 56/72, a 48\u00d728 switch, the hairline stopping 16 short", () => {
    // Design board (2026-11-22): the subpage keeps the real page, in the
    // same glass card. Written 62/80 draw 56/72 at the phone's 10/11.
    expect(settingsPhoneCss).toMatch(
      /\.settings-phone \.settings-content-host \.settings-page-group-body \{[^}]*border: 0;[^}]*border-radius: var\(--shape-card\);[^}]*background: var\(--ui-surface\);[^}]*box-shadow: var\(--shadow-card\);/s,
    );
    expect(settingsPhoneCss).toMatch(
      /\.settings-phone \.settings-content-host \.settings-page-group-body \.settings-row \{[^}]*min-height: 62px;/s,
    );
    expect(settingsPhoneCss).toMatch(
      /\.settings-row:has\(\.settings-row-desc\) \{[^}]*min-height: 80px;/s,
    );
    expect(settingsPhoneCss).toContain(
      "transparent calc(100% - var(--space-4))",
    );
    expect(settingsPhoneCss).toMatch(
      /\.settings-phone \.settings-switch \{[^}]*width: 48px;[^}]*height: 28px;/s,
    );
    expect(settingsPhoneCss).toMatch(
      /\.settings-phone \.settings-row-value \{[^}]*margin-left: auto;/s,
    );
  });

  it("starts a pushed page below the status bar, as the list does", () => {
    // The page is an absolute child of the padded fixed layer: it must add
    // the safe area itself, or its title sits in the status bar.
    expect(settingsPhoneCss).toMatch(
      /\.settings-phone-page \{[^}]*inset: var\(--safe-top, 0px\) 0 0;/s,
    );
  });

  it("keeps a result's chip beside its words, even with a description", () => {
    expect(settingsPhoneCss).toContain("flex-wrap: nowrap;");
    expect(settingsPhoneCss).toContain(
      ".settings-search-result:has(.settings-row-hint)",
    );
    expect(settingsPhoneCss).toContain("flex: 1 1 0;");
  });
});

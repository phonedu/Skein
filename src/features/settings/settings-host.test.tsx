// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsHost } from ".";
import { SettingsProvider, useSettings } from "../../prefs/SettingsContext";
import { settingsPage } from "../../settings/settings-pages";
import en from "../../i18n/locales/en";

// The legacy pages' effects ask Tauri for the window's events and the CLI's
// status on render; jsdom has none.
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
    // The updater's answer, so the check can be watched end to end.
    updater: {
      ...(ipc.updater as object),
      check: () => Promise.resolve(null),
    },
  };
});
vi.mock("../../platform/distribution", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  selfUpdateAllowed: () => Promise.resolve(true),
}));

// jsdom lacks CSS.escape (the search index's selectors).
beforeEach(() => {
  localStorage.clear();
  const g = globalThis as { CSS?: { escape?: (v: string) => string } };
  g.CSS ??= {};
  g.CSS.escape ??= (value) => value;
  Element.prototype.scrollIntoView = () => {};
});
afterEach(cleanup);

/** The dialog's strings come from the settings store, as the old panel's
 *  did: the provider's default is English in a test's clean storage. */
function host(page = "general") {
  return render(
    <SettingsProvider>
      <SettingsHost
        page={page}
        jump={null}
        onClose={() => {}}
        fixedShortcuts={[]}
        pluginCommands={[]}
      />
    </SettingsProvider>,
  );
}

describe("the settings dialog, as the window opens it", () => {
  it("shows the dialog with the page list and the page it opens at", () => {
    host("look-basic");
    expect(screen.getByRole("dialog", { name: en.settingsTitle })).toBeTruthy();
    // The content column (the hidden search index draws every page too).
    const shown = document.querySelector(".settings-content-host")!;
    expect(shown.textContent).toContain(en.uiTextScaleLabel);
    expect(
      screen.getByPlaceholderText(en.settingsSearchPlaceholder),
    ).toBeTruthy();
  });

  it("a page picked in the list takes the content's place", () => {
    host("general");
    fireEvent.click(screen.getByRole("button", { name: en.navAppearance }));
    const shown = document.querySelector(".settings-content-host")!;
    expect(shown.textContent).toContain(en.uiTextScaleLabel);
  });

  it("a plugin's page opens in the content column", () => {
    host("plugin:cloud-sync");
    expect(screen.getByRole("dialog", { name: en.settingsTitle })).toBeTruthy();
    expect(
      document.querySelector(".settings-dialog-content .plugin-tab"),
    ).toBeTruthy();
  });

  it("every built-in page the registry shows has a def to draw", () => {
    // The list and the content read the same registry: a page in the nav
    // is a page the content can draw.
    for (const id of ["general", "look-basic", "privacy", "about"]) {
      expect(settingsPage(id)).toBeTruthy();
    }
  });

  it("'updates' checks for updates: the page asked for says so", async () => {
    // The app menu's Check for Updates… opens Settings at "updates": the
    // About page, checking at once.
    host("updates");
    await screen.findByText(en.updateLatest);
  });

  it("the plugin's page keeps its host box: its own stylesheet loads here", () => {
    const source = readFileSync("src/features/settings/index.tsx", "utf8");
    expect(source).toContain("plugin-tab.css");
  });

  it("the plugin's page is not remounted when the host redraws", () => {
    // A store change redraws the host: the plugin's page keeps its node
    // (a new component type each render would remount it, and it would
    // lose its scroll).
    let set: ((patch: { typewriterMode: boolean }) => void) | null = null;
    function Frame() {
      const { setSettings } = useSettings();
      set = setSettings;
      return (
        <SettingsHost
          page="plugin:cloud-sync"
          jump={null}
          onClose={() => {}}
          fixedShortcuts={[]}
          pluginCommands={[]}
        />
      );
    }
    render(
      <SettingsProvider>
        <Frame />
      </SettingsProvider>,
    );
    const before = document.querySelector(".plugin-tab");
    act(() => set!({ typewriterMode: true }));
    expect(document.querySelector(".plugin-tab")).toBe(before);
  });

  it("the About card keeps its frame: its stylesheet loads with the page", () => {
    const about = readFileSync("src/settings/sections/about.css", "utf8");
    expect(about).toContain(".settings-about-card");
  });

  it("the legacy pages keep their chrome on the desktop", () => {
    // The desktop does not load the iPad's sheet, so its pages' styles
    // have to come with the module.
    const source = readFileSync(
      "src/features/settings/settings-content.tsx",
      "utf8",
    );
    expect(source).toContain("SettingsPanel.css");
  });
});

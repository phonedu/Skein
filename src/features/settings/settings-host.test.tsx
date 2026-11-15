// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsHost } from ".";
import { SettingsProvider } from "../../prefs/SettingsContext";
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
  };
});

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
});

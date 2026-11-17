// @vitest-environment jsdom
// The phone's settings: the list is the first sight, a section pushes as
// its own page under a back row, and the desktop's dialog never mounts.
import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsHost } from ".";
import { SettingsProvider } from "../../prefs/SettingsContext";
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

  it("uses a phone sized settings header and body rhythm", () => {
    expect(settingsPhoneCss).toContain("width: 48px;");
    expect(settingsPhoneCss).toContain("height: 48px;");
    expect(settingsPhoneCss).toContain("padding: 0 var(--space-4)");
  });
});

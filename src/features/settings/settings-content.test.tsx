// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsContent } from "./settings-content";
import { SettingsProvider } from "../../prefs/SettingsContext";
import {
  registerSettingsPage,
  settingsPage,
} from "../../settings/settings-pages";
import type { SettingsPageProps } from "../../settings/pages/types";
import type { Strings } from "../../i18n/strings";

// The Tauri side of the window events and the CLI's status probe: the
// legacy pages' effects ask them on render, and jsdom has no Tauri. Their
// promises resolve to nothing (the CLI row shows its "missing" state).
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

/**
 * The content column's contract: it hosts pages keyed by id -
 * General and Appearance drawn with the new rows, their values read from and
 * written to the settings store; any other page renders its existing
 * component inside the column unchanged (the transition rule); a plugin's
 * registered page renders the same way.
 */
const css = readFileSync("src/features/settings/settings-content.css", "utf8");

beforeEach(() => {
  localStorage.clear();
});
afterEach(cleanup);

const t = {
  settingsTitle: "设置",
  navGeneral: "通用",
  navAppearance: "外观",
  generalBasicsLabel: "基础",
  settingsFilesGroup: "文件与磁盘",
  generalSystemLabel: "系统",
  languageLabel: "语言",
  autosaveLabel: "自动保存",
  autoSuggestFilenameLabel: "自动建议文件名",
  uiTextScaleLabel: "界面文字大小",
  layoutLabel: "布局",
  activityRailLabel: "活动栏",
  titleRowLabel: "标题行",
  menuBarLabel: "菜单栏",
} as unknown as Strings;

/** A legacy-shaped page, as the old ones are: it takes SettingsPageProps. */
function LegacyPage(props: SettingsPageProps) {
  return <div data-testid="legacy-page">{props.t.navGeneral}</div>;
}

function content(page: string) {
  const def = settingsPage(page);
  if (!def) throw new Error(`no page ${page}`);
  return render(
    <SettingsProvider>
      <SettingsContent key={def.id} t={t} page={def} onOpenPage={() => {}} />
    </SettingsProvider>,
  );
}

describe("the settings content column", () => {
  it("draws General with the new rows, values from the store", () => {
    content("general");
    expect(screen.getByText("基础")).toBeTruthy();
    expect(screen.getByText("语言")).toBeTruthy();
    // The language control reads the store's current value, in that
    // language's own name.
    expect(screen.getByText("English")).toBeTruthy();
  });

  it("a General control writes through to the store", () => {
    content("general");
    fireEvent.click(screen.getByText("English"));
    const zh = screen.getByText("简体中文");
    fireEvent.pointerDown(zh, { pointerId: 1, pointerType: "mouse" });
    fireEvent.click(zh);
    // The control now shows the chosen value: the store took the write.
    expect(screen.getAllByText("简体中文").length).toBeGreaterThan(0);
  });

  it("draws Appearance with the new rows", () => {
    content("look-basic");
    expect(screen.getByText("外观")).toBeTruthy();
    expect(screen.getByText("界面文字大小")).toBeTruthy();
    // The activity rail is one of the page's switches.
    expect(screen.getAllByRole("switch").length).toBeGreaterThan(0);
  });

  it("a legacy page renders its existing component inside the column", () => {
    render(
      <SettingsProvider>
        <SettingsContent
          t={t}
          page={{ id: "legacy-test", label: () => "旧页", Page: LegacyPage }}
          onOpenPage={() => {}}
        />
      </SettingsProvider>,
    );
    expect(screen.getByTestId("legacy-page").textContent).toContain("通用");
  });

  it("a plugin-registered page renders in the same host", () => {
    const unregister = registerSettingsPage({
      id: "plugin-test",
      label: () => "插件页",
      Page: () => <div data-testid="plugin-page" />,
    });
    try {
      render(
        <SettingsProvider>
          <SettingsContent
            t={t}
            page={settingsPage("plugin-test")!}
            onOpenPage={() => {}}
          />
        </SettingsProvider>,
      );
      expect(screen.getByTestId("plugin-page")).toBeTruthy();
    } finally {
      unregister();
    }
  });

  it("the page keeps its own group headings from the board's style", () => {
    expect(css).toContain("settings-page-group");
    expect(css).toContain("font-size: var(--text-caption)");
  });
});

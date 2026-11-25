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

// The providers' catalog: one entry with its own label, so the page's list
// and panels have a provider to draw without the real catalog's fetch.
vi.mock("../../ai/provider-catalog", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useProviderCatalog: () => [
      { id: "custom", label: "Test", keyOptional: true, auth: ["custom"] },
    ],
  };
});

// The providers page's panels keep their components (the transition rule):
// their internals are not this page's contract, only their hosting is.
vi.mock("../../settings/sections/provider-auth", () => ({
  ProviderAuthPanel: () => <div data-testid="auth-panel" />,
}));
vi.mock("../../settings/sections/custom-provider", () => ({
  CustomProviderPanel: () => <div data-testid="custom-panel" />,
}));
vi.mock("../../settings/sections/agent", () => ({
  ModelListRow: () => <div data-testid="model-list" />,
  useModelListShown: () => true,
  AgentModelSection: () => null,
  WritingModelSection: () => null,
  AgentSystemPromptSection: () => null,
  AgentWorkspaceRootSection: () => null,
  AgentWorkspaceSection: () => null,
}));
vi.mock("../../settings/sections/market-skills", () => ({
  AvailableSkills: () => null,
}));

/**
 * The content column's contract: it hosts pages keyed by id -
 * General and Appearance drawn with the new rows, their values read from and
 * written to the settings store; any other page renders its existing
 * component inside the column unchanged (the transition rule); a plugin's
 * registered page renders the same way.
 */
const css = readFileSync("src/features/settings/settings-content.css", "utf8");
const paneCss = readFileSync("src/engine/controls/pane.css", "utf8");

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
  settingsTextGroup: "文本",
  settingsViewGroup: "视图",
  navMarkdown: "Markdown",
  contentWidthLabel: "内容宽度",
  contentWidthAuto: "自适应",
  contentWidthStandard: "标准",
  contentWidthFull: "全宽",
  firstLineIndentLabel: "首行缩进",
  emptyLineHintLabel: "空行提示",
  viewModeLabel: "视图模式",
  viewModeRich: "富文本",
  menuToggleSourceMode: "源码模式",
  menuToggleSplitView: "分屏",
  menuFormatBar: "格式工具栏",
  zoomTogetherLabel: "缩放联动",
  zoomTogetherHint: "缩放跟着正文走",
  menuToggleTypewriterMode: "打字机模式",
  enableMathLabel: "公式",
  enableMermaidLabel: "Mermaid 图表",
  codeLineNumbersLabel: "代码行号",
  autoCloseBracketsLabel: "自动补全括号",
  plainTextMenuLabel: "纯文本菜单",
  embedDisplayLabel: "嵌入展示",
  embedDisplayExpand: "展开",
  embedDisplayCard: "卡片",
  diagramEngineLabel: "图表引擎",
  diagramEngineHint: "Mermaid 图表的绘制引擎",
  colorSwatchesLabel: "颜色色板",
  colorSwatchesOff: "关闭",
  colorSwatchesCode: "代码里",
  colorSwatchesEverywhere: "全部",
  autoCloseMarksLabel: "自动补全标记",
  shortcutEditorGroupLabel: "查找与编辑",
  shortcutAiGroupLabel: "AI",
  shortcutHeadingsGroupLabel: "标题层级",
  menuPlugins: "插件",
  shortcutFixedGroupLabel: "固定快捷键",
  shortcutCommandPalette: "命令面板",
  menuFindReplace: "查找与替换",
  shortcutSearchFiles: "搜索文件",
  shortcutNextTab: "下一个标签页",
  shortcutPreviousTab: "上一个标签页",
  menuToggleSidebar: "显示边栏",
  menuToggleAgentPanel: "显示 Agent 面板",
  menuToggleZenMode: "专注模式",
  menuSplitRight: "向右分屏",
  shortcutTriggerCompletion: "触发补全",
  shortcutTriggerGrammarCheck: "触发语法检查",
  shortcutToggleFloatingChat: "悬浮对话",
  shortcutToggleTextusAi: "Textus AI",
  menuHeadingTemplate: "标题 {n}",
  shortcutParagraph: "正文",
  privacyChatHistoryLabel: "对话历史",
  privacyDraftRecoveryLabel: "草稿恢复",
  settingsFileLabel: "设置文件",
  imageStorageGroupLabel: "图片与存储",
  imageAlignLabel: "图片对齐",
  imageAlignCenter: "居中",
  imageAlignLeft: "左对齐",
  menuExport: "导出",
  pdfPageNumbersLabel: "PDF 页码",
  pdfLightColorsLabel: "PDF 浅色",
  exportTocLabel: "导出目录",
  exportNumberHeadingsLabel: "标题编号",
  exportNumberHeadingsHelp: "正文标题编上号",
  providersGroup: "提供者",
  memoryGroup: "记忆与技能",
  aiAskLabel: "对话",
  skillsInstalledNone: "这里还没有技能",
  extensionsAvailable: "可用技能",
  providerCustom: "自定义端点",
  providerDoubao: "豆包",
  providerMiniMax: "MiniMax",
  providerMiniMaxIntl: "MiniMax 国际",
  providerNoKeyRequired: "无需密钥",
  providerModelsGroup: "模型",
  providerKeysLocal: "密钥只存本机",
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
      <SettingsContent
        key={def.id}
        t={t}
        page={def}
        onOpenPage={() => {}}
        onClose={() => {}}
        onOpenFile={() => {}}
        onFilesDeleted={() => {}}
      />
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

  it("draws Editing with the new rows, not the legacy wrapper", () => {
    const { container } = content("edit-text");
    // The text's width and indent moved to Appearance with 1.4.6.
    expect(screen.getByText("视图")).toBeTruthy();
    expect(screen.getByText("打字机模式")).toBeTruthy();
    expect(container.querySelector(".settings-legacy-page")).toBeNull();
  });

  it("an Editing switch writes through to the store", () => {
    content("edit-text");
    const sw = screen.getByLabelText("打字机模式");
    fireEvent.click(sw);
    expect(sw.getAttribute("aria-checked")).toBe("true");
  });

  it("draws Shortcuts with the new group shells, not the legacy wrapper", () => {
    const { container } = content("shortcuts");
    expect(screen.getByText("查找与编辑")).toBeTruthy();
    expect(screen.getByText("标题层级")).toBeTruthy();
    expect(container.querySelector(".settings-legacy-page")).toBeNull();
  });

  it("draws Images with the new rows, not the legacy wrapper", () => {
    const { container } = content("edit-img");
    expect(screen.getByText("图片与存储")).toBeTruthy();
    expect(screen.getByText("图片对齐")).toBeTruthy();
    expect(container.querySelector(".settings-legacy-page")).toBeNull();
  });

  it("draws Export with the new rows, not the legacy wrapper", () => {
    const { container } = content("edit-export");
    // The nav already names the page: the content has no second title.
    expect(screen.queryByText("导出")).toBeNull();
    expect(screen.getByText("PDF 页码")).toBeTruthy();
    expect(container.querySelector(".settings-legacy-page")).toBeNull();
  });

  it("draws Privacy with the new group shells, not the legacy wrapper", () => {
    const { container } = content("privacy");
    expect(screen.getByText("对话历史")).toBeTruthy();
    expect(screen.getByText("草稿恢复")).toBeTruthy();
    expect(container.querySelector(".settings-legacy-page")).toBeNull();
  });

  it("draws Providers with the new shells, not the legacy wrapper", () => {
    const { container } = content("providers");
    expect(screen.getByText("提供者")).toBeTruthy();
    expect(container.querySelector(".settings-legacy-page")).toBeNull();
  });

  it("draws Memory with the new shells, not the legacy wrapper", () => {
    const { container } = content("memory");
    expect(screen.getByText("记忆与技能")).toBeTruthy();
    expect(container.querySelector(".settings-legacy-page")).toBeNull();
  });

  it("draws Writing assist with the new shells, not the legacy wrapper", () => {
    const { container } = content("chat");
    expect(screen.getByText("对话")).toBeTruthy();
    expect(container.querySelector(".settings-legacy-page")).toBeNull();
  });

  it("draws External tools without the legacy wrapper", () => {
    const { container } = content("mcp");
    expect(container.querySelector(".settings-legacy-page")).toBeNull();
  });

  it("a legacy page renders its existing component inside the column", () => {
    render(
      <SettingsProvider>
        <SettingsContent
          t={t}
          page={{ id: "legacy-test", label: () => "旧页", Page: LegacyPage }}
          onOpenPage={() => {}}
          onClose={() => {}}
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
            onClose={() => {}}
          />
        </SettingsProvider>,
      );
      expect(screen.getByTestId("plugin-page")).toBeTruthy();
    } finally {
      unregister();
    }
  });

  it("the page keeps its group headings through the one section label", () => {
    expect(css).toContain("settings-page-group");
    expect(paneCss).toMatch(
      /\.tx-section-label \{[^}]*font-size: var\(--text-footnote\);[^}]*font-weight: 600;[^}]*letter-spacing: 0\.08em;/s,
    );
  });
});

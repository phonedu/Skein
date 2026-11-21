// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PhoneEditorBar } from "./PhoneEditorBar";
import en from "../i18n/locales/en";
import type { Strings } from "../i18n/strings";
import { TOGGLE_FIND_REPLACE_EVENT } from "../utils/events";
import { takeTabJump } from "../editor/tab-jump";

const editorBarCss = readFileSync("src/phone/PhoneEditorBar.css", "utf8");
const mobileEditorCss = readFileSync("src/mobile/styles/editor.css", "utf8");

vi.mock("../ai/TextusAiSwitch", () => ({
  TextusAiButton: (props: { showPanel: boolean }) =>
    props.showPanel ? <button type="button">ai</button> : null,
}));

const noticed: string[] = [];
vi.mock("../engine/controls/notices", () => ({
  showNotice: (text: string) => noticed.push(text),
}));

const shared: string[] = [];
vi.mock("../platform/native-files", () => ({
  nativeFiles: {
    share: (path: string) => {
      shared.push(path);
      return Promise.resolve();
    },
  },
}));

// The sheet itself has its own tests; here we only check the bar hands it
// the right items and closes on select. A plain stub stands in for the Sheet
// so this test skips SettingsProvider and the Presence transitions.
vi.mock("../engine/controls/ActionSheet", async () => {
  const { createElement } = await import("react");
  type Item = {
    label: string;
    onSelect: () => void;
    Icon?: unknown;
    fire?: boolean;
    disabled?: boolean;
    depth?: number;
  };
  return {
    ActionSheet: ({
      items,
      onClose,
    }: {
      items: (Item | "separator")[];
      onClose: () => void;
    }) =>
      createElement(
        "div",
        { role: "menu" },
        items
          .filter((it): it is Item => it !== "separator")
          .map((item, i) =>
            createElement(
              "button",
              {
                key: i,
                role: "menuitem",
                "aria-label": item.label,
                disabled: item.disabled,
                "data-depth": item.depth,
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

afterEach(() => {
  cleanup();
  noticed.length = 0;
  shared.length = 0;
});

function setup(
  showAgent: boolean,
  sub: string | null = null,
  doc: { content?: string; path?: string | null; tabId?: string } = {},
) {
  const onBack = vi.fn();
  render(
    <PhoneEditorBar
      t={en as Strings}
      title="周三的雨.md"
      sub={sub}
      path={doc.path === undefined ? "/笔记/周三的雨.md" : doc.path}
      content={doc.content ?? ""}
      tabId={doc.tabId ?? "tab-1"}
      showAgent={showAgent}
      agentOpen={false}
      agentShortcut="⌘J"
      onBack={onBack}
      onToggleAgent={() => {}}
    />,
  );
  return { onBack };
}

describe("the phone's editor bar", () => {
  it("carries the document's name and goes back to the library", () => {
    const { onBack } = setup(true);
    expect(screen.getByText("周三的雨.md")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: en.phoneBackToLibrary }),
    );
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("keeps the folder line under the name, and none at the root", () => {
    setup(true, "交付");
    expect(screen.getByText("交付")).toBeTruthy();
    cleanup();
    setup(true);
    expect(screen.queryByText("交付")).toBeNull();
  });

  it("shows Textus AI only while the panel can open", () => {
    setup(false);
    expect(screen.queryByText("ai")).toBeNull();
    cleanup();
    setup(true);
    expect(screen.getByText("ai")).toBeTruthy();
  });

  it("opens the document action sheet from ⋯ and runs its rows", () => {
    setup(true);
    fireEvent.click(screen.getByRole("button", { name: en.phoneMoreActions }));
    expect(
      screen.getByRole("menuitem", { name: en.phoneDocActionOutline }),
    ).toBeTruthy();
    expect(
      screen.getByRole("menuitem", { name: en.phoneDocActionShare }),
    ).toBeTruthy();
    // The inbox is a fork feature, not part of this sheet.
    expect(
      screen.queryByRole("menuitem", { name: en.phoneDocActionInbox }),
    ).toBeNull();

    // Find & replace rides the existing window event the desktop uses.
    const fired = vi.fn();
    window.addEventListener(TOGGLE_FIND_REPLACE_EVENT, fired);
    fireEvent.click(
      screen.getByRole("menuitem", { name: en.phoneDocActionFind }),
    );
    expect(fired).toHaveBeenCalledOnce();
    window.removeEventListener(TOGGLE_FIND_REPLACE_EVENT, fired);
  });

  it("lists the headings in the outline sheet, indented, and jumps to one", () => {
    setup(true, null, { content: "# 第一节\n\n## 第二节\n\n### 第三节\n" });
    fireEvent.click(screen.getByRole("button", { name: en.phoneMoreActions }));
    fireEvent.click(
      screen.getByRole("menuitem", { name: en.phoneDocActionOutline }),
    );
    const first = screen.getByRole("menuitem", { name: "第一节" });
    const second = screen.getByRole("menuitem", { name: "第二节" });
    expect(first.getAttribute("data-depth")).toBe("1");
    expect(second.getAttribute("data-depth")).toBe("2");

    fireEvent.click(second);
    // The editor takes the jump by heading index (revealPosition).
    expect(takeTabJump("tab-1")).toEqual({ kind: "outline", index: 1 });
  });

  it("says so, instead of opening an empty outline", () => {
    setup(true, null, { content: "只有正文，没有标题。\n" });
    fireEvent.click(screen.getByRole("button", { name: en.phoneMoreActions }));
    fireEvent.click(
      screen.getByRole("menuitem", { name: en.phoneDocActionOutline }),
    );
    expect(noticed).toContain(en.outlineEmpty);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("shares a saved document, and offers nothing to share for an unsaved one", () => {
    setup(true);
    fireEvent.click(screen.getByRole("button", { name: en.phoneMoreActions }));
    fireEvent.click(
      screen.getByRole("menuitem", { name: en.phoneDocActionShare }),
    );
    expect(shared).toEqual(["/笔记/周三的雨.md"]);

    shared.length = 0;
    cleanup();
    setup(true, null, { path: null });
    fireEvent.click(screen.getByRole("button", { name: en.phoneMoreActions }));
    const share = screen.getByRole("menuitem", {
      name: en.phoneDocActionShare,
    }) as HTMLButtonElement;
    expect(share.disabled).toBe(true);
    fireEvent.click(share);
    expect(shared).toEqual([]);
  });

  it("keeps phone editor controls at the Android touch size", () => {
    expect(editorBarCss).toContain("width: 48px;");
    expect(editorBarCss).toContain("height: 48px;");
    expect(editorBarCss).toContain("font-size: var(--text-title);");
    expect(mobileEditorCss).toContain("padding-inline: var(--space-6);");
    expect(mobileEditorCss).toContain("line-height: 1.8;");
    expect(mobileEditorCss).toContain("font-size: 32px;");
  });
});

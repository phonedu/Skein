// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PhoneEditorBar } from "./PhoneEditorBar";
import en from "../i18n/locales/en";
import type { Strings } from "../i18n/strings";
import { TOGGLE_FIND_REPLACE_EVENT } from "../utils/events";

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
});

function setup(showAgent: boolean, sub: string | null = null) {
  const onBack = vi.fn();
  render(
    <PhoneEditorBar
      t={en as Strings}
      title="周三的雨.md"
      sub={sub}
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
      screen.getByRole("menuitem", { name: en.phoneDocActionInbox }),
    ).toBeTruthy();

    // Outline is a placeholder for now: a notice, no event.
    fireEvent.click(
      screen.getByRole("menuitem", { name: en.phoneDocActionOutline }),
    );
    expect(noticed).toContain(en.phoneComingSoon);

    // Find & replace rides the existing window event the desktop uses.
    fireEvent.click(screen.getByRole("button", { name: en.phoneMoreActions }));
    const fired = vi.fn();
    window.addEventListener(TOGGLE_FIND_REPLACE_EVENT, fired);
    fireEvent.click(
      screen.getByRole("menuitem", { name: en.phoneDocActionFind }),
    );
    expect(fired).toHaveBeenCalledOnce();
    window.removeEventListener(TOGGLE_FIND_REPLACE_EVENT, fired);
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

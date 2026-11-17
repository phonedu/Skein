// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PhoneEditorBar } from "./PhoneEditorBar";
import en from "../i18n/locales/en";
import type { Strings } from "../i18n/strings";

const editorBarCss = readFileSync("src/phone/PhoneEditorBar.css", "utf8");
const mobileEditorCss = readFileSync("src/mobile/styles/editor.css", "utf8");

vi.mock("../ai/TextusAiSwitch", () => ({
  TextusAiButton: (props: { showPanel: boolean }) =>
    props.showPanel ? <button type="button">ai</button> : null,
}));

afterEach(cleanup);

function setup(showAgent: boolean) {
  const onBack = vi.fn();
  render(
    <PhoneEditorBar
      t={en as Strings}
      title="周三的雨.md"
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

  it("shows Textus AI only while the panel can open", () => {
    setup(false);
    expect(screen.queryByText("ai")).toBeNull();
    cleanup();
    setup(true);
    expect(screen.getByText("ai")).toBeTruthy();
  });

  it("keeps phone editor controls at the Android touch size", () => {
    expect(editorBarCss).toContain("width: 48px;");
    expect(editorBarCss).toContain("height: 48px;");
    expect(editorBarCss).toContain("font-size: var(--text-body);");
    expect(mobileEditorCss).toContain("padding-inline: var(--space-6);");
    expect(mobileEditorCss).toContain("line-height: 1.8;");
  });
});

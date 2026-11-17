// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ActionSheet } from "./ActionSheet";
import { SettingsProvider } from "../../prefs/SettingsContext";

const actionSheetCss = readFileSync(
  "src/engine/controls/ActionSheet.css",
  "utf8",
);

afterEach(cleanup);

function Fire(props: { className?: string }) {
  return <span className={props.className} data-testid="fire-icon" />;
}

describe("the phone action sheet", () => {
  it("shows a grab handle, a context head, and rows with icons", () => {
    render(
      <SettingsProvider>
        <ActionSheet
          head="周三的雨.md · 162 字"
          items={[
            {
              label: "大纲",
              sub: "本篇 6 个标题",
              onSelect: () => {},
              Icon: Fire,
            },
            {
              label: "收进收集箱",
              onSelect: () => {},
              fire: true,
              Icon: Fire,
            },
          ]}
          onClose={() => {}}
        />
      </SettingsProvider>,
    );
    expect(document.querySelector(".action-sheet-grab")).toBeTruthy();
    expect(screen.getByText("周三的雨.md · 162 字")).toBeTruthy();
    expect(screen.getByText("本篇 6 个标题")).toBeTruthy();
    expect(document.querySelector(".action-sheet-item-fire")).toBeTruthy();
    expect(document.querySelectorAll('[data-testid="fire-icon"]').length).toBe(
      2,
    );
  });

  it("marks the current choice with a check", () => {
    render(
      <SettingsProvider>
        <ActionSheet
          items={[
            { label: "skein-vault", onSelect: () => {}, current: true },
            { label: "老周的书架", onSelect: () => {} },
          ]}
          onClose={() => {}}
        />
      </SettingsProvider>,
    );
    const current = screen.getByText("skein-vault").closest("button")!;
    expect(current.className).toContain("action-sheet-item-current");
    expect(current.querySelector(".action-sheet-check")).toBeTruthy();
  });

  it("runs the selected action and closes", () => {
    const onClose = vi.fn();
    const onSelect = vi.fn();
    render(
      <SettingsProvider>
        <ActionSheet items={[{ label: "分享…", onSelect }]} onClose={onClose} />
      </SettingsProvider>,
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "分享…" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("keeps the sheet's Skein shell", () => {
    expect(actionSheetCss).toContain("border-radius: 22px;");
    expect(actionSheetCss).toContain(".action-sheet-grab");
    expect(actionSheetCss).toContain(".action-sheet-item-fire");
    expect(actionSheetCss).toContain(".action-sheet-ic");
  });
});

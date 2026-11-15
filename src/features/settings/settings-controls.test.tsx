// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsRow } from "./settings-row";
import {
  SettingsCheckbox,
  SettingsSelect,
  SettingsSwitch,
} from "./settings-controls";

/**
 * The row's and the controls' contract (spec Task 4): a `.srow` row - label,
 * a small description, the value control at the end - and the three Base UI
 * controls skinned to the board: the pill select, the opaque iOS-style
 * switch, the tick checkbox. They are pure controlled parts; the store is
 * wired where pages use them (spec Task 5).
 */
const rowCss = readFileSync("src/features/settings/settings-row.css", "utf8");
const ctlCss = readFileSync(
  "src/features/settings/settings-controls.css",
  "utf8",
);

afterEach(cleanup);

const OPTIONS = [
  { value: "editor", label: "编辑器" },
  { value: "today", label: "今天" },
] as const;

describe("the settings row", () => {
  it("draws the label, the description and the value control", () => {
    render(
      <SettingsRow label="打开文件时的落点" description="直接进编辑器">
        <SettingsSelect
          value="editor"
          options={[...OPTIONS]}
          onChange={() => {}}
        />
      </SettingsRow>,
    );
    expect(screen.getByText("打开文件时的落点")).toBeTruthy();
    expect(screen.getByText("直接进编辑器")).toBeTruthy();
    // The value control reads its current label.
    expect(screen.getByText("编辑器")).toBeTruthy();
  });

  it("the row is a hairline-separated line, description under the label", () => {
    expect(rowCss).toContain("border-bottom: 1px solid");
    expect(rowCss).toContain("font-size: var(--text-caption)");
  });
});

describe("the settings select", () => {
  it("changes the value from the opened list", () => {
    const onChange = vi.fn();
    render(
      <SettingsSelect
        value="editor"
        options={[...OPTIONS]}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText("编辑器"));
    const item = screen.getByText("今天");
    // A jsdom click has no pointer: Base UI commits generic clicks on the
    // highlighted item, so the pointer's press comes first.
    fireEvent.pointerDown(item, { pointerId: 1, pointerType: "mouse" });
    fireEvent.click(item);
    expect(onChange).toHaveBeenCalledWith("today");
  });

  it("is skinned as a pill; the list opens beside the trigger", () => {
    expect(ctlCss).toContain("var(--shape-pill)");
    expect(ctlCss).toContain("var(--shadow-popover)");
  });
});

describe("the settings switch", () => {
  it("toggles through onChange with the next state", () => {
    const onChange = vi.fn();
    render(<SettingsSwitch checked={false} onChange={onChange} />);
    const sw = screen.getByRole("switch");
    expect(sw.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("is an opaque switch filled with the accent when on", () => {
    expect(ctlCss).toContain("var(--ui-accent)");
    expect(ctlCss).not.toContain("backdrop-filter");
  });
});

describe("the settings checkbox", () => {
  it("toggles through onChange with the next state", () => {
    const onChange = vi.fn();
    render(<SettingsCheckbox checked={false} onChange={onChange} />);
    const box = screen.getByRole("checkbox");
    expect(box.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(box);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("is the board's 16px tick box with a 5px-corner token radius", () => {
    expect(ctlCss).toMatch(/width:\s*16px/);
    expect(ctlCss).toContain("var(--shape-s)");
  });
});

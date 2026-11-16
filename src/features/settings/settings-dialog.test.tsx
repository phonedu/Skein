// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { SettingsDialog } from "./settings-dialog";

/**
 * The shell's contract: a Base UI Dialog skinned to the board
 * - opaque surface, the shape/shadow tokens nearest the board's values, the
 * 880×556 base box drawn at the interface's scale - with a top row (title,
 * close) and two slots: the nav column and the page's content.
 */
const css = readFileSync("src/features/settings/settings-dialog.css", "utf8");

afterEach(cleanup);

describe("the settings dialog shell", () => {
  it("renders a dialog named 设置, with a close button and both slots", () => {
    render(
      <SettingsDialog
        t={{ settingsTitle: "设置", close: "关闭" } as never}
        open
        onClose={() => {}}
        nav={<nav data-nav />}
      >
        <div data-content />
      </SettingsDialog>,
    );
    expect(screen.getByRole("dialog", { name: "设置" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "关闭" })).toBeTruthy();
    expect(document.querySelector("[data-nav]")).toBeTruthy();
    expect(document.querySelector("[data-content]")).toBeTruthy();
  });

  it("stays closed without `open`", () => {
    render(
      <SettingsDialog
        t={{ settingsTitle: "设置", close: "关闭" } as never}
        open={false}
        onClose={() => {}}
        nav={null}
      >
        <div data-content />
      </SettingsDialog>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("the sheet is the board's 880×556, at the interface's scale", () => {
    expect(css).toContain("calc(880px * var(--chrome-scale, 1))");
    expect(css).toContain("calc(556px * var(--chrome-scale, 1))");
    // Clamped to the window: a small one keeps the panel whole.
    expect(css).toContain("max-width: calc(100vw");
    expect(css).toContain("max-height: calc(100vh");
    // Base UI draws neither the panel's place nor the dim: both are fixed
    // over the window, the panel above the dim (later in the portal).
    expect(css).toContain("position: fixed");
    expect(css).toContain("inset: 0");
    // The board's radius 18 and shadow 0 34px 80px land on the nearest
    // tokens; no raw values may appear instead.
    expect(css).toContain("var(--shape-m)");
    expect(css).toContain("var(--shadow-dialog)");
    expect(css).not.toMatch(/border-radius:\s*\d+px/);
    expect(css).not.toMatch(/box-shadow:\s*\d/);
  });

  it("takes the modal's layer, so nothing draws over it", () => {
    expect(css).toContain("z-index: var(--z-modal)");
  });

  it("says it is a modal, and the window rests while it is open", () => {
    render(
      <SettingsDialog
        t={{ settingsTitle: "设置", close: "关闭" } as never}
        open
        onClose={() => {}}
        nav={null}
      >
        <div />
      </SettingsDialog>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    // The window bar rests while a modal is open (the engine's mark).
    expect(document.documentElement.hasAttribute("data-modal-open")).toBe(true);
  });
});

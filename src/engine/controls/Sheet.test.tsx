// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ActionSheet } from "./ActionSheet";
import { SettingsProvider } from "../../prefs/SettingsContext";

afterEach(cleanup);

/** A sheet with a grab handle, as the phone draws it. */
function sheet(onClose = vi.fn()) {
  render(
    <SettingsProvider>
      <ActionSheet
        items={[{ label: "分享…", onSelect: () => {} }]}
        onClose={onClose}
      />
    </SettingsProvider>,
  );
  const grab = document.querySelector(".action-sheet-grab");
  const paper = document.querySelector(".sheet") as HTMLElement;
  if (!grab) throw new Error("no grab handle");
  return { onClose, grab, paper };
}

/** A press on the handle at `y`, then a move of the finger to `to`. */
function pull(grab: Element, from: number, to: number) {
  fireEvent.pointerDown(grab, { button: 0, clientX: 100, clientY: from });
  fireEvent.pointerMove(window, {
    buttons: 1,
    clientX: 100,
    clientY: to,
  });
}

describe("a sheet's grab handle", () => {
  it("moves the sheet with the finger", () => {
    const { paper, grab } = sheet();
    pull(grab, 100, 130);
    expect(paper.style.transform).toBe("translateY(30px)");
    // The stylesheet's is-pulled rule turns transitions off while a finger
    // is on the handle.
    expect(paper.classList.contains("is-pulled")).toBe(true);
  });

  it("closes past two fifths of its height, from where it was let go", () => {
    const { onClose, paper, grab } = sheet();
    pull(grab, 100, 200);
    fireEvent.pointerUp(window, { button: 0, clientX: 100, clientY: 200 });
    expect(onClose).toHaveBeenCalledOnce();
    // The closing animation starts here, not back at the top: resetting the
    // pull first would snap the sheet up before it leaves.
    expect(paper.style.transform).toBe("translateY(100px)");
  });

  it("springs back under it, and hands the transform back", () => {
    const { onClose, paper, grab } = sheet();
    pull(grab, 100, 130);
    fireEvent.pointerUp(window, { button: 0, clientX: 100, clientY: 130 });
    expect(onClose).not.toHaveBeenCalled();
    expect(paper.style.transform).toBe("translateY(0px)");
    // The is-settling rule carries the spring; no transition is written
    // into the element itself.
    expect(paper.classList.contains("is-settling")).toBe(true);
    expect(paper.style.transition).toBe("");
    fireEvent.transitionEnd(paper);
    expect(paper.classList.contains("is-settling")).toBe(false);
    expect(paper.style.cssText).toBe("");
  });

  it("does nothing for a tap", () => {
    const { onClose, paper, grab } = sheet();
    fireEvent.pointerDown(grab, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerUp(window, { button: 0, clientX: 100, clientY: 100 });
    expect(onClose).not.toHaveBeenCalled();
    expect(paper.style.cssText).toBe("");
  });
});

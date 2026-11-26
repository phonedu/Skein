// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ActionSheet } from "./ActionSheet";
import { SettingsProvider } from "../../prefs/SettingsContext";

// jsdom loads no stylesheets, and motionAllowed() reads them: say yes here so
// the spring runs and the test can drive its frames.
vi.mock("../motion/motion", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../motion/motion")>()),
  motionAllowed: () => true,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

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

/** Frames the test drives one at a time (jsdom has no frame clock). */
function frames() {
  let queued: ((now: number) => void) | null = null;
  vi.stubGlobal("requestAnimationFrame", (run: (now: number) => void) => {
    queued = run;
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {
    queued = null;
  });
  return (now: number) => {
    const run = queued;
    queued = null;
    run?.(now);
    return run !== null;
  };
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
    let clock = 1_000;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    const next = frames();
    const { onClose, paper, grab } = sheet();
    // A slow pull: 30px over 160ms is under half a pixel a millisecond.
    fireEvent.pointerDown(grab, { button: 0, clientX: 100, clientY: 100 });
    clock += 80;
    fireEvent.pointerMove(window, { buttons: 1, clientX: 100, clientY: 115 });
    clock += 80;
    fireEvent.pointerMove(window, { buttons: 1, clientX: 100, clientY: 130 });
    clock += 80;
    fireEvent.pointerUp(window, { button: 0, clientX: 100, clientY: 130 });
    expect(onClose).not.toHaveBeenCalled();
    // It stays where the finger let go until the spring's first frame:
    // no snap back to the top first.
    expect(paper.style.transform).toBe("translateY(30px)");
    expect(paper.classList.contains("is-pulled")).toBe(true);
    // Frames bring it home; at rest the element has nothing written into it
    // and the stylesheet has it again.
    let now = clock;
    for (let i = 0; i < 120 && paper.style.transform !== ""; i++) {
      now += 16;
      next(now);
    }
    expect(paper.style.transform).toBe("");
    expect(paper.classList.contains("is-pulled")).toBe(false);
    expect(paper.style.transition).toBe("");
  });

  it("does nothing for a tap", () => {
    const { onClose, paper, grab } = sheet();
    fireEvent.pointerDown(grab, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerUp(window, { button: 0, clientX: 100, clientY: 100 });
    expect(onClose).not.toHaveBeenCalled();
    expect(paper.style.cssText).toBe("");
  });
});

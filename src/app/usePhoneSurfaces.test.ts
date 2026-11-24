// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("../engine/controls/usePhoneLayout", () => ({
  usePhoneLayout: () => true,
}));

vi.mock("../document/launch-window", () => ({
  takeWindowSession: vi.fn(async () => null),
}));

import { keptTabsRestored } from "../document/reload-tabs";
import { usePhoneSurfaces } from "./usePhoneSurfaces";

afterEach(cleanup);

it("a document opened from a plugin becomes the phone's page", () => {
  const initial: { view: unknown; path: string | null } = {
    view: undefined,
    path: null,
  };
  const { result, rerender } = renderHook(
    ({ view, path }: { view: unknown; path: string | null }) =>
      usePhoneSurfaces(view, path),
    { initialProps: initial },
  );
  expect(result.current.surface).toBe("today");

  // The launch restores the note it had in front: the phone still opens on
  // Today, and the note stays behind it.
  rerender({ view: undefined, path: "inbox/restored.md" });
  expect(result.current.surface).toBe("today");
  act(() => keptTabsRestored());
  rerender({ view: undefined, path: "inbox/restored.md" });
  expect(result.current.surface).toBe("today");

  // Capture opens the note it just wrote: the new path comes to the front.
  rerender({ view: undefined, path: "inbox/N-1.md" });
  expect(result.current.surface).toBe("doc");

  // Back to Today: the same document stays behind it.
  act(() => result.current.setSurface("today"));
  rerender({ view: undefined, path: "inbox/N-1.md" });
  expect(result.current.surface).toBe("today");

  // A second capture, a second note: its path is new, so it shows.
  rerender({ view: undefined, path: "inbox/N-2.md" });
  expect(result.current.surface).toBe("doc");

  // A plugin page is also a page in front.
  act(() => result.current.setSurface("today"));
  rerender({ view: "skein.collect.confirm", path: null });
  expect(result.current.surface).toBe("doc");
});

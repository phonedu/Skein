// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("../engine/controls/usePhoneLayout", () => ({
  usePhoneLayout: () => true,
}));

// The app was opened with a file (Open in Textus) rather than by itself.
vi.mock("../document/launch-window", () => ({
  takeWindowSession: async () => ({
    paths: ["inbox/shared.md"],
    opened: [],
  }),
}));

import { usePhoneSurfaces } from "./usePhoneSurfaces";

afterEach(cleanup);

it("a file handed to the app as it starts shows, not Today", async () => {
  const { result, rerender } = renderHook(
    ({ path }: { path: string | null }) => usePhoneSurfaces(undefined, path),
    { initialProps: { path: null as string | null } },
  );
  // The launch loads the handed file into the tab in front while it is
  // still finding out that this was not its own restore.
  rerender({ path: "inbox/shared.md" });
  await act(async () => {});
  expect(result.current.surface).toBe("doc");
});

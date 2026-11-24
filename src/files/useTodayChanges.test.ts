// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fs } from "../platform/ipc";
import { useTodayChanges } from "./useTodayChanges";

vi.mock("../platform/ipc", () => ({
  fs: { listDir: vi.fn(), readTextFile: vi.fn() },
}));

afterEach(cleanup);

const file = (path: string, name: string) => ({
  name,
  path,
  is_dir: false,
  hidden: false,
  ignored: false,
  modified_ms: Date.now(),
});

describe("today's changes", () => {
  it("shows the last walk at once when Today comes back", async () => {
    vi.mocked(fs.listDir).mockResolvedValue([
      file("/cache1/a.md", "a.md"),
    ] as never);
    vi.mocked(fs.readTextFile).mockResolvedValue("# A\n");
    const first = renderHook(() => useTodayChanges("/cache1"));
    await waitFor(() =>
      expect(first.result.current.map((c) => c.title)).toEqual(["A"]),
    );
    first.unmount();
    const listings = vi.mocked(fs.listDir).mock.calls.length;
    // The surface switched away and back: the list is there in the first
    // render, before the walk this mount started has answered.
    const second = renderHook(() => useTodayChanges("/cache1"));
    expect(second.result.current.map((c) => c.title)).toEqual(["A"]);
    await waitFor(() =>
      expect(vi.mocked(fs.listDir).mock.calls.length).toBeGreaterThan(listings),
    );
  });
});

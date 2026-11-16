// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecentSection } from "./recent-section";

afterEach(cleanup);

const t = { notesRecent: "最近", notesLibrary: "库" } as never as Parameters<
  typeof RecentSection
>[0]["t"];

describe("RecentSection", () => {
  it("the caption, and only the files inside the tree's root", () => {
    render(
      <RecentSection
        t={t}
        files={["C:/v/最近/a.md", "C:/other/b.md", "C:/v/sub/c.md"]}
        root="C:/v"
        onOpen={() => {}}
      />,
    );
    expect(screen.getByText("最近")).toBeTruthy();
    expect(screen.getByText("a.md")).toBeTruthy();
    expect(screen.getByText("c.md")).toBeTruthy();
    expect(screen.queryByText("b.md")).toBeNull();
  });

  it("a click opens the file", () => {
    const onOpen = vi.fn();
    render(
      <RecentSection t={t} files={["C:/v/a.md"]} root="C:/v" onOpen={onOpen} />,
    );
    fireEvent.click(screen.getByText("a.md"));
    expect(onOpen).toHaveBeenCalledWith("C:/v/a.md");
  });

  it("no recents inside the root, nothing drawn", () => {
    const { container } = render(
      <RecentSection
        t={t}
        files={["C:/other/b.md"]}
        root="C:/v"
        onOpen={() => {}}
      />,
    );
    expect(container.querySelector(".recent-section")).toBeNull();
  });
});

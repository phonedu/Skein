// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TodayPage } from "./TodayPage";

vi.mock("../../app/menu/recents", () => ({
  readRecents: () =>
    Promise.resolve({ files: ["C:/v/a.md", "C:/v/b.md"], folders: [] }),
}));

afterEach(cleanup);

const t = {
  navToday: "今天",
  todayGroupActive: "进行中",
  todayEmptyActive: "进行中的任务会出现在这里——先写下第一篇笔记。",
  todayGroupAssets: "该用的资产",
  todayEmptyAssets: "还没有可用的资产——判断沉淀之后才会出现。",
  todayGroupConfirm: "待确认",
  todayEmptyConfirm: "没有等你确认的提议。",
  todayRecentGroup: "最近笔记",
  todayEmptyRecent: "打开过的笔记会列在这里。",
  todayNoteCount: "{n} 篇笔记",
  todayNoteMeta: "笔记",
  todayPickTitle: "从左侧选择一件事开始",
  todayFilterQueue: "筛选队列",
  todayNoMatch: "没有匹配的笔记。",
  todayStartHint: "从一篇笔记开始：打开文件夹或直接写作，AI 与资产随后接入。",
  todayGoNotes: "去笔记",
} as never as Parameters<typeof TodayPage>[0]["t"];

function page(props: Partial<Parameters<typeof TodayPage>[0]> = {}) {
  return render(
    <TodayPage
      t={t}
      folder={null}
      onOpenFile={() => {}}
      onGoNotes={() => {}}
      {...props}
    />,
  );
}

describe("TodayPage", () => {
  // The recents arrive by promise: wait for them, then the whole page is
  // on screen.
  it("the queue's fixed groups stand with their zeros; recents as rows", async () => {
    page();
    await screen.findByText("a.md");
    for (const title of ["进行中", "该用的资产", "待确认", "最近笔记"])
      expect(screen.getByText(title)).toBeTruthy();
    expect(screen.getAllByText("0").length).toBe(3);
    expect(screen.getByText("2 篇笔记")).toBeTruthy();
    expect(screen.getAllByText("笔记").length).toBeGreaterThan(1);
  });

  it("the queue's search filters the recent rows", async () => {
    page();
    await screen.findByText("a.md");
    fireEvent.input(screen.getByLabelText("筛选队列"), {
      target: { value: "b" },
    });
    expect(screen.getByText("b.md")).toBeTruthy();
    expect(screen.queryByText("a.md")).toBeNull();
  });

  it("a row opens the note and returns to the notes view", async () => {
    const onOpenFile = vi.fn();
    const onGoNotes = vi.fn();
    page({ onOpenFile, onGoNotes });
    await screen.findByText("a.md");
    fireEvent.click(screen.getByText("a.md"));
    expect(onOpenFile).toHaveBeenCalledWith("C:/v/a.md");
    expect(onGoNotes).toHaveBeenCalled();
  });

  it("the start card invites the first note and returns to the notes", () => {
    const onGoNotes = vi.fn();
    page({ onGoNotes });
    expect(screen.getByText("从左侧选择一件事开始")).toBeTruthy();
    expect(screen.getByText(t.todayStartHint)).toBeTruthy();
    fireEvent.click(screen.getByText("去笔记"));
    expect(onGoNotes).toHaveBeenCalled();
  });
});

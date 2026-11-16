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
  todayStartHint: "从一篇笔记开始：打开文件夹或直接写作，AI 与资产随后接入。",
  todayGoNotes: "去笔记",
} as never as Parameters<typeof TodayPage>[0]["t"];

describe("TodayPage", () => {
  // The recents arrive by promise: wait for them, then the whole page is
  // on screen.
  it("the queue's fixed groups stand, with their real zeros", async () => {
    render(<TodayPage t={t} onOpenFile={() => {}} onGoNotes={() => {}} />);
    await screen.findByText("a.md");
    expect(screen.getByText("进行中")).toBeTruthy();
    expect(screen.getByText("该用的资产")).toBeTruthy();
    expect(screen.getByText("待确认")).toBeTruthy();
    // Three empty groups at zero; the recents' own badge counts two.
    expect(screen.getAllByText("0").length).toBe(3);
    expect(screen.getByText("2")).toBeTruthy();
  });

  it("the start card invites the first note and returns to the notes", () => {
    const onGoNotes = vi.fn();
    render(<TodayPage t={t} onOpenFile={() => {}} onGoNotes={onGoNotes} />);
    expect(screen.getByText(t.todayStartHint)).toBeTruthy();
    fireEvent.click(screen.getByText("去笔记"));
    expect(onGoNotes).toHaveBeenCalled();
  });

  it("the recent notes group lists the window's recents", async () => {
    render(<TodayPage t={t} onOpenFile={() => {}} onGoNotes={() => {}} />);
    await screen.findByText("a.md");
    expect(screen.getByText("b.md")).toBeTruthy();
  });
});

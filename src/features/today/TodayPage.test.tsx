// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TodayPage } from "./TodayPage";

vi.mock("../../app/menu/recents", () => ({
  readRecents: () =>
    Promise.resolve({ files: ["C:/v/a.md", "C:/v/b.md"], folders: [] }),
}));

afterEach(cleanup);

const t = {
  todayGroupActive: "进行中",
  todayEmptyActive: "进行中的任务会出现在这里——先写下第一篇笔记。",
  todayGroupAssets: "该用的资产",
  todayEmptyAssets: "还没有可用的资产——判断沉淀之后才会出现。",
  todayGroupConfirm: "待确认",
  todayEmptyConfirm: "没有等你确认的提议。",
  todayRecentGroup: "最近笔记",
} as never as Parameters<typeof TodayPage>[0]["t"];

describe("TodayPage", () => {
  it("the three groups' places speak their empty states", async () => {
    render(<TodayPage t={t} onOpenFile={() => {}} onGoNotes={() => {}} />);
    await screen.findByText("a.md");
    expect(screen.getByText("进行中")).toBeTruthy();
    expect(screen.getByText("该用的资产")).toBeTruthy();
    expect(screen.getByText("待确认")).toBeTruthy();
    expect(
      screen.getByText("进行中的任务会出现在这里——先写下第一篇笔记。"),
    ).toBeTruthy();
  });

  it("the recent notes group lists the window's recents", async () => {
    render(<TodayPage t={t} onOpenFile={() => {}} onGoNotes={() => {}} />);
    expect((await screen.findByText("a.md")).textContent).toBe("a.md");
    expect(screen.getByText("b.md")).toBeTruthy();
  });
});

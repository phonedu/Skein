// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AssetsPage } from "./AssetsPage";

afterEach(cleanup);

const t = {
  assetsEmpty: "完成一次真实交付、沉淀一条判断之后，可复用的资产会出现在这里。",
} as never as Parameters<typeof AssetsPage>[0]["t"];

describe("AssetsPage", () => {
  it("the empty state speaks, centred", () => {
    const { container } = render(<AssetsPage t={t} />);
    expect(screen.getByText(t.assetsEmpty)).toBeTruthy();
    expect(container.querySelector(".assets-empty")).toBeTruthy();
  });
});

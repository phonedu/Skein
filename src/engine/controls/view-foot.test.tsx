// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ViewFoot } from "./view-foot";

afterEach(cleanup);

describe("ViewFoot", () => {
  it("the note at the left, the fact at the right", () => {
    render(<ViewFoot left="Markdown 就是全部" right="共 128 篇" />);
    expect(screen.getByText("Markdown 就是全部")).toBeTruthy();
    expect(screen.getByText("共 128 篇")).toBeTruthy();
  });

  it("no fact, no right slot", () => {
    const { container } = render(<ViewFoot left="Markdown 就是全部" />);
    expect(container.querySelector(".view-foot-count")).toBeNull();
  });

  it("an empty fact reads as none", () => {
    const { container } = render(<ViewFoot left="x" right="" />);
    expect(container.querySelector(".view-foot-count")).toBeNull();
  });
});

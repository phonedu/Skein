// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PhonePager } from "./PhonePager";

afterEach(cleanup);

const css = readFileSync("src/phone/PhonePager.css", "utf8");

const renderPager = (page: "today" | "files") =>
  render(
    <PhonePager
      page={page}
      onChange={() => {}}
      header={<div>the top</div>}
      today={<div>the day</div>}
      files={<div>the library</div>}
    />,
  );

const pageOf = (name: "today" | "files") =>
  document.querySelector(`.phone-pager-page[data-pager-page="${name}"]`)!;

describe("the phone's two home pages", () => {
  it("keeps the top row outside the track that slides", () => {
    renderPager("today");
    const head = document.querySelector(".phone-pager-head");
    expect(head?.textContent).toContain("the top");
    expect(
      document.querySelector(".phone-pager-track .phone-pager-head"),
    ).toBeNull();
  });

  it("starts on Today; the library is not laid out until it is needed", () => {
    renderPager("today");
    expect(document.body.textContent).toContain("the day");
    // The tree is a read of the vault: it waits for the page's first need.
    expect(document.body.textContent).not.toContain("the library");
    expect(pageOf("files").getAttribute("aria-hidden")).toBe("true");
    expect(pageOf("files").hasAttribute("inert")).toBe(true);
    expect(pageOf("today").hasAttribute("inert")).toBe(false);
  });

  it("lays the library out once it is the page, and leaves Today out of reach", () => {
    const { rerender } = renderPager("today");
    rerender(
      <PhonePager
        page="files"
        onChange={() => {}}
        header={<div>the top</div>}
        today={<div>the day</div>}
        files={<div>the library</div>}
      />,
    );
    expect(document.body.textContent).toContain("the library");
    expect(pageOf("files").getAttribute("aria-hidden")).toBeNull();
    expect(pageOf("today").getAttribute("aria-hidden")).toBe("true");
    expect(pageOf("today").hasAttribute("inert")).toBe(true);
  });

  it("travels on the motion tokens, and only by its transform", () => {
    expect(css).toMatch(
      /transition: transform var\(--dur-slow\) var\(--ease-settle\);/,
    );
    expect(css).toMatch(
      /\.phone-pager\[data-page="files"\]\s*\.phone-pager-track \{\s*transform: translate3d\(-100%, 0, 0\);/,
    );
    // No copied clock: durations come from the tokens the reduced-motion
    // switch shortens.
    expect(css).not.toMatch(/\b\d+(\.\d+)?m?s\b/);
  });
});

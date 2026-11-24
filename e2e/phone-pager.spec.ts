import { expect, type Page, test } from "@playwright/test";
import { openApp } from "./helpers";
import { openPath } from "./plugin-helpers";

// The phone's two home pages are one track: a sideways drag in the middle of
// the page takes Today to the library and back, while the page's own vertical
// scroll, its rows' holds and their taps keep their gestures.
test.use({
  userAgent:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});

/** A finger's drag by CDP: Playwright's touch screen only taps. */
async function swipe(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  { steps = 12, stepMs = 0 } = {},
) {
  const cdp = await page.context().newCDPSession(page);
  const touch = (
    type: "touchStart" | "touchMove" | "touchEnd",
    x: number,
    y: number,
  ) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: type === "touchEnd" ? [] : [{ x, y }],
    });
  await touch("touchStart", from.x, from.y);
  for (let i = 1; i <= steps; i++) {
    await touch(
      "touchMove",
      from.x + ((to.x - from.x) * i) / steps,
      from.y + ((to.y - from.y) * i) / steps,
    );
    // Real time: a slow drag is what the release's speed reads.
    if (stepMs) await page.waitForTimeout(stepMs);
  }
  await touch("touchEnd", to.x, to.y);
  await cdp.detach();
}

const today = (page: Page) => page.locator(".phone-today");
const library = (page: Page) => page.locator(".phone-home");

test("a swipe takes Today to the library and back", async ({ page }) => {
  await openApp(page, {
    settings: { language: "zh" },
    ready: ".phone-today",
    animations: true,
  });
  // What the track does as the finger goes: every move takes it further
  // left, from Today towards the library.
  await page.evaluate(() => {
    const log: number[] = [];
    (window as unknown as { __pagerDrags: number[] }).__pagerDrags = log;
    document.querySelector(".phone-pager")?.addEventListener(
      "touchmove",
      () => {
        const track = document.querySelector<HTMLElement>(".phone-pager-track");
        if (track?.style.transform)
          log.push(new DOMMatrixReadOnly(track.style.transform).m41);
      },
      { passive: true },
    );
  });
  await swipe(page, { x: 320, y: 420 }, { x: 60, y: 420 });
  await expect(library(page)).toBeVisible();
  await expect(library(page).locator(".ph-empty")).toBeVisible();
  await expect(
    library(page).getByRole("tab", { name: "文件" }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(today(page)).toBeHidden();
  // A swipe is not a tap on whatever it crossed.
  await expect(page.locator(".phone-editor-bar")).toHaveCount(0);
  // The page off the screen is clipped, not a sideways scroll.
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
  ).toBeLessThanOrEqual(0);

  const offsets = await page.evaluate(
    () => (window as unknown as { __pagerDrags: number[] }).__pagerDrags,
  );
  expect(offsets.length).toBeGreaterThan(4);
  expect(offsets.every((offset) => offset <= 0)).toBe(true);
  // The last move has the track most of a page across, under the finger.
  expect(offsets[offsets.length - 1]).toBeLessThan(-180);

  await swipe(page, { x: 60, y: 420 }, { x: 320, y: 420 });
  await expect(today(page)).toBeVisible();
  await expect(library(page)).toBeHidden();
  await expect(today(page).getByRole("tab", { name: "今天" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("a short, slow pull comes back to the page it left", async ({ page }) => {
  await openApp(page, {
    settings: { language: "zh" },
    ready: ".phone-today",
    animations: true,
  });
  // 80px over about a third of a second: not far enough, not fast enough.
  await swipe(page, { x: 300, y: 420 }, { x: 220, y: 420 }, { stepMs: 25 });
  await expect(today(page)).toBeVisible();
  await expect(library(page)).toBeHidden();
});

test("a vertical drag is the page's scroll, not a page switch", async ({
  page,
}) => {
  await openApp(page, {
    settings: { language: "zh" },
    ready: ".phone-today",
  });
  await swipe(page, { x: 195, y: 500 }, { x: 195, y: 240 });
  await expect(today(page)).toBeVisible();
  await expect(library(page)).toBeHidden();
});

test("a swipe across a file row goes back without opening it", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    const files = { "/proj/work/note.md": "# note\n" };
    w.__devFs = files;
    w.__devFiles = files;
  });
  await openApp(page, {
    settings: { language: "zh" },
    ready: ".phone-today",
  });
  // A document roots the library at its folder (ui-contracts' own way in:
  // the dev picker stands in for a phone's system folder picker).
  await openPath(page, "/proj/work/note.md");
  await page.getByRole("button", { name: "回到文件库" }).tap();
  await today(page).getByRole("tab", { name: "文件" }).tap();
  const row = page.locator(".tree-row", { hasText: "note.md" });
  await expect(row).toBeVisible();

  const box = (await row.boundingBox())!;
  const y = box.y + box.height / 2;
  await swipe(page, { x: box.x + 40, y }, { x: box.x + 260, y });
  await expect(today(page)).toBeVisible();
  await expect(library(page)).toBeHidden();
  // The row's click, sent as the finger lifts, is not a tap.
  await expect(page.locator(".phone-editor-bar")).toHaveCount(0);
});

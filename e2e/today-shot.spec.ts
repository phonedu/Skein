import { expect, test } from "@playwright/test";
import { openApp } from "./helpers";

// A visual check: the today view at a real viewport, screenshotted whole
// and its queue zoomed, for the board comparison.
test("shot: the today view", async ({ page }) => {
  await openApp(page, { settings: { menuBarShown: false } });
  await page.locator('.activity-rail-item[aria-label="今天"]').click();
  await expect(page.locator(".today-page")).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({
    path: "test-results/today-view.png",
    fullPage: false,
  });
  await page
    .locator(".today-queue")
    .screenshot({ path: "test-results/today-queue-zoom.png", scale: "css" });
  const boxes = await page.evaluate(() => {
    const box = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
      };
    };
    return {
      pane: box(".main-pane"),
      page: box(".today-page"),
      queue: box(".today-queue"),
      head: box(".today-q-head"),
      search: box(".today-q-search"),
      firstGroup: box(".today-q-group"),
      firstRow: box(".today-q-row"),
    };
  });
  console.log("BOXES:", JSON.stringify(boxes));
  // The queue is the board's 316.
  expect(boxes.queue.w).toBe(316);
});

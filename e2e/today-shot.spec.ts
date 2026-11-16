import { expect, test } from "@playwright/test";
import { openApp } from "./helpers";

// A diagnostic shot: the today view at a real viewport, screenshotted.
test("shot: the today view", async ({ page }) => {
  await openApp(page, { settings: { menuBarShown: false } });
  await page.locator('.activity-rail-item[aria-label="今天"]').click();
  await expect(page.locator(".today-page")).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: "test-results/today-view.png", fullPage: false });
  await page
    .locator(".today-queue")
    .screenshot({ path: "test-results/today-queue-zoom.png", scale: "css" });
  const boxes = await page.evaluate(() => {
    const box = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    };
    return {
      shell: box(".app-shell"),
      pane: box(".main-pane"),
      page: box(".today-page"),
      queue: box(".today-queue"),
      main: box(".today-main"),
      firstTitle: box(".today-group-title"),
    };
  });
  console.log("BOXES:", JSON.stringify(boxes));
});

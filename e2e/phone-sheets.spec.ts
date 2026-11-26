import { expect, type Page, test } from "@playwright/test";
import { openApp } from "./helpers";

// A phone's sheet under a finger: it follows the grab handle, closes on a
// flick down even when short, and comes back on a slow, short pull.
test.use({
  userAgent:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});

/** A finger's pull down from the grab handle, by CDP. */
async function pull(
  page: Page,
  distance: number,
  { steps, stepMs = 0 }: { steps: number; stepMs?: number },
) {
  const grab = (await page.locator(".action-sheet-grab").boundingBox())!;
  const x = grab.x + grab.width / 2;
  const y = grab.y + grab.height / 2;
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", at: number) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: type === "touchEnd" ? [] : [{ x, y: at }],
    });
  await touch("touchStart", y);
  for (let i = 1; i <= steps; i++) {
    await touch("touchMove", y + (distance * i) / steps);
    // Real time: a slow pull is what the release's speed reads.
    if (stepMs) await page.waitForTimeout(stepMs);
  }
  await touch("touchEnd", y + distance);
  await cdp.detach();
}

const sheet = (page: Page) => page.locator(".action-sheet");

async function openSheet(page: Page) {
  await page.locator(".ptop-ic").first().tap();
  await expect(sheet(page)).toBeVisible();
}

test("a quick, short flick down closes the sheet", async ({ page }) => {
  await openApp(page, { settings: { language: "zh" }, ready: ".phone-today" });
  await openSheet(page);
  // 60px in a few frames: short of the distance threshold, fast enough.
  await pull(page, 60, { steps: 3 });
  await expect(sheet(page)).toHaveCount(0);
});

test("a slow, short pull springs back and leaves the sheet open", async ({
  page,
}) => {
  await openApp(page, { settings: { language: "zh" }, ready: ".phone-today" });
  await openSheet(page);
  // 40px over about a fifth of a second: neither far nor fast enough.
  await pull(page, 40, { steps: 8, stepMs: 20 });
  await expect(sheet(page)).toBeVisible();
});

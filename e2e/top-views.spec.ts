import { expect, test, type Page } from "@playwright/test";
import { openApp } from "./helpers";

// The rail's top views (the notes board's rail): today, notes, assets -
// the pages stand alone over the main pane, and the notes workspace comes
// back with its sidebar when a workspace tab asks for it.

const railButton = (page: Page, name: string) =>
  page.locator(".activity-rail-item", { hasText: undefined }).filter({
    has: page.locator(`[aria-label="${name}"]`),
  });

async function open(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openApp(page, { settings: { menuBarShown: false } });
  return errors;
}

test("today stands alone: its groups draw without an error", async ({
  page,
}) => {
  const errors = await open(page);
  await page.locator('.activity-rail-item[aria-label="今天"]').click();
  await expect(page.locator(".today-page")).toBeVisible();
  // The page fills the main pane, not a stray grid cell.
  const box = await page.locator(".today-page").boundingBox();
  expect(box.width).toBeGreaterThan(500);
  await expect(
    page.locator(".today-group-title", { hasText: "进行中" }),
  ).toBeVisible();
  await expect(page.getByText("最近笔记")).toBeVisible();
  expect(errors).toEqual([]);
});

test("assets stands alone with its empty state", async ({ page }) => {
  const errors = await open(page);
  await page.locator('.activity-rail-item[aria-label="资产"]').click();
  await expect(page.locator(".assets-page")).toBeVisible();
  const box = await page.locator(".assets-page").boundingBox();
  expect(box.width).toBeGreaterThan(500);
  expect(errors).toEqual([]);
});

test("notes is the workspace: the sidebar comes back", async ({ page }) => {
  await open(page);
  await page.locator('.activity-rail-item[aria-label="今天"]').click();
  await expect(page.locator(".today-page")).toBeVisible();
  await page.locator('.activity-rail-item[aria-label="笔记"]').click();
  // With no folder opened, the panel shows the start actions; with one, the
  // tree. Either way the notes workspace is back.
  await expect(
    page.locator(".sidebar-start").or(page.locator(".file-tree")),
  ).toBeVisible();
});

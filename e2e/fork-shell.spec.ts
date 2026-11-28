import { expect, test } from "@playwright/test";
import { hasPlugin, openWithPlugins } from "./plugin-helpers";

// The fork's shell: no activity rail. The plugin entry is the window bar's
// button; on a desktop and a tablet it opens the left column's Plugins
// view, whose catalog lists the pages the installed plugins declare. A
// phone and a fold have no column, so their button's QuickPick is their
// way in (the phone specs own those flows).

test("the activity rail is gone, and the plugin catalog is the left column's view", async ({
  page,
}) => {
  test.skip(!hasPlugin("skein.collect"), "no skein.collect checkout");
  await page.setViewportSize({ width: 1180, height: 780 });
  await openWithPlugins(page, {
    plugins: { "skein.collect": ["files.read", "files.write"] },
    language: "zh",
  });
  await expect(page.locator(".activity-rail")).toHaveCount(0);

  const column = page.locator(".sidebar");
  await page.getByRole("button", { name: "插件" }).first().click();
  // The column opened on its Plugins view, the catalog inside it.
  await expect(column.getByRole("tab", { name: "插件" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(column.locator(".plugin-catalog")).toBeVisible();
  // The plugin's page is one of the catalog's rows.
  await expect(
    column.locator(".plugin-catalog-row").filter({ hasText: "资产" }).first(),
  ).toBeVisible();
  // One entry, not two: the right column carries no catalog of its own.
  await expect(page.locator(".right-panel .plugin-catalog")).toHaveCount(0);

  // The column put away, the same button opens it again, on Plugins.
  await page.locator(".window-bar-sidebar-toggle").click();
  await expect(column).toHaveClass(/sidebar-collapsed/);
  await page.getByRole("button", { name: "插件" }).first().click();
  await expect(column).not.toHaveClass(/sidebar-collapsed/);
  await expect(column.getByRole("tab", { name: "插件" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

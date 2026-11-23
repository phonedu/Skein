import { expect, test } from "@playwright/test";
import { hasPlugin, openWithPlugins } from "./plugin-helpers";

// The fork's shell after H0: no activity rail; the plugin entry is the
// window bar's button, a QuickPick over the plugins' pages and commands.
// (The upstream rail's own flows live upstream; the fork removed the rail
// with the H0 shell, so this is the shell that must hold.)

test("the activity rail is gone, and plugins open from the window bar", async ({
  page,
}) => {
  test.skip(!hasPlugin("skein.collect"), "no skein.collect checkout");
  await page.setViewportSize({ width: 1180, height: 780 });
  await openWithPlugins(page, {
    plugins: { "skein.collect": ["files.read", "files.write"] },
    language: "zh",
  });
  await expect(page.locator(".activity-rail")).toHaveCount(0);

  await page.getByRole("button", { name: "插件" }).first().click();
  const launcher = page.getByRole("listbox");
  await expect(launcher).toBeVisible();
  // The plugin's page is one of the launcher's entries.
  await expect(
    launcher.getByRole("option").filter({ hasText: "资产" }).first(),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(launcher).toHaveCount(0);
});

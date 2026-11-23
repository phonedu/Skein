import { expect, test } from "@playwright/test";
import { emit, settled } from "./helpers";
import { hasPlugin, openWithPlugins } from "./plugin-helpers";

// The Skein collect plugin (fork-private, unpublished): its capture form
// lands a raw note in the open folder's inbox/. Skips unless the plugin
// is copied into the checkout's plugins/ (skein-plugins/skein-collect →
// plugins/skein.collect), as the README there says.
test("skein.collect: capture lands the form's line as an inbox note", async ({
  page,
}) => {
  test.skip(
    !hasPlugin("skein.collect"),
    "no skein.collect in the plugins checkout",
  );
  await page.setViewportSize({ width: 1280, height: 760 });
  // The folder, picked and really opened (a plugin's file commands need
  // an open folder - [noFolder] otherwise), before the plugins come on.
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__devFs = { "/proj/one.md": "# One\n" };
    w.__devPickFolder = "/proj";
  });
  await openWithPlugins(page, {
    plugins: { "skein.collect": ["files.read", "files.write"] },
    language: "zh",
  });
  await emit(page, "menu-open-folder");
  // The shell opens on Today; the tree lives under the Files segment.
  await page.locator(".sidebar-view-seg button", { hasText: "文件" }).click();
  await expect(page.locator(".tree-row", { hasText: "one.md" })).toBeVisible();

  // The command, the way its Plugins-menu item reaches the app.
  await page.waitForFunction(() =>
    (
      window as unknown as { __devListening: (n: string) => boolean }
    ).__devListening("menu-plugin-command"),
  );
  await emit(page, "menu-plugin-command", "skein.collect.capture");

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox").fill("买一台除湿机");
  await dialog.getByRole("button", { name: "收下" }).click();
  await settled(page);

  // The note is in the dev FS: the library's inbox/N-…, front matter
  // without `type` - a capture is a card of the loop from the moment it
  // is saved.
  const note = await page.evaluate(() => {
    const files = (window as unknown as { __devFs?: Record<string, string> })
      .__devFs;
    const path = Object.keys(files ?? {}).find((p) =>
      /asset-library\/inbox\/N-\d{8}-[0-9a-f]{4}\.md$/.test(p),
    );
    return path ? { path, text: files![path] } : null;
  });
  expect(note, "the inbox note exists").toBeTruthy();
  expect(note!.text).toContain("status: inbox");
  expect(note!.text).not.toMatch(/^type:/m);
  expect(note!.text).toContain("\n买一台除湿机\n");
});

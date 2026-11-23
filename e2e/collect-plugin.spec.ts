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

// The frame's look comes from the host (ruling 62): the plugin asks the
// host for the open colours, derives the in-betweens and stamps them on
// each message. This asserts the bridge reached the page, not the styles.
test("skein.collect: the confirm center's frame takes the host's colours", async ({
  page,
}) => {
  test.skip(
    !hasPlugin("skein.collect"),
    "no skein.collect in the plugins checkout",
  );
  await page.setViewportSize({ width: 1280, height: 760 });
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
  await page.waitForFunction(() =>
    (
      window as unknown as { __devListening: (n: string) => boolean }
    ).__devListening("menu-plugin-command"),
  );
  await emit(page, "menu-plugin-command", "skein.collect.confirm");
  const frame = page.frameLocator(".plugin-webview-frame").first();
  await expect(frame.locator("html")).toBeVisible();
  await expect
    .poll(() => frame.locator("html").evaluate((el) => el.style.getPropertyValue("--ui-bg")))
    .not.toBe("");
  const vars = await frame.locator("html").evaluate((el) => ({
    bg: el.style.getPropertyValue("--ui-bg"),
    text: el.style.getPropertyValue("--ui-text"),
    muted: el.style.getPropertyValue("--ui-muted"),
    body: el.style.getPropertyValue("--text-body"),
  }));
  expect(vars.bg).toMatch(/^rgb\(|^#/);
  expect(vars.text).toMatch(/^rgb\(|^#/);
  expect(vars.muted).toMatch(/^rgb\(/);
  expect(vars.body).toBe("15px");
  // The same background the host window draws, not a second palette. The
  // host's token may be written as a hex; read it back the way the frame's
  // answer is given (a computed colour, rgb()).
  const hostBg = await page.evaluate(() => {
    const token = getComputedStyle(document.documentElement)
      .getPropertyValue("--ui-bg")
      .trim();
    const probe = document.createElement("span");
    probe.style.color = token;
    document.body.appendChild(probe);
    const rgb = getComputedStyle(probe).color;
    probe.remove();
    return rgb;
  });
  expect(vars.bg).toBe(hostBg);
});

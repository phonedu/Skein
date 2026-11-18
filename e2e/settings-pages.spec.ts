import { expect, test, type Page } from "@playwright/test";
import { emit, openApp, pasteMarkdown } from "./helpers";

// Settings: one dialog over the window (the board ui-d-settings) - the pages
// in its nav column, the open page in its content column; every way in lands
// there.

const PAGES = [
  "general",
  "look-basic",
  "edit-text",
  "edit-img",
  "edit-export",
  "providers",
  "chat",
  "memory",
  "mcp",
  "shortcuts",
  "privacy",
  "about",
];

const dialog = (page: Page) => page.locator(".settings-dialog");
const nav = (page: Page) => dialog(page).locator(".settings-nav");
const content = (page: Page) => dialog(page).locator(".settings-content-host");
const row = (page: Page, name: string) =>
  nav(page).getByRole("button", { name, exact: true });
const tabs = (page: Page) => page.locator(".tab-pill");
const gear = (page: Page) => page.locator(".activity-rail-settings");

async function open(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1200, height: 760 });
  await openApp(page, { settings: { menuBarShown: false } });
  return errors;
}

test("⌘, opens the dialog at General; Escape and the close button shut it; the gear opens it", async ({
  page,
}) => {
  await open(page);
  await emit(page, "menu-settings");
  await expect(dialog(page)).toBeVisible();
  await expect(row(page, "通用")).toHaveAttribute("aria-current", "page");
  await expect(content(page).locator(".settings-row").first()).toBeVisible();
  // Settings is not a tab any more: the document stays the only one.
  await expect(tabs(page)).toHaveText(["未命名"]);

  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);

  await gear(page).click();
  await expect(dialog(page)).toBeVisible();
  await dialog(page).getByRole("button", { name: "关闭" }).click();
  await expect(dialog(page)).toHaveCount(0);

  // Open, ⌘, keeps the page it shows; shut, it opens at General.
  await gear(page).click();
  await row(page, "外观").click();
  await expect(row(page, "外观")).toHaveAttribute("aria-current", "page");
  await page.keyboard.press("Escape");
  await emit(page, "menu-settings");
  await expect(row(page, "通用")).toHaveAttribute("aria-current", "page");
});

test("every page draws, in the dialog, without an error", async ({ page }) => {
  const errors = await open(page);
  await emit(page, "menu-settings");
  for (const id of PAGES) {
    await page.evaluate(
      (page) =>
        window.dispatchEvent(
          new CustomEvent("textus:open-settings-page", { detail: { page } }),
        ),
      id,
    );
    await expect(content(page).locator(":scope > *").first()).toBeVisible();
    await expect(tabs(page)).toHaveCount(1);
  }
  expect(errors).toEqual([]);
});

test("groups fold in the nav, and a page opens where the list says", async ({
  page,
}) => {
  await open(page);
  await emit(page, "menu-settings");
  // Folded until opened: the editing pages are not in the list yet.
  await expect(nav(page).getByText("图片", { exact: true })).toHaveCount(0);
  await nav(page).getByRole("button", { name: "编辑", exact: true }).click();
  await expect(nav(page).getByText("图片", { exact: true })).toBeVisible();
  await nav(page).getByRole("button", { name: "图片", exact: true }).click();
  await expect(row(page, "图片")).toHaveAttribute("aria-current", "page");
});

test("search at the nav's top jumps to a row on another page", async ({
  page,
}) => {
  await open(page);
  await emit(page, "menu-settings");
  await page.getByPlaceholder("搜索设置").fill("界面大小");
  const result = content(page).locator(".settings-search-result", {
    hasText: "界面大小",
  });
  await expect(result.first()).toBeVisible();
  await result.first().click();
  // The page the row is on opens, with the row in front of the reader.
  await expect(row(page, "外观")).toHaveAttribute("aria-current", "page");
  await expect(
    content(page).locator(".settings-row", { hasText: "界面大小" }),
  ).toBeVisible();
});

test("Check for Updates opens About and checks; a plugin's settings open its page in the dialog", async ({
  page,
}) => {
  await open(page);
  await emit(page, "menu-check-updates");
  await expect(row(page, "关于")).toHaveAttribute("aria-current", "page");
  await expect(
    content(page).locator(".settings-about-card-icon").first(),
  ).toBeVisible();
  // The check really runs: the page answers (latest, or why it could not).
  await expect(
    content(page).locator(".settings-about-status").first(),
  ).toBeVisible();
  await emit(page, "menu-plugin-command", "plugin-settings:cloud-sync");
  await expect(content(page)).toHaveAttribute(
    "data-settings-page",
    "plugin:cloud-sync",
  );
  await emit(page, "menu-manage-plugins");
  await expect(page.locator(".sidebar-title")).toHaveText("插件");
});

test("the dialog is a layer above the window's own surfaces", async ({
  page,
}) => {
  await open(page);
  await emit(page, "menu-settings");
  const layer = await dialog(page).evaluate(
    (el) => getComputedStyle(el).zIndex,
  );
  expect(layer).not.toBe("auto");
});

test("Escape in the search clears the query and leaves the dialog open", async ({
  page,
}) => {
  await open(page);
  await emit(page, "menu-settings");
  const field = page.getByPlaceholder("搜索设置");
  await field.fill("界面大小");
  await field.press("Escape");
  await expect(dialog(page)).toBeVisible();
  await expect(field).toHaveValue("");
  // The next Escape closes it.
  await field.press("Escape");
  await expect(dialog(page)).toHaveCount(0);
});

test("installed themes show as the store's do", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 760 });
  await openApp(page, {
    settings: {
      menuBarShown: false,
      userThemes: [{ id: "mine", name: "我的主题", file: "mine.css" }],
      themeId: "mine",
    },
  });
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("textus:open-settings-page", {
        detail: { page: "look-basic" },
      }),
    ),
  );
  const mine = page.locator('.settings-content-host [data-user-theme="mine"]');
  await expect(mine).toHaveClass(/theme-gallery-item/);
  await expect(mine.locator(".theme-gallery-preview")).toBeVisible();
});

test("a small window keeps the dialog whole and its page drawn", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 700 });
  await openApp(page, { settings: { menuBarShown: false } });
  await emit(page, "menu-settings");
  const box = (await dialog(page).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(900);
  expect(box.y + box.height).toBeLessThanOrEqual(700);
  await expect(content(page).locator(".settings-row").first()).toBeVisible();
});

test("the keys stay in the dialog, and a composing Escape is the input method's", async ({
  page,
}) => {
  await open(page);
  await emit(page, "menu-settings");
  await expect(dialog(page)).toBeVisible();
  // Tab walks the dialog, not the document behind it.
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    const inside = await page.evaluate(
      () => !!document.activeElement?.closest(".settings-dialog"),
    );
    expect(inside).toBe(true);
  }
  // An Escape that ends a composition belongs to the input method: the
  // dialog stays (design-language 5.5).
  await page.evaluate(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        keyCode: 229,
        bubbles: true,
      }),
    );
  });
  await expect(dialog(page)).toBeVisible();
  // A plain Escape closes it.
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);
});

test("first-line indent sets in the document's paragraphs, not a list's", async ({
  page,
}) => {
  await openApp(page, { settings: { firstLineIndent: true } });
  await pasteMarkdown(page, "One.\n\nTwo.\n\n- item\n");
  const editor = page.locator('[data-active-tab="true"] .ProseMirror');
  const indent = (sel: string) =>
    editor
      .locator(sel)
      .first()
      .evaluate((e) => parseFloat(getComputedStyle(e).textIndent));
  await expect.poll(() => indent(":scope > p")).toBeGreaterThan(0);
  expect(await indent("li p")).toBe(0);
});

test("a custom endpoint's model is picked from its list, and a name it lacks fails the test", async ({
  page,
}) => {
  await openApp(page, { settings: { textusAi: true, aiProvider: "custom" } });
  await page.evaluate(() => {
    (window as unknown as { __devInvokeResults: unknown }).__devInvokeResults =
      {
        custom_endpoint_status: {
          base_url: "http://relay.test/v1",
          api_key: null,
          has_api_key: true,
          model: "6.1sol",
        },
        fetch_custom_models: ["gpt-6.1-sol", "gpt-6.1-luna"],
        set_custom_endpoint: null,
      };
    window.dispatchEvent(
      new CustomEvent("textus:open-settings-page", {
        detail: { page: "providers" },
      }),
    );
  });
  const panel = page.locator(".providers-detail");
  await panel.getByRole("button", { name: "测试连接" }).click();
  await expect(panel.locator(".settings-error")).toContainText("6.1sol");
  // The list is now the model's choices, here and in the model pickers.
  const model = panel.getByRole("combobox", { name: "模型" });
  await model.click();
  await page.getByRole("option", { name: "gpt-6.1-luna" }).click();
  await panel.getByRole("button", { name: "测试连接" }).click();
  await expect(panel.locator(".settings-success")).toBeVisible();
  await panel.getByRole("button", { name: "保存" }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          (window as unknown as { __devInvokeCalls: { cmd: string }[] })
            .__devInvokeCalls ?? []
        ).find((c) => c.cmd === "set_custom_endpoint"),
      ),
    )
    .toMatchObject({ model: "gpt-6.1-luna" });
});

test("the search reads the pages once its box is focused, before the first letter", async ({
  page,
}) => {
  await open(page);
  await emit(page, "menu-settings");
  const box = page.locator(".settings-nav-panel input").first();
  const index = page.locator(".settings-search-index");
  await expect(index).toHaveCount(0);
  await box.focus();
  // Read before the first letter, so typing finds it ready.
  await expect(index).toHaveCount(1);
  await box.pressSequentially("字体", { delay: 30 });
  await expect(page.locator(".settings-nav-hit").first()).toBeVisible();
  await box.fill("");
  await box.blur();
  await expect(index).toHaveCount(0);
});

test("Layout switched in Settings lays the islands out again at once", async ({
  page,
}) => {
  await open(page);
  await emit(page, "menu-settings");
  await page.getByRole("button", { name: "外观" }).first().click();
  await expect(page.locator(".settings-group-note")).toContainText("经典");
  const sidebar = page.locator(".sidebar");
  const island = page.locator("section.island").first();
  const gap = async () =>
    (await island.boundingBox())!.x -
    ((await sidebar.boundingBox())!.x + (await sidebar.boundingBox())!.width);
  expect(await gap()).toBeGreaterThan(4);
  await page.getByRole("combobox", { name: "布局" }).click();
  await page.getByRole("option", { name: "经典" }).click();
  // Flush against the sidebar, with no island gap left over.
  await expect.poll(gap).toBeLessThanOrEqual(1);
});

test("a tab brought to the front by a click takes the focus without the keyboard's ring", async ({
  page,
}) => {
  await open(page);
  await emit(page, "menu-settings");
  await tabs(page).first().click();
  await tabs(page).first().locator(".tab-pill-close").click();
  await expect(tabs(page)).toHaveText(["设置：通用"]);
  const pill = tabs(page).first();
  await expect(pill).toBeFocused();
  expect(await pill.evaluate((el) => el.matches(":focus-visible"))).toBe(false);
});

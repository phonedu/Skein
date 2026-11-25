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
const nav = (page: Page) => dialog(page).locator(".settings-dialog-nav");
const content = (page: Page) => dialog(page).locator(".settings-content-host");
const row = (page: Page, name: string) =>
  nav(page).getByRole("button", { name, exact: true });
const tabs = (page: Page) => page.locator(".tab-pill");
const gear = (page: Page) => page.locator("button.sidebar-foot-settings");

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

test("every group's pages sit in the nav, and a page opens where the list says", async ({
  page,
}) => {
  await open(page);
  await emit(page, "menu-settings");
  // The fork's dialog keeps every page in sight: no fold to open first.
  await expect(nav(page).getByText("编辑", { exact: true })).toBeVisible();
  await expect(nav(page).getByText("图片", { exact: true })).toBeVisible();
  await expect(nav(page).getByText("模型设置", { exact: true })).toBeVisible();
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
  // No plugins column in the fork's shell: managing them is Extensions.
  await expect(content(page)).toHaveAttribute(
    "data-settings-page",
    "extensions",
  );
  await expect(page.getByRole("tabpanel", { name: "插件" })).toBeVisible();
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

test("custom endpoints are added, each with its name and model, and removed", async ({
  page,
}) => {
  await openApp(page, { settings: { textusAi: true } });
  await page.evaluate(() => {
    (window as unknown as { __devInvokeResults: unknown }).__devInvokeResults =
      { fetch_custom_models: ["gpt-6.1-sol", "gpt-6.1-luna"] };
    window.dispatchEvent(
      new CustomEvent("textus:open-settings-page", {
        detail: { page: "providers" },
      }),
    );
  });
  const list = page.locator(".providers-list");
  const panel = page.locator(".providers-detail");
  const saved = () =>
    page.evaluate(
      () =>
        (
          window as unknown as {
            __devStorage: {
              customEndpoints: { id: string; name: string; model: string }[];
            };
          }
        ).__devStorage.customEndpoints,
    );
  await list.getByRole("button", { name: "添加自定义接口" }).click();
  await panel.getByRole("textbox", { name: "名称" }).fill("中转 A");
  await panel
    .getByRole("textbox", { name: "接口地址" })
    .fill("http://relay-a.test/v1");
  await panel.getByRole("textbox", { name: "模型" }).fill("6.1sol");
  // Reached is not enough: a model the endpoint doesn't list fails the test.
  await panel.getByRole("button", { name: "测试连接" }).click();
  await expect(panel.locator(".settings-error")).toContainText("6.1sol");
  const model = panel.getByRole("combobox", { name: "模型" });
  await model.click();
  await page.getByRole("option", { name: "gpt-6.1-luna" }).click();
  await panel.getByRole("button", { name: "测试连接" }).click();
  await expect(panel.locator(".settings-success")).toBeVisible();
  await panel.getByRole("button", { name: "保存" }).click();
  await expect(list.getByRole("button", { name: "中转 A" })).toHaveAttribute(
    "aria-current",
    "true",
  );
  // A second relay serving the same models, chosen apart by its name.
  await list.getByRole("button", { name: "添加自定义接口" }).click();
  await panel.getByRole("textbox", { name: "名称" }).fill("中转 B");
  await panel
    .getByRole("textbox", { name: "接口地址" })
    .fill("http://relay-b.test/v1");
  await panel.getByRole("button", { name: "获取模型列表" }).click();
  await panel.getByRole("button", { name: "保存" }).click();
  await expect(list.getByRole("button", { name: "中转 B" })).toBeVisible();
  expect(await saved()).toMatchObject([
    { name: "中转 A", model: "gpt-6.1-luna" },
    { name: "中转 B", model: "gpt-6.1-sol" },
  ]);
  const chatProvider = page.getByRole("combobox", { name: "对话用的服务商" });
  await chatProvider.click();
  await page.getByRole("option", { name: "中转 B" }).click();
  await expect(chatProvider).toContainText("中转 B");
  // Removed, it leaves the lists and the chat no longer points at it.
  await list.getByRole("button", { name: "中转 B" }).click();
  await panel.getByRole("button", { name: "移除" }).click();
  await page.locator(".app-dialog .close-prompt-primary").click();
  await expect(list.getByRole("button", { name: "中转 B" })).toHaveCount(0);
  expect(await saved()).toMatchObject([{ name: "中转 A" }]);
  await expect(chatProvider).not.toContainText("中转 B");
});

test("the search reads the pages once its box is focused, before the first letter", async ({
  page,
}) => {
  await open(page);
  await emit(page, "menu-settings");
  const box = dialog(page).locator(".settings-dialog-nav input").first();
  await box.focus();
  // Typing finds a row in any page, the dialog's own included.
  await box.pressSequentially("字体", { delay: 30 });
  await expect(page.locator(".settings-search-result").first()).toBeVisible();
  await box.fill("");
  await expect(page.locator(".settings-search-result")).toHaveCount(0);
});

test("Layout switched in Settings lays the islands out again at once", async ({
  page,
}) => {
  await open(page);
  await emit(page, "menu-settings");
  await nav(page).getByRole("button", { name: "外观", exact: true }).click();
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

test("the look of earlier versions turns on in one switch, and off gives back the look before it", async ({
  page,
}) => {
  // The fork's Appearance page is decision-locked (the classic-look switch
  // is not drawn): Layout's 经典 is the one classic look the fork keeps.
  test.skip(true, "the fork's Appearance page has no classic-look switch");
  await open(page);
  await emit(page, "menu-settings");
  await nav(page).getByRole("button", { name: "外观", exact: true }).click();
  const classic = page.getByRole("switch", { name: "使用旧版本样式" });
  const rail = page.getByRole("switch", { name: "显示图标栏", exact: true });
  const titleRow = page.getByRole("switch", { name: "标题栏单独一行显示" });
  const layout = page.getByRole("combobox", { name: "布局" });
  await expect(classic).not.toBeChecked();
  await titleRow.click();
  await classic.click();
  await expect(classic).toBeChecked();
  await expect(layout).toContainText("经典");
  // The rail itself still shows while the sidebar is open.
  await expect(rail).not.toBeChecked();
  await expect(titleRow).toBeChecked();
  await classic.click();
  await expect(classic).not.toBeChecked();
  await expect(layout).toContainText("浮动岛");
  await expect(rail).toBeChecked();
  // The title row was on before: it stays on.
  await expect(titleRow).toBeChecked();
});

test("custom CSS is written from the installed themes' ⋯", async ({ page }) => {
  await open(page);
  await emit(page, "menu-settings");
  await nav(page).getByRole("button", { name: "外观", exact: true }).click();
  await expect(page.locator(".settings-tab-page textarea")).toHaveCount(0);
  await page
    .getByRole("region", { name: "已安装主题" })
    .locator(".extensions-more button")
    .click();
  await page.getByRole("menuitem", { name: "自定义 CSS…" }).click();
  const dialog = page.getByRole("dialog", { name: "自定义 CSS" });
  await dialog.getByRole("textbox").fill("#write { letter-spacing: 1px; }");
  await dialog.getByRole("button", { name: "完成" }).click();
  await expect(dialog).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() =>
        [...document.querySelectorAll("style")].some((s) =>
          s.textContent?.includes("letter-spacing: 1px"),
        ),
      ),
    )
    .toBe(true);
});

test("a tab brought to the front by a click takes the focus without the keyboard's ring", async ({
  page,
}) => {
  // Settings is a dialog in the fork, not a tab: nothing to bring to front.
  test.skip(true, "the fork keeps Settings in a dialog, not a tab");
  await open(page);
  await emit(page, "menu-settings");
  await tabs(page).first().click();
  await tabs(page).first().locator(".tab-pill-close").click();
  await expect(tabs(page)).toHaveText(["设置：通用"]);
  const pill = tabs(page).first();
  await expect(pill).toBeFocused();
  expect(await pill.evaluate((el) => el.matches(":focus-visible"))).toBe(false);
});

test("changing what one tilde reads as redraws an edited document, its text kept", async ({
  page,
}) => {
  await open(page);
  await pasteMarkdown(page, "H~2~O and 5~10人");
  const doc = page.locator(".milkdown .ProseMirror").first();
  await expect(doc.locator("sub")).toHaveText("2");
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("textus:open-settings-page", {
        detail: { page: "edit-text" },
      }),
    ),
  );
  await expect(dialog(page)).toBeVisible();
  await page.getByLabel("单个波浪线 ~文字~").click();
  await page.getByRole("option", { name: "原样显示" }).click();
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);
  await tabs(page).first().click();
  await expect(doc.locator("sub")).toHaveCount(0);
  await expect(doc).toContainText("H~2~O and 5~10人");
});

test("one newline in a paragraph breaks the line once the setting says so, its text kept", async ({
  page,
}) => {
  await open(page);
  // From a file: a paste would make two paragraphs of the two lines.
  await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown> & {
      __devEmitTauriEvent: (name: string, payload: unknown) => void;
    };
    w.__devFiles = { "/notes/lines.md": "one\ntwo" };
    w.__devEmitTauriEvent("tauri://drag-drop", {
      paths: ["/notes/lines.md"],
      position: { x: 0, y: 0 },
    });
  });
  const doc = page.locator('[data-active-tab="true"] .ProseMirror');
  await expect(doc).toContainText("one two");
  const soft = doc.locator('[data-type="hardbreak"][data-is-inline="true"]');
  const drawn = () =>
    soft.evaluate((el) => getComputedStyle(el, "::after").content);
  await expect(soft).toHaveCount(1);
  await expect(doc).not.toHaveAttribute("data-line-breaks");
  expect(await drawn()).toBe("none");
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("textus:open-settings-page", {
        detail: { page: "edit-text" },
      }),
    ),
  );
  await expect(dialog(page)).toBeVisible();
  await page.getByLabel("段落中的单个换行").click();
  await page.getByRole("option", { name: "换行", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);
  await tabs(page).filter({ hasText: "lines" }).click();
  await expect(doc).toHaveAttribute("data-line-breaks", "");
  expect(await drawn()).not.toBe("none");
  await expect(doc).toContainText("one two");
});

test("Make your theme opens the theme workshop in a tab of its own, filled, with the AI on or off", async ({
  page,
}) => {
  for (const textusAi of [true, false]) {
    await page.setViewportSize({ width: 1200, height: 760 });
    await openApp(page, { settings: { menuBarShown: false, textusAi } });
    await emit(page, "menu-settings");
    await nav(page).getByRole("button", { name: "外观", exact: true }).click();
    await page.getByRole("button", { name: "制作你的主题" }).click();
    await expect(page.locator(".theme-workshop")).toBeVisible();
    const box = await page.locator(".theme-workshop-studio").boundingBox();
    expect(box?.height ?? 0).toBeGreaterThan(400);
  }
});

test("the margin views are offered as the document behind Settings has room for, not as its hidden page measures", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1400, height: 760 });
  await openApp(page, { settings: { menuBarShown: false } });
  // An edited draft stays mounted, out of sight, behind the Settings tab.
  await pasteMarkdown(page, "# 第一章");
  await emit(page, "menu-settings");
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("textus:open-settings-page", {
        detail: { page: "chat" },
      }),
    ),
  );
  await page.getByRole("combobox", { name: "修订显示方式" }).click();
  const list = page.getByRole("listbox", { name: "修订显示方式" });
  await expect(list.getByRole("option")).toHaveCount(3);
  await expect(list.getByRole("option", { disabled: true })).toHaveCount(0);
});

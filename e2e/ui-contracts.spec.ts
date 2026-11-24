import { expect, test, type Page } from "@playwright/test";
import { emit, openApp } from "./helpers";
import { openPath } from "./plugin-helpers";

/**
 * The fork shell's rendered contracts, on the desktop and on the phone. An
 * upstream stylesheet can out-rank a fork rule without either file changing
 * its text; v1.4.6 flattened a settings row and doubled the card hairlines
 * that way. These assert what the browser finally draws - row direction,
 * line count, hit areas, icon sizes, control shapes - not what a file says.
 *
 * The settings shell's deeper contracts are in phone-settings-shell.spec.ts.
 * This is the envelope the rest of the interface must keep; a new upstream
 * screen takes its pattern from docs/skein/specs/界面契约.md and adds its
 * own assertions here.
 */

const size = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { w: r.width, h: r.height };
    });

const sizes = (page: Page, selector: string) =>
  page.locator(selector).evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { w: r.width, h: r.height };
    }),
  );

const styleOf = (page: Page, selector: string, props: string[]) =>
  page
    .locator(selector)
    .first()
    .evaluate((el, props) => {
      const style = getComputedStyle(el);
      return Object.fromEntries(
        props.map((p) => [p, style.getPropertyValue(p)]),
      );
    }, props);

/** A drawn size with a pixel of slack: window rounding and subpixel layout
 *  move a fraction, a regression moves whole steps. */
function expectBetween(actual: number, min: number, max: number) {
  expect(actual).toBeGreaterThanOrEqual(min);
  expect(actual).toBeLessThanOrEqual(max);
}

test.describe("the desktop shell", () => {
  test.use({ viewport: { width: 1180, height: 780 } });

  test("keeps its bar, sidebar, tabs and format bar sizes", async ({
    page,
  }) => {
    await openApp(page, { settings: { language: "zh" } });

    // The window bar is one 44px row; its sidebar toggle and the settings
    // foot sit in the same 15px design at the root's step.
    expect((await size(page, ".window-bar")).h).toBeCloseTo(44, 0);
    for (const selector of [
      ".window-bar-sidebar-toggle svg",
      ".sidebar-foot-settings svg",
    ]) {
      expectBetween((await size(page, selector)).w, 20, 22);
    }

    // Today / Files is a capsule of two 24px buttons in a 28px track.
    const segment = await styleOf(page, ".sidebar-view-seg", [
      "height",
      "border-radius",
    ]);
    expect(Number.parseFloat(segment.height)).toBeCloseTo(28, 0);
    expect(segment["border-radius"]).toBe("999px");
    for (const button of await sizes(page, ".sidebar-view-seg button")) {
      expectBetween(button.h, 23, 25);
    }

    // A tab is a 36px pill; the format bar is a 40px strip whose glyphs
    // read at the root's 16px design (about 22).
    expectBetween((await size(page, ".tab-pill")).h, 35, 37);
    expectBetween((await size(page, ".format-bar")).h, 39, 41);
    const formatIcons = await sizes(page, ".format-bar-item svg");
    expect(formatIcons.length).toBeGreaterThan(6);
    for (const icon of formatIcons) expectBetween(icon.w, 21, 24);
  });

  test("keeps the file tree's row and marks", async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      w.__devFs = { "/proj/a.md": "# A\n", "/proj/notes/n.md": "# N\n" };
      w.__devPickFolder = "/proj";
    });
    await openApp(page, { settings: { language: "zh" } });
    await emit(page, "menu-open-folder");
    await page.locator(".sidebar-view-seg button", { hasText: "文件" }).click();
    await expect(page.locator(".tree-row").first()).toBeVisible();

    // A dense 28px row; the 15px design draws about 19 at the tree's own
    // step (1.25); the disclosure about 13.
    for (const row of await sizes(page, ".tree-row")) {
      expectBetween(row.h, 27, 29);
    }
    for (const icon of await sizes(page, ".tree-icon")) {
      expectBetween(icon.w, 18, 20);
    }
    expectBetween((await size(page, ".tree-row .chevron")).w, 12, 13.5);
  });

  test("keeps a note's front matter as one property line until opened", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      w.__devFiles = {
        "/work/n.md": `---
id: A-1
status: inbox
---

# N
`,
      };
    });
    await openApp(page);
    await openPath(page, "/work/n.md");
    const block = page.locator(".frontmatter-block");
    await expect(block).toHaveClass(/frontmatter-collapsed/);
    await expect(block.locator(".frontmatter-label")).toHaveText("属性 · 2 项");
    await block.locator(".frontmatter-head").click();
    await expect(block).not.toHaveClass(/frontmatter-collapsed/);
    await expect(block.locator(".frontmatter-yaml")).toContainText("id: A-1");
    // A save writes the YAML as it was.
    await page.keyboard.press("ControlOrMeta+s");
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as { __devFiles: Record<string, string> })
              .__devFiles["/work/n.md"],
        ),
      )
      .toContain("status: inbox");
  });

  test("keeps the settings dialog's nav, rows and controls", async ({
    page,
  }) => {
    await openApp(page, { settings: { language: "zh" } });
    await page.locator("button.sidebar-foot-settings").click();
    await expect(page.locator(".settings-dialog")).toBeVisible();

    // The nav is one row per page: a 40px target, a 24px mark slot whose
    // 17px design draws about 21, no hairline of its own.
    const navRows = page.locator(".settings-dialog-nav .settings-phone-row");
    expect(await navRows.count()).toBeGreaterThan(4);
    for (const row of await navRows.evaluateAll((rows) =>
      rows.map((el) => {
        const style = getComputedStyle(el);
        return { direction: style.flexDirection, minHeight: style.minHeight };
      }),
    )) {
      expect(row.direction).toBe("row");
      expect(Number.parseFloat(row.minHeight)).toBeCloseTo(40, 0);
    }
    for (const icon of await sizes(
      page,
      ".settings-dialog-nav .settings-phone-row-ic svg",
    )) {
      expectBetween(icon.w, 20, 23);
    }
    const navLine = await page
      .locator(".settings-dialog-nav .settings-phone-row")
      .nth(1)
      .evaluate((el) => getComputedStyle(el, "::before").display);
    expect(navLine).toBe("none");

    // A described row keeps the desktop's shape: words left, control at
    // the row's end, never stacked under the words.
    await page.getByRole("button", { name: "文档", exact: true }).click();
    const described = page.locator(
      ".settings-dialog .settings-row:has(.settings-row-desc)",
    );
    expect(await described.count()).toBeGreaterThan(0);
    const row = await described.first().evaluate((el) => {
      const r = el.getBoundingClientRect();
      const value = el.querySelector(".settings-row-value");
      const vr = value?.getBoundingClientRect();
      return {
        direction: getComputedStyle(el).flexDirection,
        minHeight: Number.parseFloat(getComputedStyle(el).minHeight),
        gapToEnd: vr ? r.right - vr.right : null,
      };
    });
    expect(row.direction).toBe("row");
    expect(row.minHeight).toBeCloseTo(72, 0);
    expect(row.gapToEnd).not.toBeNull();
    expectBetween(row.gapToEnd!, 0, 40);
  });
});

test.describe("the phone shell", () => {
  test.use({
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });

  test("keeps Today's bar and capture card in the 56/48 pattern", async ({
    page,
  }) => {
    await openApp(page, {
      settings: { language: "zh" },
      ready: ".phone-today",
    });

    // Written 56, drawn at the phone's 10/11: about 51. No hairline.
    const bar = await styleOf(page, ".ptop", ["height", "border-bottom-width"]);
    expectBetween(Number.parseFloat(bar.height), 50, 52);
    expect(bar["border-bottom-width"]).toBe("0px");

    // The bar's actions are 48 written (about 44 drawn); their glyphs are
    // one band, about 22-23: the folder, the settings and the ellipsis.
    for (const button of await sizes(page, ".ptop-ic")) {
      expectBetween(button.h, 43, 45);
    }
    for (const icon of await sizes(page, ".ptop-ic svg")) {
      expectBetween(icon.w, 21, 24);
    }
    expectBetween((await size(page, ".ptop-vault-icon svg")).w, 21, 23);

    // The capture card is the one sticky action: 50 written (about 45), a
    // 40 written accent plus (about 36), a glass card on the page's own
    // surface. At the top it lies flat; the shadow rides its own layer.
    const capture = await styleOf(page, ".pcapture", [
      "min-height",
      "background-color",
      "border-radius",
    ]);
    expectBetween(Number.parseFloat(capture["min-height"]), 45, 46);
    expect(capture["background-color"]).not.toBe("rgba(0, 0, 0, 0)");
    expectBetween(Number.parseFloat(capture["border-radius"]), 16, 17);
    expectBetween((await size(page, ".pcapture-icon")).w, 35, 37);
  });

  test("switches Today and Files in one tap, on the desktop's capsule", async ({
    page,
  }) => {
    await openApp(page, {
      settings: { language: "zh" },
      ready: ".phone-today",
    });

    // The desktop's capsule, full width under the bar: 44 written for a
    // finger, drawn at the phone's 10/11 (about 40).
    await expect(page.locator(".ph-views")).toBeVisible();
    for (const button of await sizes(page, ".ph-views .tx-segment")) {
      expectBetween(button.h, 39, 41);
    }

    await page.getByRole("tab", { name: "文件" }).tap();
    await expect(page.locator(".phone-home")).toBeVisible();
    await expect(page.getByRole("tab", { name: "文件" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await page.getByRole("tab", { name: "今天" }).tap();
    await expect(page.locator(".phone-today")).toBeVisible();
  });

  test("keeps the file tree one step a level, files level with folders", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      const files = {
        "/proj/work/note.md": "# note\n",
        "/proj/work/deep/deepnote.md": "# deep\n",
        "/proj/work/deep/deeper/leaf.md": "# leaf\n",
      };
      // One for the tree's listing, one for opening a document's text.
      w.__devFs = files;
      w.__devFiles = files;
    });
    await openApp(page, {
      settings: { language: "zh" },
      ready: ".phone-today",
    });
    // A document in front roots the tree at its folder (the phone's folder
    // picker is the system's, which a browser has not).
    await openPath(page, "/proj/work/note.md");
    await page.getByRole("button", { name: "回到文件库" }).tap();
    await page.getByRole("tab", { name: "文件" }).tap();
    const row = (label: string) =>
      page.locator(".tree-row", {
        has: page.locator(".tree-label", { hasText: new RegExp(`^${label}$`) }),
      });
    await expect(row("deep").first()).toBeVisible();
    await row("deep").first().tap();
    await row("deeper").first().tap();
    await expect(row("leaf.md").first()).toBeVisible();

    const left = (label: string, part: string) =>
      row(label)
        .first()
        .locator(part)
        .evaluate((el) => el.getBoundingClientRect().left);
    // Icons of files at levels 1, 2, 3: the same step between each pair.
    const noteIcon = await left("note.md", ".tree-icon");
    const deepnoteIcon = await left("deepnote.md", ".tree-icon");
    const leafIcon = await left("leaf.md", ".tree-icon");
    expectBetween(deepnoteIcon - noteIcon, 32, 35);
    expectBetween(leafIcon - deepnoteIcon, 32, 35);
    // A level-2 file's icon stands where its sibling folder's does.
    expectBetween(
      Math.abs(deepnoteIcon - (await left("deeper", ".tree-icon"))),
      0,
      1.5,
    );
    // The guide line on a level-2 row falls on the enclosing folder's
    // chevron centre (the tile's line is at its step's end).
    const guide = await row("deepnote.md")
      .first()
      .evaluate((el) => {
        const style = getComputedStyle(el);
        return {
          position: Number.parseFloat(style.backgroundPositionX),
          width: Number.parseFloat(style.backgroundSize),
        };
      });
    const chevron = await row("deep")
      .first()
      .locator(".chevron")
      .evaluate((el) => {
        const r = el.getBoundingClientRect();
        return r.left + r.width / 2;
      });
    const rowLeft = await row("deepnote.md")
      .first()
      .evaluate((el) => el.getBoundingClientRect().left);
    expectBetween(
      Math.abs(guide.position + guide.width - 1 + rowLeft - chevron),
      0,
      1.5,
    );
  });

  test("names an unsaved document a draft, and still opens it", async ({
    page,
  }) => {
    await openApp(page, {
      settings: { language: "zh" },
      ready: ".phone-today",
    });
    // A blank tab opened from the menu stays on Today; a new tab with no
    // path is no page to turn to.
    await emit(page, "menu-new-file");
    const card = page.locator(".pcard");
    await expect(card.locator(".pcard-draft")).toHaveText("草稿 · 未保存");
    await card.tap();
    await expect(page.locator(".phone-editor-bar")).toBeVisible();
    // The page says it too, where a saved page shows its folder.
    await expect(page.locator(".pe-path")).toHaveText("草稿 · 未保存");
  });

  test("gives the phone's command palette the page, and marks the chosen mode", async ({
    page,
  }) => {
    await openApp(page, {
      settings: { language: "zh" },
      ready: ".phone-today",
    });
    // A document in front, so View › Mode's entries are live.
    await page.getByRole("button", { name: "记一句…", exact: true }).tap();
    await page.getByRole("button", { name: "回到文件库" }).tap();
    const open = async () => {
      await page.getByRole("button", { name: "更多" }).tap();
      await page.getByRole("menuitem", { name: "命令面板…" }).tap();
      await expect(page.locator(".quick-pick")).toBeVisible();
    };
    const checked = () =>
      page
        .locator(".quick-pick-item:has(.quick-pick-check) .quick-pick-label")
        .allInnerTexts();

    await open();
    // The page itself, not a floating card at 12vh: full width, the page's
    // height, a finger's rows.
    const box = (await page.locator(".quick-pick").boundingBox())!;
    expectBetween(box.width, 389, 391);
    expectBetween(box.height, 700, 845);
    // 48 written, drawn at the phone's 10/11.
    for (const row of await sizes(page, ".quick-pick-item")) {
      expectBetween(row.h, 43, 45);
    }
    // The mode in force carries a check; choosing another moves it there,
    // so the palette read again says what is on instead of leaving it to
    // the page behind.
    expect(await checked()).toContain("默认");
    await page
      .locator(".quick-pick-item", { hasText: "源码模式" })
      .first()
      .tap();
    await open();
    const after = await checked();
    expect(after).toContain("源码模式");
    expect(after).not.toContain("默认");
  });

  test("Back walks the AI page home: the document, then Today", async ({
    page,
  }) => {
    await openApp(page, {
      settings: { language: "zh" },
      ready: ".phone-today",
    });
    await emit(page, "menu-new-file");
    await page.locator(".pcard").tap();
    await page.locator(".pe-ai").tap();
    await expect(page.locator(".pe-name")).toContainText("AI");
    // The AI tab's step back is the document it was opened over; the AI
    // stays open behind it for the button. Back from the document is
    // Today - it used to bring the AI page forward again, so the two
    // pages bounced forever.
    const back = () =>
      page.evaluate(() =>
        (window as unknown as { textusBack: () => boolean }).textusBack(),
      );
    await back();
    await expect(page.locator(".pe-name")).toHaveText("未命名");
    await back();
    await expect(page.locator(".phone-today")).toBeVisible();
  });

  test("starts a blank note to type in when no collect plugin is there", async ({
    page,
  }) => {
    await openApp(page, {
      settings: { language: "zh" },
      ready: ".phone-today",
    });
    // No plugin here: 记一句 opens a note at once - no naming row, no trip
    // through the library. It has no file yet, and says so.
    await page.getByRole("button", { name: "记一句…", exact: true }).tap();
    await expect(page.locator(".phone-editor-bar")).toBeVisible();
    await expect(page.locator(".pe-path")).toHaveText("草稿 · 未保存");
    await page.getByRole("button", { name: "回到文件库" }).tap();
    await expect(page.locator(".pcard-draft")).toHaveText("草稿 · 未保存");
  });

  test("keeps the editor bar's actions at one 22px size", async ({ page }) => {
    await openApp(page, {
      settings: { language: "zh" },
      ready: ".phone-today",
    });
    await page.getByRole("button", { name: "记一句…", exact: true }).tap();
    await expect(page.locator(".phone-editor-bar")).toBeVisible();

    expectBetween((await size(page, ".phone-editor-bar")).h, 50, 52);
    for (const button of await sizes(page, ".pe-ic")) {
      expectBetween(button.h, 43, 45);
    }
    // The back chevron is a 22px design; the AI mark 16 at 1.5 draws about
    // 22; the hand-drawn ellipsis 22 written draws about 20.
    expectBetween((await size(page, ".pe-ic:first-child svg")).w, 21, 23);
    expectBetween((await size(page, ".pe-ai svg")).w, 21, 23);
    expectBetween((await size(page, ".pe-more svg")).w, 19, 21);
  });

  test("keeps one empty state, pill actions and no repeated page title", async ({
    page,
  }) => {
    await openApp(page, {
      settings: { language: "zh" },
      ready: ".phone-today",
    });

    // No folder yet: the library's empty state - a 64 written chip (about
    // 58 drawn), a 20 drawn title at 650, and the reading-size hint.
    await page.getByRole("tab", { name: "文件" }).tap();
    await expect(page.locator(".ph-empty")).toBeVisible();
    expectBetween((await size(page, ".ph-empty-glyph")).w, 57, 59);
    const emptyTitle = await styleOf(page, ".ph-empty-title", [
      "font-size",
      "font-weight",
    ]);
    expectBetween(Number.parseFloat(emptyTitle["font-size"]), 19.5, 20.5);
    expect(Number(emptyTitle["font-weight"])).toBeGreaterThanOrEqual(640);
    expectBetween(
      Number.parseFloat(
        (await styleOf(page, ".ph-empty-hint", ["font-size"]))["font-size"],
      ),
      14.5,
      15.5,
    );

    // Settings' first group takes the page name already in the bar: its
    // head is not drawn (Appearance, Images); a later group keeps its own.
    await page.locator(".phone-home .ph-acts .ph-ic").last().tap();
    await page.getByRole("button", { name: "外观", exact: true }).tap();
    await expect(page.locator(".settings-phone-page")).toBeVisible();
    const firstHead = await page
      .locator(
        ".settings-phone-page .settings-page-group:first-of-type > .settings-page-group-head",
      )
      .first()
      .evaluate((el) => getComputedStyle(el).display);
    expect(firstHead).toBe("none");
    // A page action whose only pill source is the phone rule (the theme
    // gallery's Install buttons start square): drawn, and round.
    const install = page
      .locator(".settings-phone-page .tx-button", { hasText: "安装" })
      .first();
    await expect(install).toBeVisible();
    expect(
      Number.parseFloat(
        await install.evaluate((el) => getComputedStyle(el).borderRadius),
      ),
    ).toBeGreaterThan(100);
  });

  test("keeps the settings list's 24px marks and quiet chevrons", async ({
    page,
  }) => {
    await openApp(page, {
      settings: { language: "zh" },
      ready: ".phone-today",
    });
    await page.getByRole("button", { name: "设置", exact: true }).tap();
    await expect(page.locator(".settings-phone")).toBeVisible();

    // The bar has no hairline; the marks and chevrons keep their two sizes.
    const top = await styleOf(page, ".settings-phone-top", [
      "border-bottom-width",
    ]);
    expect(top["border-bottom-width"]).toBe("0px");
    for (const icon of await sizes(page, ".settings-phone-row-ic svg")) {
      expectBetween(icon.w, 23, 25);
    }
    for (const chevron of await sizes(page, ".settings-phone-row-chev svg")) {
      expectBetween(chevron.w, 19, 21);
    }
    expectBetween((await size(page, ".settings-phone-ic svg")).w, 21, 23);
  });
});

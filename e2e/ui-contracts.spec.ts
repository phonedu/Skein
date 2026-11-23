import { expect, test, type Page } from "@playwright/test";
import { emit, openApp } from "./helpers";

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
    // 58 drawn), a 20 drawn title at 650, and the footnote-sized hint.
    await page.getByRole("button", { name: "更多" }).tap();
    await page.getByRole("menuitem", { name: "文件" }).tap();
    await expect(page.locator(".ph-empty")).toBeVisible();
    expectBetween((await size(page, ".ph-empty-glyph")).w, 57, 59);
    const emptyTitle = await styleOf(page, ".ph-empty-title", [
      "font-size",
      "font-weight",
    ]);
    expectBetween(Number.parseFloat(emptyTitle["font-size"]), 19.5, 20.5);
    expect(Number(emptyTitle["font-weight"])).toBeGreaterThanOrEqual(600);
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
      .locator(".settings-page-group:first-of-type > .settings-page-group-head")
      .first()
      .evaluate((el) => getComputedStyle(el).display);
    expect(firstHead).toBe("none");
    // The page's inline actions are pills, not the desktop's 8px corner.
    for (const radius of await page
      .locator(".settings-phone-page .tx-button")
      .evaluateAll((els) => els.map((el) => getComputedStyle(el).borderRadius)))
      expect(Number.parseFloat(radius)).toBeGreaterThan(100);
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

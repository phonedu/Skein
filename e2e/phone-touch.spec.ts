import { expect, type Page, test } from "@playwright/test";
import { emit, openApp, pasteMarkdown } from "./helpers";
import { hasPlugin } from "./plugin-helpers";

// The fork's shell is decided by width: below 600 is the
// phone's single column, 600–839 the fold, 840 and up the tablet's app
// chrome. A phone turned on its side is 844 wide, so it takes the tablet's
// chrome — the tests below say what that means, rather than expecting the
// upstream's always-mobile shell.
const ANDROID = {
  userAgent:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
};
const PHONE = ANDROID;
const PHONE_SIDEWAYS = {
  ...ANDROID,
  viewport: { width: 844, height: 390 },
  screen: { width: 844, height: 390 },
};
const TABLET = {
  ...ANDROID,
  viewport: { width: 820, height: 1180 },
  screen: { width: 820, height: 1180 },
};

test.describe("a phone on its side", () => {
  test.use(PHONE_SIDEWAYS);

  test("takes the tablet's chrome, Settings a full page", async ({ page }) => {
    await openApp(page, { settings: { language: "en" } });
    await expect(page.locator("html")).toHaveAttribute(
      "data-window-chrome",
      "app",
    );
    await expect(page.locator(".window-bar")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Plugins", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Settings", exact: true }).tap();
    await expect(page.locator(".settings-phone")).toBeVisible();
    // Every category is in the list; the page scrolls, nothing clips it
    // sideways.
    await expect(page.locator(".settings-phone-row").first()).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        ),
      )
      .toBeLessThanOrEqual(1);
  });

  test("keeps its chrome clear of the cutout and the far corner", async ({
    page,
  }) => {
    await openApp(page);
    await page.evaluate(() => {
      const style = document.documentElement.style;
      style.setProperty("--native-safe-left", "47px");
      style.setProperty("--native-safe-right", "47px");
    });
    // The window bar keeps between the insets: the root is padded, and the
    // bar is positioned inside it.
    const bar = (await page.locator(".window-bar").boundingBox())!;
    expect(bar.x).toBeGreaterThanOrEqual(47);
    expect(bar.x + bar.width).toBeLessThanOrEqual(844 - 47);
    const shell = (await page.locator(".app-shell").boundingBox())!;
    expect(shell.x).toBeGreaterThanOrEqual(47);
    expect(shell.x + shell.width).toBeLessThanOrEqual(844 - 47);
  });
});

/** How wide and tall a tap still lands on the first visible `selector`,
 *  from its centre out; past the screen's edge counts, as a finger's does. */
function reach(page: Page, selector: string) {
  return page.evaluate((selector) => {
    const el = [...document.querySelectorAll<HTMLElement>(selector)].find((e) =>
      e.checkVisibility(),
    )!;
    const box = el.getBoundingClientRect();
    const [cx, cy] = [box.x + box.width / 2, box.y + box.height / 2];
    const side = (dx: number, dy: number) => {
      let n = 0;
      while (n < 30) {
        const [x, y] = [cx + dx * (n + 1), cy + dy * (n + 1)];
        if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return 30;
        const hit = document.elementFromPoint(x, y);
        if (!hit || !el.contains(hit)) break;
        n++;
      }
      return n;
    };
    return {
      width: side(-1, 0) + side(1, 0) + 1,
      height: side(0, -1) + side(0, 1) + 1,
    };
  }, selector);
}

const TOUCH_DEVICES = [
  { name: "a phone", device: PHONE },
  { name: "a touch tablet", device: TABLET },
];

for (const { name, device } of TOUCH_DEVICES)
  test.describe(`on ${name}`, () => {
    test.use(device);

    test("a command has one way in: no rail, no repeat in ⋯ or the menu", async ({
      page,
    }) => {
      const phone = name === "a phone";
      await openApp(page, {
        settings: { language: "en" },
        ...(phone ? { ready: ".phone-today" } : {}),
      });
      // The activity rail went with H0: nothing is permanent but the bar.
      await expect(page.locator(".activity-rail")).toHaveCount(0);
      if (phone) {
        // Today's ⋯ has the two app-wide ways in, each once.
        await page.getByRole("button", { name: "More actions" }).tap();
        const sheet = page.locator(".action-sheet");
        await expect(sheet).toBeVisible();
        await expect(
          sheet.getByRole("menuitem", { name: "Plugins" }),
        ).toHaveCount(1);
        await expect(
          sheet.getByRole("menuitem", { name: "Command Palette…" }),
        ).toHaveCount(1);
        // Settings is the gear beside it, not a row in the sheet.
        await expect(
          sheet.getByRole("menuitem", { name: /Settings/ }),
        ).toHaveCount(0);
        await page.getByRole("button", { name: "Cancel" }).tap();
        await expect(
          page.getByRole("button", { name: "Settings", exact: true }),
        ).toHaveCount(1);
      } else {
        // The tablet's ways in are the sidebar's Settings and the bar's
        // Plugins button, each once; no rail repeats them.
        await expect(
          page.getByRole("button", { name: "Settings", exact: true }),
        ).toHaveCount(1);
        await expect(
          page.getByRole("button", { name: "Plugins", exact: true }),
        ).toBeVisible();
      }
    });

    test("every bar, list, menu and settings control takes a fingertip tap", async ({
      page,
    }) => {
      await page.addInitScript(() => {
        Object.assign(window, {
          __devFs: { "/proj/a.md": "# A\n", "/proj/notes/n.md": "# N\n" },
          __devPickFolder: "/proj",
          __devInvokeResults: {
            "plugin:textus-files|pick_folder": { url: "file:///proj" },
            "plugin:textus-files|begin_access": { path: "/proj" },
          },
        });
      });
      const phone = name === "a phone";
      await openApp(page, {
        settings: { language: "en" },
        ...(phone ? { ready: ".phone-today" } : {}),
      });
      // 48 written draws about 44 at the phone's 10/11 (the editor bar's
      // buttons are the contract): a tap's reach is at least 43.
      const big = async (selectors: string[]) => {
        for (const selector of selectors) {
          await expect(
            page.locator(`${selector}:visible`).first(),
          ).toBeVisible();
          for (const side of ["width", "height"] as const)
            await expect.soft
              .poll(async () => (await reach(page, selector))[side], {
                message: `${selector} ${side === "width" ? "wide" : "tall"}`,
              })
              .toBeGreaterThanOrEqual(43);
        }
      };
      if (phone) {
        await big([".ptop-ic", ".pcard"]);
        await emit(page, "menu-new-file");
        await page.locator(".pcard").tap();
        await expect(page.locator(".phone-editor-bar")).toBeVisible();
        await big([".pe-ic", ".pe-more", ".tab-switcher-button"]);
        await page.locator(".pe-more").tap();
        await big([".action-sheet button"]);
        await page.getByRole("button", { name: "Cancel" }).tap();
        await page.locator(".pe-ic").first().tap();
        await page.getByRole("button", { name: "Settings", exact: true }).tap();
        await expect(page.locator(".settings-phone")).toBeVisible();
        await big([".settings-phone-row", ".settings-phone-ic"]);
      } else {
        await emit(page, "menu-open-folder");
        await expect(page.locator(".tree-row").first()).toBeVisible();
        await big([".tree-row"]);
        // Settings is a page on a tablet too; its rows take a fingertip.
        await page.getByRole("button", { name: "Settings", exact: true }).tap();
        await expect(page.locator(".settings-phone")).toBeVisible();
        await big([".settings-phone-row"]);
      }
    });
  });

test.describe("a phone's bar buttons", () => {
  test.use(PHONE);

  test("keep no grey fill once a tap is over", async ({ page }) => {
    await openApp(page, {
      settings: { language: "en" },
      ready: ".phone-today",
    });
    const more = page.getByRole("button", { name: "More actions" });
    await more.tap();
    await expect(page.locator(".action-sheet")).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).tap();
    await expect(more).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  });
});

test.describe("a phone's Extensions page", () => {
  test.use(PHONE);

  test("keeps each section's buttons level", async ({ page }) => {
    await openApp(page, {
      settings: { language: "en" },
      ready: ".phone-today",
    });
    await page.getByRole("button", { name: "Settings", exact: true }).tap();
    await expect(page.locator(".settings-phone")).toBeVisible();
    await page.getByRole("button", { name: "Extensions", exact: true }).tap();
    await expect(page.locator(".settings-group-head").first()).toBeVisible();
    await expect(page.locator(".settings-group-actions").first()).toBeVisible();
    // With a catalog, Available's sort and its Hide.
    if (hasPlugin("catvinci.abc"))
      await expect(page.getByRole("button", { name: "Hide" })).toBeVisible();
    // A group's controls sit level with one another: beside the title, or
    // wrapped together under it. (The title's own line box is taller than
    // the phone's 40px controls, so its centre is not the measure.)
    const off = await page.evaluate(() =>
      [...document.querySelectorAll(".settings-group-head")].flatMap((head) => {
        const controls = [
          ...head.querySelectorAll(
            ".settings-group-actions :is(button, .ui-select)",
          ),
        ]
          .filter((el) => el.checkVisibility())
          .map((el) => el.getBoundingClientRect());
        if (!controls.length) return [];
        const middle = controls[0].top + controls[0].height / 2;
        return controls.map((box) =>
          Math.round(Math.abs(box.top + box.height / 2 - middle)),
        );
      }),
    );
    expect(off.length).toBeGreaterThan(0);
    expect(off.filter((d) => d > 1)).toEqual([]);
  });
});

test.describe("a phone's document menu", () => {
  test.use(PHONE);

  test("opens the outline from ⋯, over the page not a sidebar", async ({
    page,
  }) => {
    // The upstream shell opened the outline from its own key in a menu; the
    // fork's phone has the bar's sheet as the way in (H0), so the test
    // follows that entry and still guards against a sidebar rail coming
    // back.
    await openApp(page, {
      settings: { language: "en" },
      ready: ".phone-today",
    });
    await emit(page, "menu-new-file");
    await page.locator(".pcard").tap();
    await expect(page.locator(".phone-editor-bar")).toBeVisible();
    await page.waitForSelector('[data-active-tab="true"] .ProseMirror');
    await pasteMarkdown(page, "# One\n\n## Two\n");
    await page.locator(".pe-more").tap();
    const sheet = page.locator(".action-sheet");
    await expect(sheet).toBeVisible();
    await sheet.getByRole("menuitem", { name: "Outline" }).tap();
    await expect(page.getByRole("menu", { name: "Outline" })).toBeVisible();
    await expect(page.locator(".activity-rail")).toHaveCount(0);
  });

  test("is the app's sheet under ⋯, its rows a fingertip tall, the outline too", async ({
    page,
  }) => {
    await openApp(page, {
      settings: { language: "en" },
      ready: ".phone-today",
    });
    await emit(page, "menu-new-file");
    await page.locator(".pcard").tap();
    await expect(page.locator(".phone-editor-bar")).toBeVisible();
    await page.waitForSelector('[data-active-tab="true"] .ProseMirror');
    await pasteMarkdown(page, "# One\n\n## Two\n");
    await page.locator(".pe-more").tap();
    const sheet = page.locator(".action-sheet");
    await expect(sheet).toBeVisible();
    for (const row of await sheet.locator("button").all())
      expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(43);
    await sheet.getByRole("menuitem", { name: "Outline" }).tap();
    await expect(page.getByRole("menu", { name: "Outline" })).toBeVisible();
  });
});

test.describe("a phone's menu from a page over the window", () => {
  test.use(PHONE);

  test("shows over Settings, taking the tap", async ({ page }) => {
    await openApp(page, {
      settings: { language: "en" },
      ready: ".phone-today",
    });
    await page.getByRole("button", { name: "Settings", exact: true }).tap();
    await expect(page.locator(".settings-phone")).toBeVisible();
    await page.getByRole("button", { name: "General", exact: true }).tap();
    const select = page.locator(".settings-pill:visible").first();
    await expect(select).toBeVisible();
    await select.tap();
    const menu = page
      .locator('.context-menu, .action-sheet, [role="listbox"]')
      .first();
    await expect(menu).toBeVisible();
    const box = (await menu.boundingBox())!;
    const onTop = await page.evaluate(
      ([x, y]) =>
        !!document
          .elementFromPoint(x, y)
          ?.closest('.context-menu, .action-sheet, [role="listbox"]'),
      [box.x + box.width / 2, box.y + box.height / 2],
    );
    expect(onTop).toBe(true);
  });
});

test.describe("a phone's unsaved-changes prompt", () => {
  test.use(PHONE);

  test("is the app's alert, its answers a fingertip tall", async ({ page }) => {
    await openApp(page, {
      settings: { language: "en" },
      ready: ".phone-today",
    });
    await emit(page, "menu-new-file");
    await page.locator(".pcard").tap();
    await expect(page.locator(".phone-editor-bar")).toBeVisible();
    await page.waitForSelector('[data-active-tab="true"] .ProseMirror');
    await pasteMarkdown(page, "Hello");
    await page.locator(".tab-switcher-button").tap();
    await page.locator(".tab-switcher-close").first().tap();
    const prompt = page.locator(".close-prompt.app-dialog");
    await expect(prompt).toBeVisible();
    for (const answer of await prompt.locator("button").all())
      expect((await answer.boundingBox())!.height).toBeGreaterThanOrEqual(43);
  });
});

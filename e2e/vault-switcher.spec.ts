import { expect, type Page, test } from "@playwright/test";
import { openApp } from "./helpers";
import { openPath } from "./plugin-helpers";

// The library switcher: the open library marked, the ones chosen before to
// switch to, a way to add one, and a trash that takes a library off the list
// and nothing off the disk.
const LIBRARIES = {
  "/proj/work/note.md": "# note\n",
  "/alpha/a.md": "# A\n",
  "/beta/b.md": "# B\n",
};

const pick = (page: Page, path: string) =>
  page.evaluate((next) => {
    (window as unknown as { __devPickFolder: string }).__devPickFolder = next;
  }, path);

test.describe("on a desktop", () => {
  test.use({ viewport: { width: 1280, height: 820 } });

  test("lists the libraries, switches, and removes one without its files", async ({
    page,
  }) => {
    await page.addInitScript((files) => {
      const w = window as unknown as Record<string, unknown>;
      w.__devFs = files;
      w.__devFiles = files;
    }, LIBRARIES);
    await openApp(page, {
      settings: { language: "zh" },
      ready: ".sidebar-vault",
    });

    const chip = page.locator(".sidebar-vault");
    const panel = page.getByRole("dialog", { name: "切换库" });
    const add = async (to: string, name: string) => {
      await pick(page, to);
      await chip.click();
      await panel.getByRole("button", { name: "添加库…" }).click();
      await expect(chip).toContainText(name);
    };

    // With no library open the panel still comes up: the way to add one.
    await pick(page, "/proj/work");
    await chip.click();
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("button", { name: "添加库…" })).toBeVisible();
    await panel.getByRole("button", { name: "添加库…" }).click();
    await expect(chip).toContainText("work");

    await add("/alpha", "alpha");
    await add("/beta", "beta");

    // The panel: the open library first with a check and no trash, then the
    // ones chosen before.
    await chip.click();
    await expect(panel.locator(".vault-row")).toHaveCount(3);
    const current = panel.locator(".vault-row[data-current]");
    await expect(current).toContainText("beta");
    await expect(current.locator(".vault-row-check")).toBeVisible();
    await expect(current.locator(".vault-row-remove")).toHaveCount(0);
    await expect(
      panel.getByRole("button", { name: "从列表移除: alpha" }),
    ).toBeVisible();
    await expect(panel.getByRole("button", { name: "添加库…" })).toBeVisible();

    // Switching: the sidebar's name follows the library opened.
    await panel
      .locator(".vault-row", { hasText: "alpha" })
      .locator(".vault-row-main")
      .click();
    await expect(panel).toHaveCount(0);
    await expect(chip).toContainText("alpha");
    await page
      .locator(".sidebar-view-seg button", { hasText: "文件" })
      .click();
    await expect(page.locator(".tree-row", { hasText: "a.md" })).toBeVisible();

    // Taking a library off the list: the row goes, the folder's files stay.
    await chip.click();
    await panel.getByRole("button", { name: "从列表移除: beta" }).click();
    await expect(panel.locator(".vault-row", { hasText: "beta" })).toHaveCount(
      0,
    );
    const kept = await page.evaluate(
      () =>
        (window as unknown as { __devFs: Record<string, string> }).__devFs[
          "/beta/b.md"
        ],
    );
    expect(kept).toBe("# B\n");
    const stored = await page.evaluate(
      () =>
        (window as unknown as { __devRecents: { folders: string[] } })
          .__devRecents.folders,
    );
    expect(stored).not.toContain("/beta");
    // The one in front stays, with its check and without a trash.
    await expect(panel.locator(".vault-row[data-current]")).toContainText(
      "alpha",
    );
  });
});

test.describe("on a phone", () => {
  test.use({
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });

  test("raises the same list from the bottom, and switches in it", async ({
    page,
  }) => {
    await page.addInitScript((files) => {
      const w = window as unknown as Record<string, unknown>;
      w.__devFs = files;
      w.__devFiles = files;
    }, LIBRARIES);
    await openApp(page, {
      settings: { language: "zh" },
      ready: ".phone-today",
    });
    // The phone's picker is the native one, not the dev shim's: the two
    // libraries are seeded as if chosen before.
    await page.evaluate(() => {
      const w = window as unknown as { __devRecents: { folders: string[] } };
      w.__devRecents.folders.push("/alpha", "/beta");
    });
    // A document roots the library at its folder: that folder is the open
    // one, and the chosen libraries stand below it.
    await openPath(page, "/proj/work/note.md");
    await page.getByRole("button", { name: "回到文件库" }).tap();

    await page.locator(".phone-today .ptop-vault").tap();
    const sheet = page.getByRole("dialog", { name: "切换库" });
    await expect(sheet).toBeVisible();
    await expect(sheet.locator(".vault-row[data-current]")).toContainText(
      "work",
    );
    await expect(
      sheet.getByRole("button", { name: "从列表移除: alpha" }),
    ).toBeVisible();
    await expect(
      sheet.getByRole("button", { name: "从列表移除: beta" }),
    ).toBeVisible();
    await expect(sheet.getByRole("button", { name: "添加库…" })).toBeVisible();
    // The hint says what the trash does.
    await expect(sheet).toContainText("不会删除文件");

    // Switch to alpha: the sheet closes and the chip takes its name.
    await sheet
      .locator(".vault-row", { hasText: "alpha" })
      .locator(".vault-row-main")
      .tap();
    await expect(sheet).toHaveCount(0);
    await expect(page.locator(".phone-today .ptop-vault")).toContainText(
      "alpha",
    );
    await page.locator(".phone-today").getByRole("tab", { name: "文件" }).tap();
    await expect(page.locator(".tree-row", { hasText: "a.md" })).toBeVisible();

    // Remove beta from the list on the library page too.
    await page.locator(".phone-home .ph-vault").tap();
    await sheet.getByRole("button", { name: "从列表移除: beta" }).tap();
    await expect(sheet.locator(".vault-row", { hasText: "beta" })).toHaveCount(
      0,
    );
    const kept = await page.evaluate(
      () =>
        (window as unknown as { __devFs: Record<string, string> }).__devFs[
          "/beta/b.md"
        ],
    );
    expect(kept).toBe("# B\n");
  });
});

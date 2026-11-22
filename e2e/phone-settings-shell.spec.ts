import { expect, test } from "@playwright/test";
import { openApp } from "./helpers";

/**
 * The phone shell's contracts, computed rather than read from the CSS: an
 * upstream stylesheet can out-rank a fork rule without either file changing
 * its text, which is exactly how the v1.4.6 merge flattened a settings row
 * and doubled the card hairlines. Run this after every upstream merge.
 */
test.use({
  userAgent:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});

const settingsRow = (page: import("@playwright/test").Page, name: string) =>
  page.getByRole("button", { name, exact: true });

const back = (page: import("@playwright/test").Page) =>
  page.locator(".settings-phone-page .settings-phone-ic").first().tap();

test("the phone settings keep the fork's row, line and field contracts", async ({
  page,
}) => {
  await openApp(page, {
    settings: { language: "zh" },
    ready: ".phone-today",
  });
  await page.getByRole("button", { name: "设置", exact: true }).tap();
  await expect(page.locator(".settings-phone")).toBeVisible();

  // The line is the following row's top edge: the last row keeps it too.
  const listLine = await page
    .locator(".settings-phone-row")
    .last()
    .evaluate((el) => getComputedStyle(el, "::before").borderTopWidth);
  expect(listLine).toBe("1px");

  // A described row keeps the desktop's shape: label/description left, the
  // control at the row's end, not under the words.
  await settingsRow(page, "文档").tap();
  const documentRow = await page
    .locator(".settings-row:has(.settings-row-desc)")
    .first()
    .evaluate((row) => {
      const style = getComputedStyle(row);
      const value = row.querySelector(".settings-row-value");
      return {
        direction: style.flexDirection,
        align: style.alignItems,
        valueAlign: value ? getComputedStyle(value).alignSelf : null,
      };
    });
  expect(documentRow).toEqual({
    direction: "row",
    align: "center",
    valueAlign: "center",
  });
  await back(page);

  // Model rows draw one inset hairline; the row's own border is the second
  // line when it is left on.
  await settingsRow(page, "模型设置").tap();
  const modelRows = await page
    .locator(".settings-group-body > .settings-row")
    .evaluateAll((rows) =>
      rows.slice(1).map((row) => ({
        borderBottom: getComputedStyle(row).borderBottomWidth,
        hairline: getComputedStyle(row).backgroundImage !== "none",
      })),
    );
  expect(modelRows.length).toBeGreaterThan(1);
  expect(modelRows.every((row) => row.borderBottom === "0px")).toBe(true);
  expect(modelRows.every((row) => row.hairline)).toBe(true);
  await back(page);

  // The proxy fields are inset with the row above and share their lines:
  // host + port, then user + password.
  await settingsRow(page, "对话与写作").tap();
  await page.locator(".settings-proxy-row").first().scrollIntoViewIfNeeded();
  const proxyRows = await page
    .locator(".settings-proxy-row")
    .evaluateAll((rows) =>
      rows.map((row) => {
        const inputs = [...row.querySelectorAll("input")];
        const tops = inputs.map((input) =>
          Math.round(input.getBoundingClientRect().top),
        );
        return {
          inputs: inputs.length,
          sameLine: new Set(tops).size === 1,
          inset: Number.parseFloat(getComputedStyle(row).paddingLeft),
        };
      }),
    );
  expect(proxyRows).toEqual([
    { inputs: 2, sameLine: true, inset: 16 },
    { inputs: 2, sameLine: true, inset: 16 },
  ]);
  await back(page);

  // The theme workshop stacks on the extensions page; its preview is not
  // pushed past the screen's edge.
  await settingsRow(page, "扩展").tap();
  await page.getByRole("button", { name: "制作你的主题", exact: true }).tap();
  await expect(page.locator(".theme-workshop")).toBeVisible();
  const workshop = await page.locator(".theme-workshop").evaluate((el) => {
    const style = getComputedStyle(el);
    const preview = el.querySelector(".theme-workshop-preview");
    return {
      direction: style.flexDirection,
      previewRight: preview
        ? Math.round(preview.getBoundingClientRect().right)
        : null,
      viewport: window.innerWidth,
    };
  });
  expect(workshop.direction).toBe("column");
  expect(workshop.previewRight).not.toBeNull();
  expect(workshop.previewRight!).toBeLessThanOrEqual(workshop.viewport);
});

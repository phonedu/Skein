import { expect, test } from "@playwright/test";
import { PHONE, emit, settled } from "./helpers";
import { hasPlugin, openWithPlugins } from "./plugin-helpers";

// The phone's daily entry: Today carries the plugin's
// status rows - the confirmations and the library - so neither is behind
// More › Plugins. The plugin is the checkout's skein.collect copy.
test.use(PHONE);

const card = (
  id: string,
  title: string,
  type: string,
  status: string,
  extra = "",
) => `---
schema_version: 1
theory_version: 1
id: "${id}"
title: "${title}"
type: ${type}
status: ${status}
created_at: 2026-11-01T09:00:00+08:00
updated_at: 2026-11-20T09:00:00+08:00
revision: 1
created_by: user
source_ids: []
use_count: 0
${extra}---

body of ${title}
`;

test("today's plugin rows open the confirm center and the asset list", async ({
  page,
}) => {
  test.skip(!hasPlugin("skein.collect"), "needs skein.collect in the checkout");
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    // The phone's folder pick goes through the files plugin's picker.
    w.__devPickFolder = "/work";
    w.__devInvokeResults = {
      "plugin:textus-files|pick_folder": { url: "file:///work" },
      "plugin:textus-files|begin_access": { path: "/work" },
    };
    // One request waiting in the plugin's project store, so Today has
    // both rows to show.
    w.__devPluginStore = {
      "skein.collect|project|/work": {
        kv: {
          pending: [
            {
              id: "REQ-20261127-0930-ab12",
              kind: "transition",
              cardId: "A-1",
              path: "asset-library/assets/A-1.md",
              title: "交付前的旧清单",
              target: "archived",
              expectedRevision: 1,
              reason: "e2e",
              evidenceIds: [],
              createdAt: "2026-11-27T09:30:00+08:00",
              expiresAt: "2099-01-01T00:00:00+08:00",
              snoozedUntil: null,
              origin: "manual",
            },
          ],
        },
        files: {},
      },
    };
  });
  await openWithPlugins(page, {
    plugins: {
      "skein.collect": ["files.read", "files.write", "project.data"],
    },
    folder: {
      "/work/asset-library/inbox/N-20261118-ab12.md": card(
        "N-20261118-ab12",
        "买一台除湿机",
        "inbox",
        "inbox",
      ),
      "/work/asset-library/assets/A-1.md": card(
        "A-1",
        "交付前的旧清单",
        "asset",
        "active",
      ),
      "/work/asset-library/tasks/T-1.md": card(
        "T-1",
        "把同步页改版",
        "task",
        "active",
      ),
      "/work/asset-library/judgments/J-1.md": card(
        "J-1",
        "先调研再动手",
        "judgment",
        "confirmed",
        'source_ids: ["A-1"]\n',
      ),
    },
    language: "zh",
  });
  await page.waitForFunction(() =>
    (
      window as unknown as { __devListening: (n: string) => boolean }
    ).__devListening("menu-open-folder"),
  );
  await emit(page, "menu-open-folder");
  await settled(page);

  // Today: one group under the plugin's name, the two rows ready.
  await expect(page.getByText("Skein 收集")).toBeVisible();
  const pendingRow = page.getByRole("button", { name: /1 条待确认/ });
  const assetsRow = page.getByRole("button", { name: /资产 · 4 张卡/ });
  await expect(pendingRow).toBeVisible();
  await expect(assetsRow).toBeVisible();

  // The launcher still lists every page and command, each once.
  await page.getByRole("button", { name: "更多", exact: true }).tap();
  await page.getByRole("menuitem", { name: "插件", exact: true }).tap();
  const launcherRows = page.locator(".quick-pick-item");
  await expect(launcherRows.first()).toBeVisible();
  await expect(launcherRows.filter({ hasText: "确认中心" })).toHaveCount(1);
  await expect(launcherRows.filter({ hasText: "月度复盘" })).toHaveCount(1);
  await page.keyboard.press("Escape");
  await settled(page);

  // The library: one tap, no launcher.
  await assetsRow.tap();
  await settled(page);
  await expect(
    page.locator(".plugin-list-row").filter({ hasText: "交付前的旧清单" }),
  ).toBeVisible();

  // A row's actions are a button a finger can tap, not only a hold.
  await page.getByRole("button", { name: "交付前的旧清单 的更多操作" }).tap();
  await page.getByRole("menuitem", { name: "查看详情" }).tap();
  await settled(page);
  await expect(page.getByText("卡片详情")).toBeVisible();
  const detail = page.frameLocator("iframe").first();
  await expect(detail.locator("body")).toContainText("交付前的旧清单");

  // Back: the list it was opened from, not Today.
  await page.getByRole("button", { name: "回到文件库" }).tap();
  await settled(page);
  await expect(
    page.locator(".plugin-list-row").filter({ hasText: "交付前的旧清单" }),
  ).toBeVisible();

  // A plugin page's ⋯ carries its own life, not the document's.
  await page.getByRole("button", { name: "更多", exact: true }).tap();
  await expect(page.getByRole("menuitem", { name: "命令面板…" })).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: "插件", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "大纲" })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "查找与替换" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("menuitem", { name: "源码模式" })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "分享…" })).toHaveCount(0);
  await page.getByRole("button", { name: "取消" }).tap();
  await settled(page);

  // Back from the list, opened over Today: Today.
  await page.getByRole("button", { name: "回到文件库" }).tap();
  await settled(page);
  await expect(assetsRow).toBeVisible();

  // Asked for again: the page the tab already holds comes to the front.
  await assetsRow.tap();
  await settled(page);
  await expect(
    page.locator(".plugin-list-row").filter({ hasText: "交付前的旧清单" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "回到文件库" }).tap();
  await settled(page);

  // The confirmation: one tap, the center in front.
  await page.getByRole("button", { name: /1 条待确认/ }).tap();
  await settled(page);
  const confirm = page.frameLocator("iframe").first();
  await expect(confirm.locator("body")).toContainText("交付前的旧清单");
});

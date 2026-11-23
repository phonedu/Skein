import { expect, test } from "@playwright/test";
import { openApp } from "./helpers";

// An outside agent a plugin brings (contributes.agents) has its button at
// the window bar's end, beside Textus AI's: a press opens the AI with it.

const ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor"/></svg>';

const manifest = {
  id: "example.agent",
  name: "Example Agent",
  version: "0.1.0",
  publisher: "example",
  engines: { textus: ">=1.3.12" },
  icon: "icon.svg",
  main: "host.js",
  permissions: ["agents"],
  contributes: {
    agents: [
      {
        id: "example.agent.coder",
        name: "Coder",
        command: "coder-acp",
        args: [],
      },
    ],
  },
};

test("an outside agent's button opens the AI with that agent", async ({
  page,
}) => {
  await page.addInitScript(
    ({ manifest, icon }) => {
      if (window.top !== window) return;
      const w = window as unknown as Record<string, unknown>;
      w.__devPlugins = [
        {
          id: manifest.id,
          dir: `/plugins/${manifest.id}`,
          manifest: JSON.stringify(manifest),
          dev: false,
          files: { "icon.svg": icon, "host.js": "" },
        },
      ];
      w.__devPluginState = {
        allOn: true,
        plugins: {
          [manifest.id]: { enabled: true, granted: manifest.permissions },
        },
      };
    },
    { manifest, icon: ICON },
  );
  await page.setViewportSize({ width: 1200, height: 760 });
  await openApp(page, { settings: { menuBarShown: false }, document: true });
  const agent = page.getByRole("button", { name: "Coder" });
  await expect(agent).toBeVisible();
  // Before Textus AI's own button.
  const ai = page.getByRole("button", { name: "Textus AI" }).first();
  expect((await agent.boundingBox())!.x).toBeLessThan(
    (await ai.boundingBox())!.x,
  );
  await agent.click();
  // The fork's AI is the right panel, named for who answers.
  await expect(page.locator(".right-panel")).toBeVisible();
  await expect(page.locator(".right-panel")).toContainText("Coder");
  // Textus AI's own button is not lit while an outside agent answers.
  await expect(ai).toHaveAttribute("aria-pressed", "false");
  // The panel stays while its mode is switched: its own × closes it.
  await page
    .locator(".right-panel")
    .getByRole("button", { name: "关闭" })
    .click();
  await expect(page.locator(".right-panel")).toHaveCount(0);
  // Listed in Settings' External tools, Manage opening its plugin's page.
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("textus:open-settings-page", { detail: { page: "mcp" } }),
    ),
  );
  const row = page.locator(".settings-content-host .settings-row", {
    hasText: "Coder",
  });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "管理" }).click();
  // The plugin's page opens in the dialog, not in a tab of its own.
  await expect(page.locator(".settings-content-host")).toHaveAttribute(
    "data-settings-page",
    /^plugin:/,
  );
  await expect(page.locator(".tab-pill")).toHaveText(["未命名"]);
});

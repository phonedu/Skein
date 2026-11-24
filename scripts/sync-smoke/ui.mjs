// The real Settings › Sync page, driven by role and label. No pre-seeded
// sync.json: the harness must prove the page's own save path.
import { readLast } from "./instances.mjs";

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

export async function openSync(page) {
  await page.evaluate(() => {
    globalThis.dispatchEvent(
      new globalThis.CustomEvent("textus:open-settings-page", {
        detail: { page: "sync" },
      }),
    );
  });
  await page
    .locator(".settings-dialog")
    .waitFor({ state: "visible", timeout: 30000 });
  await page
    .getByRole("combobox", { name: "Service", exact: true })
    .waitFor({ timeout: 30000 });
}

async function choose(page, name, option) {
  await page.getByRole("combobox", { name, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

function field(page, label) {
  return page
    .locator("label.sync-field", {
      has: page.locator("span.settings-field-label", {
        hasText: new RegExp(`^${label}$`),
      }),
    })
    .locator("input")
    .first();
}

export async function configure(page, provider, prefix, label) {
  await openSync(page);
  await choose(page, "Service", "S3");
  await field(page, "Server address").fill(provider.endpoint);
  await field(page, "Bucket").fill(provider.bucket);
  await field(page, "Region").fill(provider.region);
  await field(page, "Remote folder").fill(prefix);
  const encrypt = page.getByLabel("Encrypt this repository");
  if (await encrypt.isChecked()) await encrypt.uncheck();
  await field(page, "Access key").fill(provider.accessKey);
  await page.locator('input[aria-label="Secret key"]').fill(provider.secretKey);
  await choose(
    page,
    "S3 compatibility",
    provider.flavor === "kodo" ? "Qiniu Kodo (native upload)" : "Standard S3",
  );
  const pathStyle = page.getByLabel("Path-style addresses");
  if (!(await pathStyle.isChecked())) await pathStyle.check();
  await page.getByRole("button", { name: "Save connection" }).click();
  try {
    await page
      .getByText("Connection saved.")
      .waitFor({ state: "visible", timeout: 60000 });
  } catch (error) {
    const text = await pageText(page);
    throw new Error(`${label}: save failed: ${text}`, { cause: error });
  }
}

export function connectionLabel(provider, connectionPrefix) {
  const base = connectionPrefix ? ` · ${connectionPrefix}` : "";
  return `S3 · ${provider.bucket}${base}`;
}

async function chooseExisting(page, label) {
  await page.getByRole("combobox", { name: "Connection", exact: true }).click();
  await page.getByRole("option", { name: label, exact: true }).click();
}

async function fillBinding(page, prefix) {
  await field(page, "Remote folder").fill(prefix);
  const encrypt = page.getByLabel("Encrypt this repository");
  if (await encrypt.isChecked()) await encrypt.uncheck();
}

/** Select an existing (shared) connection and save this folder's binding. */
export async function configureShared(page, provider, label, prefix, tag) {
  await openSync(page);
  await chooseExisting(page, connectionLabel(provider, label));
  await fillBinding(page, prefix);
  await page.getByRole("button", { name: "Save connection" }).click();
  try {
    await page
      .getByText("Connection saved.")
      .waitFor({ state: "visible", timeout: 60000 });
  } catch (error) {
    throw new Error(`${tag}: save failed: ${await pageText(page)}`, {
      cause: error,
    });
  }
}

/** Save a binding that must be refused (same remote repository). */
export async function saveExpectingError(
  page,
  provider,
  label,
  prefix,
  pattern,
  tag,
) {
  await openSync(page);
  await chooseExisting(page, connectionLabel(provider, label));
  await fillBinding(page, prefix);
  await page.getByRole("button", { name: "Save connection" }).click();
  try {
    await page.getByText(pattern).waitFor({ state: "visible", timeout: 30000 });
  } catch (error) {
    throw new Error(
      `${tag}: expected "${pattern}", got: ${await pageText(page)}`,
      { cause: error },
    );
  }
}

/** A copy of an existing vault: the page asks to fork, then saves again. */
export async function configureCopied(page, provider, label, prefix, tag) {
  await openSync(page);
  await chooseExisting(page, connectionLabel(provider, label));
  await fillBinding(page, prefix);
  await page.getByRole("button", { name: "Save connection" }).click();
  const fork = page.locator(".app-dialog button", {
    hasText: "Create separate vault",
  });
  try {
    await fork.waitFor({ state: "visible", timeout: 30000 });
  } catch (error) {
    throw new Error(`${tag}: no copied-vault prompt: ${await pageText(page)}`, {
      cause: error,
    });
  }
  await fork.click();
  try {
    await page
      .getByText("Connection saved.")
      .waitFor({ state: "visible", timeout: 60000 });
  } catch (error) {
    throw new Error(`${tag}: save failed after fork: ${await pageText(page)}`, {
      cause: error,
    });
  }
}

async function statusOf(page, root) {
  const raw = await page.evaluate(async (root) => {
    const value = await globalThis.__TAURI_INTERNALS__.invoke("sync_status", {
      root,
    });
    return value;
  }, root);
  return JSON.parse(raw);
}

/** The WebDAV half of the connection form. */
export async function configureWebdav(page, provider, prefix, label) {
  await openSync(page);
  await choose(page, "Service", "WebDAV");
  await field(page, "Server address").fill(provider.endpoint);
  await field(page, "Username").fill(provider.username);
  await page.locator('input[aria-label="Password"]').fill(provider.password);
  await field(page, "Remote folder").fill(prefix);
  const encrypt = page.getByLabel("Encrypt this repository");
  if (await encrypt.isChecked()) await encrypt.uncheck();
  await page.getByRole("button", { name: "Save connection" }).click();
  try {
    await page
      .getByText("Connection saved.")
      .waitFor({ state: "visible", timeout: 60000 });
  } catch (error) {
    throw new Error(`${label}: save failed: ${await pageText(page)}`, {
      cause: error,
    });
  }
}

export async function syncNow(page, runDir, name, label, root) {
  await openSync(page);
  const before = root ? await statusOf(page, root) : readLast(runDir, name);
  const button = page.getByRole("button", {
    name: "Sync now",
    exact: true,
  });
  await button.waitFor({ state: "visible", timeout: 30000 });
  for (let i = 0; i < 60 && (await button.isDisabled()); i += 1) {
    await sleep(500);
  }
  if (await button.isDisabled())
    throw new Error(`${label}: Sync now is disabled`);
  const clicked = Date.now();
  await button.click();
  const deadline = Date.now() + 240000;
  while (Date.now() < deadline) {
    const current = root
      ? (await statusOf(page, root)).last
      : readLast(runDir, name);
    if (
      current &&
      current.at !== before?.at &&
      Date.parse(current.at) >= clicked
    ) {
      if (current.error) {
        throw new Error(`${label}: sync failed: ${current.error}`);
      }
      return current.result;
    }
    await sleep(500);
  }
  throw new Error(`${label}: sync timed out: ${await pageText(page)}`);
}

/** Change a shared connection's default prefix (already-shared page). */
export async function editSharedPrefix(page, prefix, tag) {
  await openSync(page);
  await page.getByRole("button", { name: "Edit connection" }).click();
  await field(page, "Default prefix for new vaults").fill(prefix);
  await page.getByRole("button", { name: "Save connection" }).click();
  try {
    await page
      .getByText("Connection saved.")
      .waitFor({ state: "visible", timeout: 60000 });
  } catch (error) {
    throw new Error(`${tag}: shared edit failed: ${await pageText(page)}`, {
      cause: error,
    });
  }
}

/** Click Sync now, answer the empty-scan/bulk-delete confirm, then wait. */
export async function syncWithConfirm(page, root, accept, label) {
  await openSync(page);
  const before = await statusOf(page, root);
  const button = page.getByRole("button", {
    name: "Sync now",
    exact: true,
  });
  await button.waitFor({ state: "visible", timeout: 30000 });
  for (let i = 0; i < 60 && (await button.isDisabled()); i += 1) {
    await sleep(500);
  }
  const clicked = Date.now();
  await button.click();
  const dialog = page.locator(".app-dialog").first();
  await dialog.waitFor({ state: "visible", timeout: 30000 });
  const text = (await dialog.innerText()).replace(/\s+/g, " ").trim();
  if (!accept) {
    await dialog.locator("button.app-dialog-cancel").click();
    await dialog.waitFor({ state: "hidden", timeout: 30000 }).catch(() => {});
    return { cancelled: true, text };
  }
  const prompts = [text];
  await dialog.locator("button", { hasText: "Sync anyway" }).click();
  await sleep(500);
  const deadline = Date.now() + 240000;
  while (Date.now() < deadline) {
    if (await dialog.isVisible().catch(() => false)) {
      prompts.push((await dialog.innerText()).replace(/\s+/g, " ").trim());
      await dialog.locator("button", { hasText: "Sync anyway" }).click();
      await sleep(500);
      continue;
    }
    const current = await statusOf(page, root);
    if (
      current.last?.result &&
      current.last.at !== before?.last?.at &&
      Date.parse(current.last.at) >= clicked
    ) {
      return { cancelled: false, prompts, result: current.last.result };
    }
    await sleep(500);
  }
  throw new Error(`${label}: confirmed sync timed out`);
}

/** Remove a stale lock through the header's pending-lock row. */
export async function removeLock(page, tag) {
  await openSync(page);
  const button = page.locator(".sync-lock-row button");
  try {
    await button.waitFor({ state: "visible", timeout: 30000 });
  } catch (error) {
    throw new Error(`${tag}: no lock row: ${await pageText(page)}`, {
      cause: error,
    });
  }
  await button.click();
  const dialog = page.locator(".app-dialog").first();
  await dialog.waitFor({ state: "visible", timeout: 30000 });
  await dialog.locator("button", { hasText: "Remove lock" }).click();
  try {
    await page
      .getByText("Lock removed.")
      .waitFor({ state: "visible", timeout: 30000 });
  } catch (error) {
    throw new Error(`${tag}: unlock failed: ${await pageText(page)}`, {
      cause: error,
    });
  }
}

export async function pageText(page) {
  return (await page.locator(".sync-page").first().innerText())
    .replace(/\s+/g, " ")
    .slice(0, 800);
}

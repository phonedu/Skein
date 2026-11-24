// Two portable debug instances with separate TextusData folders, driven
// through WebView2 CDP. Debug builds have no single-instance lock, so both
// can run at once; portable keeps settings, bases and the webview profile
// beside each copy of the executable.
import { spawn, spawnSync } from "node:child_process";
import {
  closeSync,
  copyFileSync,
  existsSync,
  openSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(here, "../..");
export const scratchRoot = resolve(repoRoot, "../.scratch/sync-smoke");

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

export function newRunId() {
  return (
    new Date().toISOString().replace(/[:.]/g, "-") +
    "-" +
    Math.random().toString(16).slice(2, 6)
  );
}

export function prepareRun(runDir) {
  for (const inst of ["instA", "instB"]) {
    mkdirSync(join(runDir, inst, "TextusData", "config"), {
      recursive: true,
    });
    writeFileSync(
      join(runDir, inst, "TextusData", "config", "settings.dev.json"),
      JSON.stringify({
        schemaVersion: 1,
        settings: {
          language: "en",
          languageChosen: true,
          onboardingShown: true,
          menuBarShown: false,
        },
      }),
    );
  }
  for (const vault of ["vaultA", "vaultB"]) {
    mkdirSync(join(runDir, vault, "Notes"), { recursive: true });
  }
}

export async function freePort() {
  const server = createServer();
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const { port } = server.address();
  await new Promise((done) => server.close(done));
  return port;
}

export function buildPortable(runDir, { build }) {
  const exe = join(repoRoot, "src-tauri", "target", "debug", "textus.exe");
  if (!build && existsSync(exe)) return exe;
  if (!build) throw new Error(`missing ${exe}; run with --build`);
  const log = join(runDir, "build.log");
  const fd = openSync(log, "w");
  const result = spawnSync(
    "npm",
    ["run", "tauri", "build", "--", "--debug", "--no-bundle"],
    {
      cwd: repoRoot,
      env: { ...process.env, TEXTUS_DISTRIBUTION: "portable" },
      shell: process.platform === "win32",
      stdio: ["ignore", fd, fd],
    },
  );
  closeSync(fd);
  if (result.status !== 0) {
    throw new Error(`build failed (${result.status}); see ${log}`);
  }
  if (!existsSync(exe)) throw new Error(`build produced no ${exe}`);
  return exe;
}

export function copyInto(runDir, exe) {
  for (const inst of ["instA", "instB"]) {
    copyFileSync(exe, join(runDir, inst, "textus.exe"));
  }
}

async function waitForCdp(port) {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (response.ok) return;
    } catch {
      // Not listening yet.
    }
    await sleep(500);
  }
  throw new Error(`WebView2 CDP did not come up on ${port}`);
}

export async function startInstance({ runDir, name, vault, port }) {
  const exe = join(runDir, name, "textus.exe");
  const child = spawn(exe, [join(runDir, vault)], {
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
    },
    stdio: "ignore",
  });
  if (!child.pid) throw new Error(`${name}: process did not start`);
  try {
    await waitForCdp(port);
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    const page = await findPage(browser);
    return { name, pid: child.pid, port, browser, page };
  } catch (error) {
    child.kill();
    throw error;
  }
}

async function findPage(browser) {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    for (const context of browser.contexts()) {
      for (const page of context.pages()) {
        try {
          if (await page.locator("button.sidebar-foot-settings").count()) {
            return page;
          }
        } catch {
          // Still navigating.
        }
      }
    }
    await sleep(500);
  }
  throw new Error("no Textus page with a sidebar");
}

export async function stopInstance(instance) {
  await instance.browser?.close().catch(() => {});
  try {
    process.kill(instance.pid);
  } catch {
    // Already gone.
  }
  await sleep(500);
}

export function readSyncStore(runDir) {
  return JSON.parse(
    readFileSync(
      join(runDir, "instA", "TextusData", "config", "sync.json"),
      "utf8",
    ),
  );
}

export async function openFolderWindow(instance, folderPath, label) {
  const context = instance.browser.contexts()[0];
  const before = new Set(context.pages());
  await instance.page.evaluate(
    (path) =>
      globalThis.__TAURI_INTERNALS__.invoke("open_folder_in_new_window", {
        path,
      }),
    folderPath,
  );
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    for (const page of context.pages()) {
      if (before.has(page)) continue;
      try {
        await page
          .locator("button.sidebar-foot-settings")
          .waitFor({ timeout: 1000 });
        return page;
      } catch {
        // The window is still loading.
      }
    }
    await sleep(500);
  }
  throw new Error(`${label}: the folder window did not open`);
}

export function readLast(runDir, name) {
  const dir = join(runDir, name, "TextusData", "data", "sync");
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .filter((file) => file.startsWith("last-") && file.endsWith(".json"))
    .map((file) => ({
      file: join(dir, file),
      at: statSync(join(dir, file)).mtimeMs,
    }))
    .sort((left, right) => right.at - left.at);
  if (files.length === 0) return null;
  return JSON.parse(readFileSync(files[0].file, "utf8"));
}

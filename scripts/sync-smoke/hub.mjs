// Desktop LAN Hub smoke: start a Hub in instance A through Settings, bind
// vault A, pair instance B through the same command the phone uses, then
// sync both ways. Tokens stay inside the page and are never printed.
import { join } from "node:path";
import {
  buildPortable,
  copyInto,
  freePort,
  newRunId,
  openFolderWindow,
  prepareRun,
  scratchRoot,
  startInstance,
  stopInstance,
} from "./instances.mjs";
import { openSync, syncNow } from "./ui.mjs";
import { content, write } from "./fixtures.mjs";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";

const keep = process.argv.includes("--keep");
const build = process.argv.includes("--build");
const runId = newRunId();
const runDir = join(scratchRoot, "hub-" + runId);
const log = [];
const say = (line) => {
  log.push(line);
  console.log(line);
};

function expect(actual, expected, label) {
  for (const [key, value] of Object.entries(expected)) {
    const seen = key === "conflicts" ? actual.conflicts.length : actual[key];
    if (seen !== value) {
      throw new Error(`${label}: ${key}=${seen}, expected ${value}`);
    }
  }
}

let a;
let b;
try {
  prepareRun(runDir);
  const exe = buildPortable(runDir, { build });
  copyInto(runDir, exe);
  write(runDir, "vaultA/Notes/from-a.md", "hello from A\n");
  write(runDir, "vaultB/Notes/from-b.md", "hello from B\n");

  a = await startInstance({
    runDir,
    name: "instA",
    vault: "vaultA",
    port: await freePort(),
  });
  b = await startInstance({
    runDir,
    name: "instB",
    vault: "vaultB",
    port: await freePort(),
  });
  const pageA = await openFolderWindow(a, join(runDir, "vaultA"), "A");
  const pageB = await openFolderWindow(b, join(runDir, "vaultB"), "B");

  await openSync(pageA);
  const hubPort = await freePort();
  const portInput = pageA
    .locator("label.sync-field", {
      has: pageA.locator("span.settings-field-label", { hasText: /^Port$/ }),
    })
    .locator("input")
    .first();
  await portInput.fill(String(hubPort));
  await pageA.getByRole("button", { name: "Start Hub", exact: true }).click();
  await pageA
    .getByRole("button", { name: "Use this Hub for this vault", exact: true })
    .waitFor({ state: "visible", timeout: 60000 });
  const raw = await pageA.evaluate(() =>
    globalThis.__TAURI_INTERNALS__.invoke("hub_status"),
  );
  const status = JSON.parse(raw).status;
  say(`hub started at ${status.address} (repo ${status.repoId.slice(0, 8)}…)`);
  if (!status.pairing?.code) throw new Error("no pairing code");

  await pageA
    .getByRole("button", { name: "Use this Hub for this vault", exact: true })
    .click();
  await pageA
    .getByText("This vault now syncs through the Hub.")
    .waitFor({ timeout: 60000 });
  say("vault A bound to the Hub");

  const paired = await pageB.evaluate(
    async ({ address, code, root }) => {
      const reply = JSON.parse(
        await globalThis.__TAURI_INTERNALS__.invoke("hub_pair", {
          address,
          code,
          device: "smoke phone",
        }),
      );
      await globalThis.__TAURI_INTERNALS__.invoke("sync_settings_save", {
        root,
        config: JSON.stringify({
          connectionId: "new",
          provider: "webdav",
          endpoint: `${address}/hub/${reply.repoId}`,
          bucket: "",
          prefix: "",
          region: "",
          pathStyle: false,
          s3Flavor: "standard",
          keepDays: 90,
          encrypted: false,
        }),
        credentials: JSON.stringify({
          username: reply.username,
          password: reply.token,
          accessKey: "",
          secretKey: "",
          syncPassword: "",
        }),
      });
      return { repoId: reply.repoId, readOnly: reply.readOnly };
    },
    { address: status.address, code: status.pairing.code, root: join(runDir, "vaultB") },
  );
  if (paired.readOnly) throw new Error("unexpected read-only device");
  say("instance B paired as a device");

  const firstA = await syncNow(pageA, runDir, "instA", "A", join(runDir, "vaultA"));
  expect(firstA, { uploaded: 1, downloaded: 0, removed: 0 }, "A first");
  const firstB = await syncNow(pageB, runDir, "instB", "B", join(runDir, "vaultB"));
  expect(firstB, { uploaded: 1, downloaded: 1, removed: 0 }, "B first");
  if (content(runDir, "vaultB/Notes/from-a.md") !== "hello from A\n") {
    throw new Error("B did not receive from-a");
  }
  say("first sync: A uploaded, B downloaded and uploaded its own file");

  const secondA = await syncNow(pageA, runDir, "instA", "A", join(runDir, "vaultA"));
  expect(secondA, { uploaded: 0, downloaded: 1 }, "A second");
  if (content(runDir, "vaultA/Notes/from-b.md") !== "hello from B\n") {
    throw new Error("A did not receive from-b");
  }
  say("A received from-b");

  write(runDir, "vaultB/Notes/from-b.md", "edited on B\n");
  const editB = await syncNow(pageB, runDir, "instB", "B", join(runDir, "vaultB"));
  expect(editB, { uploaded: 1, downloaded: 0 }, "B edit");
  const editA = await syncNow(pageA, runDir, "instA", "A", join(runDir, "vaultA"));
  expect(editA, { uploaded: 0, downloaded: 1 }, "A edit");
  if (content(runDir, "vaultA/Notes/from-b.md") !== "edited on B\n") {
    throw new Error("A did not receive the edit");
  }
  say("edit on B reached A");

  await pageA.getByRole("button", { name: "Stop Hub", exact: true }).click();
  await pageA.getByRole("button", { name: "Start Hub", exact: true }).waitFor({
    state: "visible",
    timeout: 30000,
  });
  const stopped = JSON.parse(
    await pageA.evaluate(() =>
      globalThis.__TAURI_INTERNALS__.invoke("hub_status"),
    ),
  );
  if (stopped.running) throw new Error("Hub still running after Stop");
  say("Hub stopped");

  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, "hub-smoke.json"), JSON.stringify({ ok: true, log }, null, 2));
  console.log("PASS");
} catch (error) {
  console.error(`FAIL: ${error}`);
  console.error(log.join("\n"));
  process.exitCode = 1;
} finally {
  if (a) await stopInstance(a);
  if (b) await stopInstance(b);
  if (!keep) {
    try {
      rmSync(runDir, { recursive: true, force: true });
    } catch {
      // A running process may still hold a file; the next task cleans up.
    }
  }
}

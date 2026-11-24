// One command for the desktop sync smoke: two portable instances, the real
// Settings › Sync page, a scenario, a report, and cleanup.
//
//   node scripts/sync-smoke/run.mjs --provider kodo --scenario text --keep
//   node scripts/sync-smoke/run.mjs --provider kodo --scenario media --keep
//
// Credentials come from the ignored .tmp-s1-s3 config or --config; they are
// filled into the page and never printed or written to the report.
import {
  cpSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  assertTreeEqual,
  conflictPath,
  content,
  exists,
  remove,
  tree,
  write,
} from "./fixtures.mjs";
import {
  buildPortable,
  copyInto,
  freePort,
  newRunId,
  openFolderWindow,
  prepareRun,
  readSyncStore,
  repoRoot,
  scratchRoot,
  startInstance,
  stopInstance,
} from "./instances.mjs";
import { mediaFiles } from "./media.mjs";
import { startWebdav } from "./webdav-server.mjs";
import {
  deletePrefix,
  getHead,
  getObject,
  listKeys,
  providerFrom,
  providerFromWebdav,
  putObject,
} from "./remote.mjs";
import {
  configure,
  configureCopied,
  configureShared,
  configureWebdav,
  editSharedPrefix,
  openSync,
  removeLock,
  saveExpectingError,
  syncWithConfirm,
  syncNow,
} from "./ui.mjs";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};
const flag = (name) => args.includes(`--${name}`);

const providerName = option("provider", "kodo");
const scenario = option("scenario", "text");
const keep = flag("keep");
const build = !flag("no-build");
const runId = newRunId();
const runDir = join(scratchRoot, runId);
const prefix =
  option("prefix") ??
  `sync-smoke-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 6)}`;

function loadProvider() {
  if (providerName === "webdav") {
    const file = option("config");
    if (file) {
      const provider = providerFromWebdav(
        JSON.parse(readFileSync(file, "utf8")),
        file,
      );
      provider.name = "webdav";
      return provider;
    }
    return {
      name: "webdav",
      transport: "dav",
      endpoint: "",
      username: "sync-smoke",
      password: "sync-smoke-dav-pass",
    };
  }
  const file =
    option("config") ??
    join(
      repoRoot,
      ".tmp-s1-s3",
      providerName === "kodo"
        ? "qiniu.local.json"
        : "bitiful-textus.local.json",
    );
  const provider = providerFrom(JSON.parse(readFileSync(file, "utf8")), file);
  provider.name = providerName;
  provider.flavor = option(
    "flavor",
    providerName === "kodo" ? "kodo" : "standard",
  );
  provider.name = providerName;
  return provider;
}

function expect(result, expected, label) {
  for (const [key, value] of Object.entries(expected)) {
    const actual = key === "conflicts" ? result.conflicts.length : result[key];
    if (actual !== value) {
      throw new Error(
        `${label}: ${key}=${actual}, expected ${value} (${JSON.stringify({
          uploaded: result.uploaded,
          downloaded: result.downloaded,
          removed: result.removed,
          conflicts: result.conflicts,
        })})`,
      );
    }
  }
  if (result.conflicts.length > 0 && expected.conflicts === undefined) {
    throw new Error(`${label}: unexpected conflicts: ${result.conflicts}`);
  }
}

const steps = [];
async function step(name, work) {
  const started = Date.now();
  try {
    const detail = await work();
    steps.push({ name, ok: true, ms: Date.now() - started, detail });
    return detail;
  } catch (error) {
    steps.push({
      name,
      ok: false,
      ms: Date.now() - started,
      error: String(error),
    });
    throw error;
  }
}

function configurePage(page, provider, target, label) {
  return provider.transport === "dav"
    ? configureWebdav(page, provider, target, label)
    : configure(page, provider, target, label);
}

async function configureBoth(a, b, provider) {
  await step("configure A through Settings › Sync", () =>
    configurePage(a.page, provider, prefix, "A"),
  );
  await step("configure B through Settings › Sync", () =>
    configurePage(b.page, provider, prefix, "B"),
  );
}

async function runText(a, b, provider) {
  write(runDir, "vaultA/Notes/from-a.md", "hello from A\n");
  write(runDir, "vaultB/Notes/from-b.md", "hello from B\n");
  await configureBoth(a, b, provider);

  await step("A first sync uploads from-a", async () => {
    const result = await syncNow(a.page, runDir, "instA", "A");
    expect(result, { uploaded: 1, downloaded: 0, removed: 0 }, "A first");
    return result;
  });

  await step("B first sync downloads from-a, uploads from-b", async () => {
    const result = await syncNow(b.page, runDir, "instB", "B");
    expect(result, { uploaded: 1, downloaded: 1, removed: 0 }, "B first");
    if (content(runDir, "vaultB/Notes/from-a.md") !== "hello from A\n") {
      throw new Error("B did not receive from-a");
    }
    return result;
  });

  await step("A gets from-b", async () => {
    const result = await syncNow(a.page, runDir, "instA", "A");
    expect(result, { uploaded: 0, downloaded: 1 }, "A second");
    if (content(runDir, "vaultA/Notes/from-b.md") !== "hello from B\n") {
      throw new Error("A did not receive from-b");
    }
    return result;
  });

  await step("edit on A reaches B", async () => {
    write(runDir, "vaultA/Notes/from-a.md", "A edit one\n");
    expect(
      await syncNow(a.page, runDir, "instA", "A"),
      { uploaded: 1, downloaded: 0 },
      "A edit",
    );
    expect(
      await syncNow(b.page, runDir, "instB", "B"),
      { uploaded: 0, downloaded: 1 },
      "B receives edit",
    );
    if (content(runDir, "vaultB/Notes/from-a.md") !== "A edit one\n") {
      throw new Error("B did not receive A's edit");
    }
  });

  await step("edit on B reaches A", async () => {
    write(runDir, "vaultB/Notes/from-b.md", "B edit one\n");
    expect(
      await syncNow(b.page, runDir, "instB", "B"),
      { uploaded: 1, downloaded: 0 },
      "B edit",
    );
    expect(
      await syncNow(a.page, runDir, "instA", "A"),
      { uploaded: 0, downloaded: 1 },
      "A receives edit",
    );
    if (content(runDir, "vaultA/Notes/from-b.md") !== "B edit one\n") {
      throw new Error("A did not receive B's edit");
    }
  });

  let conflict;
  await step("simultaneous edit keeps both copies", async () => {
    write(runDir, "vaultA/Notes/from-a.md", "conflict side A\n");
    write(runDir, "vaultB/Notes/from-a.md", "conflict side B\n");
    expect(
      await syncNow(a.page, runDir, "instA", "A"),
      { uploaded: 1, downloaded: 0 },
      "A conflict upload",
    );
    const result = await syncNow(b.page, runDir, "instB", "B");
    expect(result, { uploaded: 1, downloaded: 0, conflicts: 1 }, "B conflict");
    const treeB = tree(join(runDir, "vaultB"));
    conflict = conflictPath(treeB);
    if (!conflict) throw new Error("B has no conflict copy");
    if (content(runDir, `vaultB/${conflict}`) !== "conflict side A\n") {
      throw new Error("B's conflict copy is not A's bytes");
    }
    expect(
      await syncNow(a.page, runDir, "instA", "A"),
      { uploaded: 0, downloaded: 2 },
      "A receives conflict copy",
    );
    const treeA = tree(join(runDir, "vaultA"));
    if (conflictPath(treeA) !== conflict) {
      throw new Error(`conflict paths differ: ${conflictPath(treeA)}`);
    }
    if (content(runDir, `vaultA/${conflict}`) !== "conflict side A\n") {
      throw new Error("A's conflict copy is not A's bytes");
    }
  });

  await step("delete on B reaches A", async () => {
    remove(runDir, "vaultB/Notes/from-b.md");
    expect(
      await syncNow(b.page, runDir, "instB", "B"),
      { uploaded: 0, downloaded: 0, removed: 1 },
      "B delete",
    );
    expect(
      await syncNow(a.page, runDir, "instA", "A"),
      { uploaded: 0, downloaded: 0, removed: 1 },
      "A delete",
    );
    if (exists(runDir, "vaultA/Notes/from-b.md")) {
      throw new Error("A still has from-b");
    }
  });

  return ["Notes/from-a.md", conflict];
}

async function runMedia(a, b, provider) {
  const files = mediaFiles();
  for (const file of files) write(runDir, `vaultA/${file.path}`, file.bytes);
  const initial = files.map((file) => file.path);
  await configureBoth(a, b, provider);

  await step("A first sync uploads every media file", async () => {
    const result = await syncNow(a.page, runDir, "instA", "A");
    expect(
      result,
      { uploaded: initial.length, downloaded: 0, removed: 0 },
      "A media first",
    );
    return {
      files: initial.length,
      sizes: Object.fromEntries(
        files.map((file) => [file.path, file.bytes.length]),
      ),
    };
  });

  await step("B first sync downloads them byte for byte", async () => {
    const result = await syncNow(b.page, runDir, "instB", "B");
    expect(
      result,
      { uploaded: 0, downloaded: initial.length, removed: 0 },
      "B media first",
    );
    const treeA = tree(join(runDir, "vaultA"));
    const treeB = tree(join(runDir, "vaultB"));
    assertTreeEqual(treeA, treeB, "media after first sync");
    return { files: initial.length };
  });

  await step("2 MiB boundaries split into the expected blocks", async () => {
    const head = await getHead(provider, prefix);
    const checks = [
      ["Notes/media/boundary-2mib-minus1.mp4", 1],
      ["Notes/media/boundary-2mib.mp4", 1],
      ["Notes/media/boundary-2mib-plus1.mp4", 2],
      ["Notes/media/clip.mp4", 4],
    ];
    for (const [path, blocks] of checks) {
      const entry = head?.files?.[path];
      if (!entry) throw new Error(`remote head lacks ${path}`);
      if (entry.blocks.length !== blocks) {
        throw new Error(
          `${path}: ${entry.blocks.length} blocks, expected ${blocks}`,
        );
      }
    }
    return { checks };
  });

  await step("a binary edit on B reaches A", async () => {
    const clip = "Notes/media/clip.mp4";
    const bytes = readFileSync(join(runDir, `vaultB/${clip}`));
    write(runDir, `vaultB/${clip}`, Buffer.concat([bytes, Buffer.from("b")]));
    expect(
      await syncNow(b.page, runDir, "instB", "B"),
      { uploaded: 1, downloaded: 0 },
      "B media edit",
    );
    expect(
      await syncNow(a.page, runDir, "instA", "A"),
      { uploaded: 0, downloaded: 1 },
      "A receives media edit",
    );
    const treeA = tree(join(runDir, "vaultA"));
    const treeB = tree(join(runDir, "vaultB"));
    assertTreeEqual(treeA, treeB, "media after edit");
  });

  await step("a media delete on A reaches B", async () => {
    const deleted = "Notes/media/photo.jpg";
    remove(runDir, `vaultA/${deleted}`);
    expect(
      await syncNow(a.page, runDir, "instA", "A"),
      { uploaded: 0, downloaded: 0, removed: 1 },
      "A media delete",
    );
    expect(
      await syncNow(b.page, runDir, "instB", "B"),
      { uploaded: 0, downloaded: 0, removed: 1 },
      "B media delete",
    );
    if (exists(runDir, `vaultB/${deleted}`)) {
      throw new Error("B still has the deleted photo");
    }
  });

  let conflict;
  await step("both edit the same PNG: both copies survive", async () => {
    const pixel = "Notes/media/pixel.png";
    write(runDir, `vaultA/${pixel}`, Buffer.from("A pixel side"));
    write(runDir, `vaultB/${pixel}`, Buffer.from("B pixel side"));
    expect(
      await syncNow(a.page, runDir, "instA", "A"),
      { uploaded: 1, downloaded: 0 },
      "A pixel conflict upload",
    );
    expect(
      await syncNow(b.page, runDir, "instB", "B"),
      { uploaded: 1, downloaded: 0, conflicts: 1 },
      "B pixel conflict",
    );
    const treeB = tree(join(runDir, "vaultB"));
    conflict = conflictPath(treeB);
    if (!conflict) throw new Error("B has no PNG conflict copy");
    if (
      !readFileSync(join(runDir, `vaultB/${conflict}`)).equals(
        Buffer.from("A pixel side"),
      )
    ) {
      throw new Error("B's PNG conflict copy is not A's bytes");
    }
    expect(
      await syncNow(a.page, runDir, "instA", "A"),
      { uploaded: 0, downloaded: 2 },
      "A receives PNG conflict copy",
    );
    if (conflictPath(tree(join(runDir, "vaultA"))) !== conflict) {
      throw new Error("PNG conflict path differs between A and B");
    }
  });

  return [
    ...initial.filter((path) => path !== "Notes/media/photo.jpg"),
    conflict,
  ];
}

function vaultByRoot(store, name) {
  return Object.values(store.vaults).find((vault) =>
    vault.root.toLowerCase().includes(name),
  );
}

async function runMulti(a, provider) {
  const aPrefix = `${prefix}/a`;
  const basePrefix = `${prefix}/base`;
  for (const vault of ["vaultC", "vaultD", "vaultE"]) {
    mkdirSync(join(runDir, vault, "Notes"), { recursive: true });
  }
  write(runDir, "vaultA/Notes/from-a.md", "from A\n");
  write(runDir, "vaultC/Notes/from-c.md", "from C\n");

  await step("configure A through Settings › Sync", () =>
    configure(a.page, provider, aPrefix, "A"),
  );
  let store = readSyncStore(runDir);
  let connection = Object.values(store.connections)[0];
  let aBinding = vaultByRoot(store, "vaulta");
  if (!connection || !aBinding) throw new Error("A has no saved binding");

  let pageC;
  await step("open vaultC in a second window", async () => {
    pageC = await openFolderWindow(a, join(runDir, "vaultC"), "C");
    return { window: "vaultC" };
  });
  await step("configure C on A's connection", () =>
    configureShared(pageC, provider, connection.prefix, "", "C"),
  );
  store = readSyncStore(runDir);
  const cBinding = vaultByRoot(store, "vaultc");
  if (!cBinding) throw new Error("C has no saved binding");
  if (cBinding.connectionId !== aBinding.connectionId) {
    throw new Error("C did not bind to A's connection");
  }
  if (!cBinding.prefix.startsWith(`${aPrefix}/`)) {
    throw new Error(`C prefix ${cBinding.prefix} is not under ${aPrefix}`);
  }
  const cPrefix = cBinding.prefix;

  await step("the vault list shows both libraries", async () => {
    await a.page.reload();
    await a.page
      .locator("button.sidebar-foot-settings")
      .waitFor({ timeout: 30000 });
    await openSync(a.page);
    const list = await a.page
      .locator('section[aria-label="Synced vaults"]')
      .innerText();
    if (!list.includes("vaultA") || !list.includes("vaultC")) {
      throw new Error(`vault list: ${list.replace(/\s+/g, " ")}`);
    }
    return { vaults: ["vaultA", "vaultC"] };
  });

  await step("two vaults sync at once", async () => {
    const [ra, rc] = await Promise.all([
      syncNow(a.page, runDir, "instA", "A", aBinding.root),
      syncNow(pageC, runDir, "instA", "C", cBinding.root),
    ]);
    expect(ra, { uploaded: 1, downloaded: 0 }, "A concurrent");
    expect(rc, { uploaded: 1, downloaded: 0 }, "C concurrent");
    return { a: ra, c: rc };
  });

  await step("each vault has its own remote repository", async () => {
    const headA = await getHead(provider, aPrefix);
    const headC = await getHead(provider, cPrefix);
    if (!headA?.files?.["Notes/from-a.md"]) {
      throw new Error("A's repository lacks from-a");
    }
    if (!headC?.files?.["Notes/from-c.md"]) {
      throw new Error("C's repository lacks from-c");
    }
    if (headA.files["Notes/from-c.md"] || headC.files["Notes/from-a.md"]) {
      throw new Error("the two repositories share a file");
    }
    if (
      exists(runDir, "vaultA/Notes/from-c.md") ||
      exists(runDir, "vaultC/Notes/from-a.md")
    ) {
      throw new Error("the two vaults downloaded each other's files");
    }
    return { a: aPrefix, c: cPrefix };
  });

  await step("shared connection edit keeps binding prefixes", async () => {
    await editSharedPrefix(a.page, basePrefix, "A");
    store = readSyncStore(runDir);
    connection = Object.values(store.connections)[0];
    aBinding = vaultByRoot(store, "vaulta");
    const afterC = vaultByRoot(store, "vaultc");
    if (connection.prefix !== basePrefix) {
      throw new Error(
        `connection prefix ${connection.prefix} != ${basePrefix}`,
      );
    }
    if (aBinding.prefix !== aPrefix || afterC.prefix !== cPrefix) {
      throw new Error("a binding prefix moved with the connection default");
    }
    return {
      connection: connection.prefix,
      a: aBinding.prefix,
      c: afterC.prefix,
    };
  });

  let pageD;
  await step("open vaultD in a third window", async () => {
    pageD = await openFolderWindow(a, join(runDir, "vaultD"), "D");
    return { window: "vaultD" };
  });
  await step("same remote repository is refused", () =>
    saveExpectingError(
      pageD,
      provider,
      basePrefix,
      aPrefix,
      /Another vault already uses this remote repository/,
      "D",
    ),
  );
  await step("the refused vault did not bind", () => {
    store = readSyncStore(runDir);
    if (Object.keys(store.vaults).length !== 2) {
      throw new Error(
        `${Object.keys(store.vaults).length} vaults after refusal`,
      );
    }
    if (vaultByRoot(store, "vaultd")) throw new Error("D was bound anyway");
  });

  cpSync(join(runDir, "vaultA"), join(runDir, "vaultE"), { recursive: true });
  let pageE;
  await step("open a copied vault in a fourth window", async () => {
    pageE = await openFolderWindow(a, join(runDir, "vaultE"), "E");
    return { window: "vaultE" };
  });
  await step("a copied vault forks and saves", () =>
    configureCopied(pageE, provider, basePrefix, "", "E"),
  );
  store = readSyncStore(runDir);
  const eBinding = vaultByRoot(store, "vaulte");
  if (!eBinding) throw new Error("the copied vault did not bind");
  if (eBinding.vaultId === aBinding.vaultId) {
    throw new Error("the copied vault kept A's identity");
  }
  if (!eBinding.prefix.startsWith(`${basePrefix}/`)) {
    throw new Error(`E prefix ${eBinding.prefix} is not under ${basePrefix}`);
  }
  await step("the forked copy syncs its own repository", async () => {
    const result = await syncNow(pageE, runDir, "instA", "E", eBinding.root);
    expect(result, { uploaded: 1, downloaded: 0 }, "E fork");
    const head = await getHead(provider, eBinding.prefix);
    if (!head?.files?.["Notes/from-a.md"]) {
      throw new Error("E's repository lacks the copied file");
    }
    return { prefix: eBinding.prefix };
  });

  await step("cleanup remote test prefix", async () => {
    const deleted = await deletePrefix(provider, `${prefix}/`);
    const remaining = await listKeys(provider, `${prefix}/`);
    if (remaining.length > 0) {
      throw new Error(`${remaining.length} objects remain under ${prefix}/`);
    }
    return { deleted: deleted.length };
  });
}

async function runLarge(a, b, provider) {
  const paths = [["Notes/large-32.mp4", 32 * 1024 * 1024]];
  if (flag("large")) paths.push(["Notes/large-128.mp4", 128 * 1024 * 1024]);
  for (const [path, size] of paths) {
    write(runDir, `vaultA/${path}`, Buffer.alloc(size, 0x5a));
  }
  await configureBoth(a, b, provider);

  await step("A uploads the large file(s)", async () => {
    const result = await syncNow(a.page, runDir, "instA", "A");
    expect(
      result,
      { uploaded: paths.length, downloaded: 0, removed: 0 },
      "A large",
    );
    return { files: paths.length, sizes: paths.map(([, size]) => size) };
  });

  await step("B downloads the large file(s) byte for byte", async () => {
    const result = await syncNow(b.page, runDir, "instB", "B");
    expect(
      result,
      { uploaded: 0, downloaded: paths.length, removed: 0 },
      "B large",
    );
    assertTreeEqual(
      tree(join(runDir, "vaultA")),
      tree(join(runDir, "vaultB")),
      "large trees",
    );
    return { files: paths.length };
  });

  await step("the large files split into 2 MiB blocks", async () => {
    const head = await getHead(provider, prefix);
    for (const [path, size] of paths) {
      const entry = head?.files?.[path];
      if (!entry) throw new Error(`remote head lacks ${path}`);
      const expected = size / (2 * 1024 * 1024);
      if (entry.blocks.length !== expected) {
        throw new Error(
          `${path}: ${entry.blocks.length} blocks, expected ${expected}`,
        );
      }
    }
    return {
      blocks: Object.fromEntries(
        paths.map(([path, size]) => [path, size / (2 * 1024 * 1024)]),
      ),
    };
  });

  return paths.map(([path]) => path);
}

async function runGuard(a, provider) {
  const basePrefix = `${prefix}/a`;
  const bulk = Array.from({ length: 60 }, (_, index) => {
    const path = `Notes/bulk/file-${String(index).padStart(2, "0")}.md`;
    return { path, bytes: Buffer.from(`bulk ${index}\n`) };
  });
  for (const file of bulk) write(runDir, `vaultA/${file.path}`, file.bytes);

  await step("configure the guard vault", () =>
    configurePage(a.page, provider, basePrefix, "A"),
  );
  const store = readSyncStore(runDir);
  const binding = Object.values(store.vaults)[0];
  if (!binding) throw new Error("guard vault did not bind");

  await step("the guard vault syncs 60 files", async () => {
    const result = await syncNow(a.page, runDir, "instA", "A", binding.root);
    expect(result, { uploaded: 60, downloaded: 0, removed: 0 }, "guard first");
  });

  await step("a bulk delete is stopped and can be cancelled", async () => {
    for (const file of bulk.slice(0, 31)) {
      remove(runDir, `vaultA/${file.path}`);
    }
    const answer = await syncWithConfirm(
      a.page,
      binding.root,
      false,
      "bulk cancel",
    );
    if (!/delete many files/.test(answer.text)) {
      throw new Error(`bulk prompt: ${answer.text}`);
    }
    const head = await getHead(provider, basePrefix);
    if (Object.keys(head.files).length !== 60) {
      throw new Error("the cancelled bulk delete changed the remote");
    }
    return { prompt: answer.text };
  });

  await step("the bulk delete proceeds when confirmed", async () => {
    const answer = await syncWithConfirm(
      a.page,
      binding.root,
      true,
      "bulk accept",
    );
    expect(answer.result, { removed: 31 }, "bulk accept");
    const head = await getHead(provider, basePrefix);
    if (Object.keys(head.files).length !== 29) {
      throw new Error(`remote has ${Object.keys(head.files).length} files`);
    }
    return { removed: answer.result.removed };
  });

  await step("an empty folder is stopped and can be cancelled", async () => {
    for (const file of bulk.slice(31)) {
      remove(runDir, `vaultA/${file.path}`);
    }
    const answer = await syncWithConfirm(
      a.page,
      binding.root,
      false,
      "empty cancel",
    );
    if (!/folder looks empty/.test(answer.text)) {
      throw new Error(`empty prompt: ${answer.text}`);
    }
    const head = await getHead(provider, basePrefix);
    if (Object.keys(head.files).length !== 29) {
      throw new Error("the cancelled empty-scan changed the remote");
    }
    return { prompt: answer.text };
  });

  await step("the empty folder proceeds when confirmed", async () => {
    const answer = await syncWithConfirm(
      a.page,
      binding.root,
      true,
      "empty accept",
    );
    expect(answer.result, { removed: 29 }, "empty accept");
    const head = await getHead(provider, basePrefix);
    if (!head || Object.keys(head.files).length !== 0) {
      throw new Error("the remote is not empty");
    }
    if (Object.keys(tree(join(runDir, "vaultA"))).length !== 0) {
      throw new Error("the local vault is not empty");
    }
    return { removed: answer.result.removed };
  });

  await step("a stale lock stops a sync and can be removed", async () => {
    const path = "Notes/lock-test.md";
    write(runDir, `vaultA/${path}`, "lock one\n");
    await syncNow(a.page, runDir, "instA", "A", binding.root);
    const before = await getHead(provider, basePrefix);
    await putObject(
      provider,
      `${basePrefix}/v1/lock.json`,
      Buffer.from(
        JSON.stringify({
          id: "sync-smoke-lock",
          startedAt: new Date().toISOString(),
        }),
      ),
    );
    write(runDir, `vaultA/${path}`, "lock two\n");
    let locked = false;
    try {
      await syncNow(a.page, runDir, "instA", "A", binding.root);
    } catch (error) {
      if (!String(error).includes("locked")) throw error;
      locked = true;
    }
    if (!locked) throw new Error("the injected lock did not stop the sync");
    const unchanged = await getHead(provider, basePrefix);
    if (unchanged.revision !== before.revision) {
      throw new Error("a locked run changed the remote");
    }
    await removeLock(a.page, "guard");
    if (await getObject(provider, `${basePrefix}/v1/lock.json`)) {
      throw new Error("the lock remains after removal");
    }
    const result = await syncNow(a.page, runDir, "instA", "A", binding.root);
    expect(result, { uploaded: 1 }, "after unlock");
    const after = await getHead(provider, basePrefix);
    if (after.files[path]?.hash === before.files[path]?.hash) {
      throw new Error("the post-unlock sync did not update the remote");
    }
    return { locked: true };
  });

  await step("cleanup remote test prefix", async () => {
    const deleted = await deletePrefix(provider, `${prefix}/`);
    const remaining = await listKeys(provider, `${prefix}/`);
    if (remaining.length > 0) {
      throw new Error(`${remaining.length} objects remain under ${prefix}/`);
    }
    return { deleted: deleted.length };
  });
}

async function runMove(a, provider) {
  const target = `${prefix}/a`;
  write(runDir, "vaultA/Notes/from-a.md", "move one\n");
  await step("configure before the move", () =>
    configurePage(a.page, provider, target, "A"),
  );
  const store = readSyncStore(runDir);
  const binding = Object.values(store.vaults)[0];
  if (!binding) throw new Error("the vault did not bind");

  await step("sync before the move", async () => {
    const result = await syncNow(a.page, runDir, "instA", "A", binding.root);
    expect(result, { uploaded: 1 }, "before move");
  });
  const before = await getHead(provider, target);

  await step("stop the app and rename the folder", async () => {
    await stopInstance(a);
    renameSync(join(runDir, "vaultA"), join(runDir, "vaultA-moved"));
  });

  const port = await freePort();
  let moved;
  try {
    moved = await startInstance({
      runDir,
      name: "instA",
      vault: "vaultA-moved",
      port,
    });
    await step("the moved folder opens configured", async () => {
      await openSync(moved.page);
      const text = (
        await moved.page.locator(".sync-page").first().innerText()
      ).replace(/\s+/g, " ");
      if (!text.includes(target)) {
        throw new Error(
          `the moved vault lost its prefix: ${text.slice(0, 400)}`,
        );
      }
    });
    await step("sync after the move is a no-op", async () => {
      const result = await syncNow(
        moved.page,
        runDir,
        "instA",
        "A",
        join(runDir, "vaultA-moved"),
      );
      expect(result, { uploaded: 0, downloaded: 0, removed: 0 }, "after move");
      const after = await getHead(provider, target);
      if (!after || after.revision !== before.revision) {
        throw new Error("the remote repository changed during a folder move");
      }
    });
    await step("cleanup remote test prefix", async () => {
      const deleted = await deletePrefix(provider, `${prefix}/`);
      const remaining = await listKeys(provider, `${prefix}/`);
      if (remaining.length > 0) {
        throw new Error(`${remaining.length} objects remain under ${prefix}/`);
      }
      return { deleted: deleted.length };
    });
  } catch (error) {
    if (moved) await stopInstance(moved);
    throw error;
  }
  return moved;
}

async function finish(provider, expectedPaths) {
  await step("both vaults end with the same tree", () => {
    const treeA = tree(join(runDir, "vaultA"));
    const treeB = tree(join(runDir, "vaultB"));
    assertTreeEqual(treeA, treeB, "final trees");
    const paths = Object.keys(treeA).sort();
    const expected = [...expectedPaths].sort();
    if (paths.join("\n") !== expected.join("\n")) {
      throw new Error(`final paths: ${paths.join(", ")}`);
    }
    return { paths: paths.length };
  });

  await step(
    "remote head matches both vaults and the lock is gone",
    async () => {
      const head = await getHead(provider, prefix);
      if (!head) throw new Error("no remote head");
      const treeA = tree(join(runDir, "vaultA"));
      const paths = Object.keys(head.files).sort();
      const expected = [...expectedPaths].sort();
      if (paths.join("\n") !== expected.join("\n")) {
        throw new Error(`remote paths: ${paths.join(", ")}`);
      }
      for (const [path, entry] of Object.entries(head.files)) {
        if (entry.hash !== treeA[path]?.hash) {
          throw new Error(`remote hash differs at ${path}`);
        }
      }
      if (await getObject(provider, `${prefix}/v1/lock.json`)) {
        throw new Error("lock.json remains");
      }
      return { paths: paths.length, revision: head.revision };
    },
  );

  await step("cleanup remote test prefix", async () => {
    const deleted = await deletePrefix(provider, `${prefix}/`);
    const remaining = await listKeys(provider, `${prefix}/`);
    if (remaining.length > 0) {
      throw new Error(`${remaining.length} objects remain under ${prefix}/`);
    }
    return { deleted: deleted.length };
  });
}

async function run(provider) {
  prepareRun(runDir);
  let webdav;
  if (provider.transport === "dav" && !provider.endpoint) {
    webdav = await startWebdav({
      root: join(runDir, "webdav-root"),
      username: provider.username,
      password: provider.password,
    });
    provider.endpoint = webdav.endpoint;
  }
  writeFileSync(
    join(runDir, "run.json"),
    JSON.stringify(
      {
        runId,
        provider: {
          name: provider.name,
          transport: provider.transport,
          endpoint: provider.endpoint,
          bucket: provider.bucket,
          region: provider.region,
          flavor: provider.flavor,
        },
        scenario,
        prefix,
        startedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );

  const exe = await step("build portable debug", () =>
    buildPortable(runDir, { build }),
  );
  copyInto(runDir, exe);

  const single =
    scenario === "multi" || scenario === "guard" || scenario === "move";
  const portA = await freePort();
  const portB = single ? null : await freePort();
  let a;
  let b;
  try {
    a = await step("start instance A", () =>
      startInstance({ runDir, name: "instA", vault: "vaultA", port: portA }),
    );
    if (scenario === "multi") {
      await runMulti(a, provider);
    } else if (scenario === "guard") {
      await runGuard(a, provider);
    } else if (scenario === "move") {
      a = await runMove(a, provider);
    } else {
      b = await step("start instance B", () =>
        startInstance({ runDir, name: "instB", vault: "vaultB", port: portB }),
      );
      const expectedPaths =
        scenario === "text"
          ? await runText(a, b, provider)
          : scenario === "media"
            ? await runMedia(a, b, provider)
            : scenario === "large"
              ? await runLarge(a, b, provider)
              : (() => {
                  throw new Error(`unknown scenario ${scenario}`);
                })();
      await finish(provider, expectedPaths);
    }
  } catch (error) {
    if (a) {
      await a.page
        .screenshot({ path: join(runDir, "A-failure.png") })
        .catch(() => {});
    }
    if (b) {
      await b.page
        .screenshot({ path: join(runDir, "B-failure.png") })
        .catch(() => {});
    }
    throw error;
  } finally {
    if (a) await stopInstance(a);
    if (b) await stopInstance(b);
    if (webdav) await webdav.close();
  }
}

(async () => {
  const startedAt = new Date().toISOString();
  let provider;
  let report;
  try {
    provider = loadProvider();
    await run(provider);
    report = {
      runId,
      ok: true,
      scenario,
      provider: {
        name: provider.name,
        transport: provider.transport,
        endpoint: provider.endpoint,
        bucket: provider.bucket,
        region: provider.region,
        flavor: provider.flavor,
      },
      prefix,
      startedAt,
      finishedAt: new Date().toISOString(),
      steps,
    };
  } catch (error) {
    report = {
      runId,
      ok: false,
      scenario,
      provider: provider && {
        name: provider.name,
        transport: provider.transport,
        endpoint: provider.endpoint,
        bucket: provider.bucket,
        region: provider.region,
        flavor: provider.flavor,
      },
      prefix,
      startedAt,
      finishedAt: new Date().toISOString(),
      error: String(error),
      steps,
    };
    console.error(`\nsync-smoke failed: ${error}`);
  }
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, "report.json"), JSON.stringify(report, null, 2));
  for (const entry of report.steps) {
    console.log(
      `${entry.ok ? "ok  " : "FAIL"} ${entry.name}${
        entry.ok ? "" : `\n     ${entry.error}`
      }`,
    );
  }
  const where =
    provider?.transport === "dav"
      ? provider.endpoint
      : join("s3", provider?.bucket ?? "?", prefix).replace(/\\/g, "/");
  console.log(
    `\n${report.ok ? "PASS" : "FAIL"} ${scenario} on ${providerName} · ` +
      `remote ${where} · report ${join(runDir, "report.json")}`,
  );
  if (report.ok && !keep) {
    rmSync(runDir, { recursive: true, force: true });
    console.log("removed the run directory (use --keep to keep it)");
    process.exit(0);
  }
  process.exit(report.ok ? 0 : 1);
})();

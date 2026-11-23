#!/usr/bin/env node
// The fork's upstream workflow: inspect the patch surface, plan and start a
// tag merge, re-apply the fork-clean deletions, run the checks, record the
// merge, and export a PR patch without private paths. The procedure lives in
// docs/skein/discipline/工程菜谱.md R5 and publishing-gate.md; this command
// makes its read-only parts one line and its write parts explicit --apply.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, stringify } from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const statusPath = join(root, "docs/skein/status.yaml");
const args = process.argv.slice(2);
const command = args[0];
const rest = args.slice(1);

function git(argv, options = {}) {
  const result = execFileSync("git", ["-c", "core.quotepath=false", ...argv], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 100 * 1024 * 1024,
    ...options,
  });
  return typeof result === "string" ? result.trim() : "";
}

function statusData() {
  return parse(readFileSync(statusPath, "utf8"));
}

function localDate() {
  return new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}

function lines(text) {
  return text.split("\n").filter(Boolean);
}

function currentBranch() {
  return git(["rev-parse", "--abbrev-ref", "HEAD"]);
}

function cleanWorktree() {
  return git(["status", "--porcelain"]) === "";
}

function tagExists(tag) {
  try {
    git(["rev-parse", "--verify", `refs/tags/${tag}`]);
    return true;
  } catch {
    return false;
  }
}

function stableTags() {
  return lines(git(["tag", "--list", "v*", "--sort=-v:refname"])).filter(
    (tag) => /^v\d+\.\d+\.\d+$/.test(tag),
  );
}

function forkCleanPaths() {
  const gate = readFileSync(join(root, ".githooks/gate.mjs"), "utf8");
  const block = /absentPaths:\s*\[([\s\S]*?)\n\s*\],/.exec(gate)?.[1] ?? "";
  return [...block.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

function tagTree(tag) {
  return lines(git(["ls-tree", "-r", "--name-only", tag]));
}

function presentInTag(tag) {
  const tree = tagTree(tag);
  return forkCleanPaths()
    .map((path) =>
      path.endsWith("/")
        ? { path, count: tree.filter((name) => name.startsWith(path)).length }
        : { path, count: tree.includes(path) ? 1 : 0 },
    )
    .filter((entry) => entry.count > 0);
}

function presentInWorktree() {
  return forkCleanPaths().filter((path) => existsSync(join(root, path)));
}

function prExclusions() {
  return [
    ":(exclude)docs/skein",
    ":(exclude).ryugi",
    ":(exclude).githooks",
    ":(exclude).github",
    ":(exclude).claude",
    ...forkCleanPaths().map(
      (path) => `:(exclude)${path.endsWith("/") ? path.slice(0, -1) : path}`,
    ),
  ];
}

function prFiles(ref) {
  return lines(
    git([
      "diff",
      "--name-only",
      `upstream/main...${ref}`,
      "--",
      ".",
      ...prExclusions(),
    ]),
  );
}

function patchFiles(ref) {
  const baseline = statusData().baseline;
  return lines(git(["diff", "--name-only", `${baseline}...${ref}`]));
}

function upstreamFiles(tag) {
  return lines(git(["diff", "--name-only", statusData().baseline, tag]));
}

function group(files) {
  const groups = new Map();
  for (const file of files) {
    const top = file.includes("/") ? file.split("/")[0] : "(root)";
    groups.set(top, (groups.get(top) ?? 0) + 1);
  }
  return [...groups].sort((a, b) => b[1] - a[1]);
}

function printGroups(files) {
  for (const [name, count] of group(files).slice(0, 12))
    console.log(`  ${name}: ${count}`);
}

function fetchUpstream() {
  console.log("> git fetch upstream --tags");
  const result = spawnSync("git", ["fetch", "upstream", "--tags"], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    console.error("git fetch upstream --tags failed");
    process.exit(result.status ?? 1);
  }
}

function options(argv) {
  const found = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    const value = argv[i + 1];
    if (value !== undefined && !value.startsWith("--")) {
      found[key] = value;
      i++;
    } else found[key] = true;
  }
  return found;
}

function printStatus(flags) {
  if (flags.fetch) fetchUpstream();
  const data = statusData();
  const branch = currentBranch();
  const latest = stableTags()[0];
  const patch = patchFiles("HEAD");
  const ahead = Number(git(["rev-list", "--count", `${data.baseline}..HEAD`]));
  const behind = latest
    ? Number(git(["rev-list", "--count", `HEAD..${latest}`]))
    : 0;
  console.log(
    `branch: ${branch}  HEAD: ${git(["rev-parse", "--short", "HEAD"])}`,
  );
  console.log(
    `baseline: ${data.baseline} (${data.commit})  package: ${JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version}`,
  );
  console.log(`latest stable tag: ${latest ?? "—"}  commits behind: ${behind}`);
  console.log(`fork commits since baseline: ${ahead}`);
  console.log(`patch surface: ${patch.length} files`);
  printGroups(patch);
  if (latest) {
    const absent = presentInTag(latest);
    const total = absent.reduce((sum, entry) => sum + entry.count, 0);
    console.log(
      `fork-clean paths the tag would re-add: ${absent.length} paths / ${total} files`,
    );
    for (const entry of absent.slice(0, 8))
      console.log(`  ${entry.path} (${entry.count})`);
    if (absent.length > 8) console.log(`  … ${absent.length - 8} more`);
  }
  console.log(`\nnext: npm run upstream:plan -- ${latest ?? "vX.Y.Z"} --fetch`);
  if (flags.gate) runGate("fork", "origin/main..HEAD");
}

function printPlan(tag, flags) {
  if (flags.fetch) fetchUpstream();
  if (!tag || !tagExists(tag)) {
    console.error(
      `tag ${tag ?? "(missing)"} is not present; run with --fetch or check the name`,
    );
    process.exit(1);
  }
  const data = statusData();
  const upstream = upstreamFiles(tag);
  const patch = prFiles("HEAD");
  const overlap = upstream.filter((file) => patch.includes(file));
  const absent = presentInTag(tag);
  console.log(`plan: ${data.baseline} -> ${tag}`);
  console.log(
    `upstream commits: ${git(["rev-list", "--count", `HEAD..${tag}`])}`,
  );
  console.log(
    `upstream files: ${upstream.length}; fork patch files: ${patch.length}`,
  );
  console.log(`overlap (merge conflicts likely): ${overlap.length}`);
  for (const file of overlap.slice(0, 40)) console.log(`  ${file}`);
  if (overlap.length > 40) console.log(`  … ${overlap.length - 40} more`);
  console.log(`fork-clean paths the tag re-adds: ${absent.length}`);
  for (const entry of absent.slice(0, 20))
    console.log(`  ${entry.path} (${entry.count})`);
  console.log(`\nsteps:
  1. npm run upstream:start -- ${tag} --apply
  2. resolve the overlap files above; npm run upstream:clean -- --apply
  3. npm run upstream:verify
  4. npm run upstream:record -- ${tag} --checks "…"
  5. npm run upstream:finish -- ${tag} --apply`);
}

function start(tag, flags) {
  if (!tag || !tagExists(tag)) {
    console.error(
      `tag ${tag ?? "(missing)"} is not present; run upstream:plan -- ${tag ?? "vX.Y.Z"} --fetch`,
    );
    process.exit(1);
  }
  if (!flags.apply) {
    printPlan(tag, {});
    console.log(
      "\nDry run only. Re-run with --apply to create the sync branch and merge.",
    );
    return;
  }
  if (!cleanWorktree()) {
    console.error(
      "worktree is not clean; commit or move the current changes first",
    );
    process.exit(1);
  }
  const branch = currentBranch();
  if (branch === "main") {
    console.error("refusing to merge upstream on main");
    process.exit(1);
  }
  if (branch.startsWith("sync/upstream-")) {
    console.error(`already on ${branch}; finish or leave it first`);
    process.exit(1);
  }
  const sync = `sync/upstream-${tag}`;
  if (git(["branch", "--list", sync])) {
    console.error(`branch ${sync} already exists`);
    process.exit(1);
  }
  console.log(`> git switch -c ${sync}`);
  git(["switch", "-c", sync], { stdio: "inherit" });
  console.log(`> git merge ${tag} --no-ff`);
  const merge = spawnSync(
    "git",
    ["merge", tag, "--no-ff", "-m", `Merge upstream ${tag}`],
    { cwd: root, stdio: "inherit" },
  );
  if (merge.status !== 0) {
    console.error(`\nmerge stopped; resolve conflicts, then:
  npm run upstream:clean -- --apply
  npm run upstream:verify
  git add <files> && git commit`);
    process.exit(merge.status ?? 1);
  }
  const absent = presentInWorktree();
  if (absent.length) {
    console.log(`\nfork-clean paths returned: ${absent.join(", ")}`);
    console.log("run: npm run upstream:clean -- --apply");
  }
  console.log("\nnext: npm run upstream:verify");
}

function clean(flags) {
  const present = presentInWorktree();
  if (!present.length) {
    console.log("no fork-clean paths are present");
    return;
  }
  console.log(`fork-clean paths present: ${present.length}`);
  for (const path of present) console.log(`  ${path}`);
  if (!flags.apply) {
    console.log(
      "\nDry run only. Re-run with --apply to delete them from the tree and index.",
    );
    return;
  }
  for (const path of present) {
    spawnSync("git", ["rm", "-r", "--ignore-unmatch", "-f", "--", path], {
      cwd: root,
      stdio: "inherit",
    });
    rmSync(join(root, path), { recursive: true, force: true });
  }
  console.log(
    "\nremoved; review with `git status` and include the deletion in the merge commit.",
  );
}

function verify(flags) {
  const scripts = flags.full
    ? ["check:all", "test:phone-shell", "test:ui-contracts"]
    : ["check", "check:native", "test:phone-shell", "test:ui-contracts"];
  for (const script of scripts) {
    console.log(`\n=== npm run ${script}`);
    const result = spawnSync("npm", ["run", script], {
      cwd: root,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    if (result.status !== 0) {
      console.error(`npm run ${script} failed`);
      process.exit(result.status ?? 1);
    }
  }
  console.log(`\nmerge cleanup and UI pass still required (decision 55):
  cleanup: npm run upstream:clean -- --apply; review upstream UI diff; keep one
           settings/phone implementation; regenerate bindings and plugin reference
  UI:      desktop built app - settings dialog, appearance, document, theme workshop,
           Today/sidebar; Android - settings list, document, model, chat/proxy,
           extensions' installable lists, Today changes, theme workshop
  new upstream UI: adapt to the fork's row/card/token contract
           (docs/skein/specs/界面契约.md) and add a phone-settings-shell or
           ui-contracts assertion, or do not merge it
  npm run tauri build -- --debug`);
}

function finish(tag, flags) {
  if (!flags.apply) {
    console.log(
      "Dry run: finish fast-forwards the work branch, deletes the sync branch.",
    );
    console.log(
      "Re-run with --apply after upstream:verify and upstream:record.",
    );
    return;
  }
  const branch = currentBranch();
  if (!branch.startsWith("sync/upstream-")) {
    console.error(`current branch ${branch} is not a sync/upstream-* branch`);
    process.exit(1);
  }
  if (!cleanWorktree()) {
    console.error("worktree is not clean; commit the merge first");
    process.exit(1);
  }
  const into = flags.into ?? statusData().branch;
  console.log(`> git switch ${into}`);
  git(["switch", into], { stdio: "inherit" });
  console.log(`> git merge --ff-only ${branch}`);
  const merge = spawnSync("git", ["merge", "--ff-only", branch], {
    cwd: root,
    stdio: "inherit",
  });
  if (merge.status !== 0) {
    console.error(
      "fast-forward failed; the work branch moved or the merge is not linear",
    );
    process.exit(merge.status ?? 1);
  }
  git(["branch", "-d", branch], { stdio: "inherit" });
  console.log(`\n${tag ?? branch} fast-forwarded into ${into}.`);
}

function record(tag, flags) {
  if (!tag) {
    console.error(
      "upstream:record needs the tag, e.g. upstream:record -- v1.4.7 --checks '…'",
    );
    process.exit(1);
  }
  const data = statusData();
  const date = localDate();
  const merge = git(["rev-parse", "--short", "HEAD"]);
  const archive = join(root, `docs/skein/archive/${date}-upstream-${tag}.md`);
  if (existsSync(archive)) {
    console.error(`archive already exists: ${archive}`);
    process.exit(1);
  }
  const body = `# 上游 ${tag} 合并（${date}）

> 基线：${data.baseline} → ${tag}。记录 tag、合并提交、取舍、验证与未做项。

## 合并

- tag：\`${tag}\`
- 合并提交：\`${merge}\`
- 工作分支：\`${data.branch}\`

## 取舍

（哪些冲突按 fork、哪些按上游；fork-clean 删除了什么）

## 验证

${flags.checks ?? "（未填：npm run check / check:native / built app / Android）"}

## 未做

（未跑的 smoke、外部阻塞）
`;
  writeFileSync(archive, body);
  data.baseline = tag;
  data.commit = merge;
  data.updated = date;
  writeFileSync(
    statusPath,
    "# The source of STATUS.md. Run `npm run docs:status` after editing; the\n" +
      "# generated page and this file are checked for drift by `npm run docs:check`.\n" +
      stringify(data, { lineWidth: 0 }),
  );
  const status = spawnSync(process.execPath, ["scripts/docs-status.mjs"], {
    cwd: root,
    stdio: "inherit",
  });
  const index = spawnSync(process.execPath, ["scripts/docs-index.mjs"], {
    cwd: root,
    stdio: "inherit",
  });
  if (status.status !== 0 || index.status !== 0) process.exit(1);
  console.log(`Recorded ${tag} in ${archive} and updated status.yaml.`);
}

function exportPatch(ref, flags) {
  if (!ref) {
    console.error(
      "upstream:patch needs a ref, e.g. upstream:patch -- base-ui-settings",
    );
    process.exit(1);
  }
  const base = "upstream/main";
  const diff = git(["diff", `${base}...${ref}`, "--", ".", ...prExclusions()]);
  const slug = ref.replace(/[\\/:*?"<>|]/g, "-");
  const out = flags.out ?? `C:/Project/pr-${slug}.patch`;
  writeFileSync(out, `${diff}\n`);
  console.log(`Wrote ${out} (${diff.split("\n").length} lines).`);
  console.log(`Next, in an upstream clone:
  git fetch origin && git switch -c pr/<slug> origin/main
  git apply ${out}
  node C:/Project/Textus/.githooks/gate.mjs upstream --range "origin/main..pr/<slug>"`);
}

function ticket(ref) {
  if (!ref) {
    console.error("upstream:ticket needs a ref");
    process.exit(1);
  }
  const base = git(["rev-parse", "--short", "upstream/main"]);
  const files = prFiles(ref);
  const slug = ref.replace(/[\\/:*?"<>|]/g, "-");
  console.log(`目标：代码 + PR
仓：C:\\Project\\Textus-upstream
基线：origin/main @ ${base}
分支：pr/${slug}
关联：
文件：
${files.map((file) => `  ${file}`).join("\n")}
行为：
验证：`);
}

function runGate(mode, range) {
  if (!["fork", "upstream"].includes(mode)) {
    console.error("gate mode must be fork or upstream");
    process.exit(1);
  }
  const result = spawnSync(
    process.execPath,
    [".githooks/gate.mjs", mode, "--range", range],
    { cwd: root, stdio: "inherit" },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function usage() {
  console.log(`Usage:
  npm run upstream:status [--fetch] [--gate]
  npm run upstream:plan -- <tag> [--fetch]
  npm run upstream:start -- <tag> --apply
  npm run upstream:clean -- [--apply]
  npm run upstream:verify [--full]
  npm run upstream:record -- <tag> --checks "..."
  npm run upstream:finish -- <tag> --apply [--into <branch>]
  npm run upstream:patch -- <ref> [--out <file>]
  npm run upstream:ticket -- <ref>
  npm run upstream:gate -- <fork|upstream> [--range A..B]`);
}

const flags = options(rest);
if (command === "status") printStatus(flags);
else if (command === "plan")
  printPlan(
    rest.find((arg) => !arg.startsWith("--")),
    flags,
  );
else if (command === "start")
  start(
    rest.find((arg) => !arg.startsWith("--")),
    flags,
  );
else if (command === "clean") clean(flags);
else if (command === "verify") verify(flags);
else if (command === "record")
  record(
    rest.find((arg) => !arg.startsWith("--")),
    flags,
  );
else if (command === "finish")
  finish(
    rest.find((arg) => !arg.startsWith("--")),
    flags,
  );
else if (command === "patch")
  exportPatch(
    rest.find((arg) => !arg.startsWith("--")),
    flags,
  );
else if (command === "ticket")
  ticket(rest.find((arg) => !arg.startsWith("--")));
else if (command === "gate")
  runGate(
    rest[0],
    flags.range ??
      (rest[0] === "upstream" ? "upstream/main..HEAD" : "origin/main..HEAD"),
  );
else usage();

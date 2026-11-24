#!/usr/bin/env node
// Checks commit messages for the hard task gate. Commits before the gate was
// installed are out of scope; every later non-merge commit that touches code
// must name a doing task (or an archived one) in a `Task: <id>` trailer.
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkTaskId } from "./task-ledger.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const rangeIndex = args.indexOf("--range");
const range = rangeIndex === -1 ? undefined : args[rangeIndex + 1];
if (!range) {
  console.error("usage: check-commits.mjs --range <base>..<head>");
  process.exit(1);
}

function git(...argv) {
  return execFileSync("git", argv, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  }).trim();
}

const gate = (() => {
  try {
    return git(
      "log",
      "--diff-filter=A",
      "--format=%H",
      "--",
      ".githooks/commit-msg",
    )
      .split("\n")
      .filter(Boolean)
      .pop();
  } catch {
    return undefined;
  }
})();

const commits = git("rev-list", "--reverse", range).split("\n").filter(Boolean);
const problems = [];
for (const hash of commits) {
  if (gate) {
    try {
      execFileSync("git", ["merge-base", "--is-ancestor", hash, gate], {
        cwd: root,
        stdio: "ignore",
      });
      continue;
    } catch {
      // not an ancestor of the gate: this commit is in scope
    }
  }
  const parents = git("rev-list", "--parents", "-n", "1", hash).split(" ");
  if (parents.length > 2) continue; // merge commit
  const files = git("diff-tree", "--no-commit-id", "--name-only", "-r", hash)
    .split("\n")
    .filter(Boolean);
  if (!files.some((file) => /^(src|src-tauri|e2e|scripts)\//.test(file)))
    continue;
  const message = git("show", "-s", "--format=%B", hash);
  const task = /^Task:\s*(\S+)/m.exec(message)?.[1];
  const subject = git("show", "-s", "--format=%s", hash);
  if (!task) {
    problems.push(`${hash.slice(0, 8)} ${subject}: missing \`Task: <id>\``);
    continue;
  }
  const result = checkTaskId(task, root);
  if (!result.ok)
    problems.push(`${hash.slice(0, 8)} ${subject}: ${result.reason}`);
}

if (problems.length) {
  console.error(`Commit task gate failed:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(`${commits.length} commit(s) in range; task gate holds`);

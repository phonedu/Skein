#!/usr/bin/env node
// A human-readable health report over the generated docs: hard checks first,
// then the slow drifts a hard check should not fail on (stale active specs,
// long summaries, duplicate titles, tasks without a brief).
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const skein = join(root, "docs/skein");
const days = (date) => (Date.now() - new Date(date).getTime()) / 86400000;

function run(script, args = []) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: "utf8",
  });
  return {
    ok: result.status === 0,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim(),
  };
}

function files(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (!["archive", "_templates"].includes(name)) out.push(...files(path));
    } else if (name.endsWith(".md")) out.push(path);
  }
  return out;
}

function frontMatter(text) {
  if (!text.startsWith("---\n")) return {};
  const end = text.indexOf("\n---\n", 4);
  return end === -1 ? {} : (parse(text.slice(4, end)) ?? {});
}

const hard = [
  run("scripts/docs-status.mjs", ["--check"]),
  run("scripts/docs-index.mjs", ["--check"]),
  run("scripts/check-skein-docs.mjs"),
  run("scripts/check-docs-state.mjs"),
];
const warnings = [];
const titles = new Map();
const specTasks = new Map();
for (const file of files(skein)) {
  const rel = relative(skein, file).split(sep).join("/");
  if (
    ["README.md", "INDEX.md", "COMMANDS.md", "decisions/README.md"].includes(
      rel,
    )
  )
    continue;
  const text = readFileSync(file, "utf8");
  const meta = frontMatter(text);
  const title = /^# (.+)$/m.exec(text)?.[1].trim() ?? "";
  if (title) {
    if (titles.has(title))
      warnings.push(`duplicate title: ${rel} and ${titles.get(title)}`);
    else titles.set(title, rel);
  }
  if (meta.summary && String(meta.summary).length > 80)
    warnings.push(`summary over 80 chars: ${rel}`);
  if (
    meta.type === "spec" &&
    meta.status === "active" &&
    meta.updated &&
    days(meta.updated) > 90
  )
    warnings.push(
      `active spec not updated in 90 days: ${rel} (${meta.updated})`,
    );
  if (meta.type === "spec" && Array.isArray(meta.tasks))
    specTasks.set(rel, meta.tasks);
}

const status = parse(readFileSync(join(skein, "status.yaml"), "utf8"));
const workstreams = new Set(status.workstreams?.map((line) => line.id));
const openIds = new Set([
  ...(status.tasks ?? []).map((task) => task.id),
  ...(status.later ?? []).map((task) => task.id),
]);
for (const [rel, ids] of specTasks)
  if (ids.length && !ids.some((id) => openIds.has(String(id))))
    warnings.push(`active spec has no open task; archive candidate: ${rel}`);

const inboxPath = join(skein, "inbox.yaml");
const inbox = existsSync(inboxPath)
  ? (parse(readFileSync(inboxPath, "utf8"))?.items ?? [])
  : [];
const openInbox = inbox.filter((item) => item.status === "new");
if (openInbox.length)
  warnings.push(
    `inbox has ${openInbox.length} untriaged item(s): ${openInbox.map((item) => item.id).join(", ")}; run docs:audit and triage`,
  );

for (const task of status.tasks ?? []) {
  if (task.state === "doing" && (task.kind ?? "task") !== "chore") {
    const missing = [
      "problem",
      "expected",
      "standard",
      "not",
      "scope",
      "evidence",
    ].filter((field) => !String(task.brief?.[field] ?? "").trim());
    if (missing.length)
      warnings.push(
        `doing task ${task.id} has no brief: ${missing.join(", ")}`,
      );
  }
  if (task.workstream && !workstreams.has(task.workstream))
    warnings.push(
      `task ${task.id} names unknown workstream ${task.workstream}`,
    );
}

const audit = run("scripts/docs-audit.mjs", ["--summary"]);
if (audit.output) console.log(`audit: ${audit.output}`);

for (const result of hard) if (result.output) console.log(result.output);
if (warnings.length) {
  console.log(`\nWarnings (${warnings.length}):`);
  for (const warning of warnings) console.log(`  - ${warning}`);
} else {
  console.log("\nNo warnings.");
}

if (hard.some((result) => !result.ok)) process.exit(1);

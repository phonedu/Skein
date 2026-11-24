#!/usr/bin/env node
// The state machine behind docs: the ledger, the specs it points at, and the
// layer each document belongs to must agree. This is the hard check that
// catches a task with no spec, a spec listing a task that no longer exists, or
// a completed spec left in specs/.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const skein = join(root, "docs/skein");
const statusPath = join(skein, "status.yaml");
const problems = [];
const status = parse(readFileSync(statusPath, "utf8"));
const briefFields = [
  "problem",
  "expected",
  "standard",
  "not",
  "scope",
  "evidence",
];

function rel(file) {
  return relative(skein, file).split(sep).join("/");
}

function frontMatter(text) {
  if (!text.startsWith("---\n")) return {};
  const end = text.indexOf("\n---\n", 4);
  return end === -1 ? {} : (parse(text.slice(4, end)) ?? {});
}

function docsIn(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...docsIn(path));
    else if (name.endsWith(".md")) out.push(path);
  }
  return out;
}

function resolveSpec(spec) {
  const path = spec.split("#")[0];
  for (const candidate of [
    path,
    join("specs", path),
    join("proposals", path),
  ]) {
    const absolute = join(skein, candidate);
    if (existsSync(absolute)) return absolute;
  }
  return null;
}

const workstreams = new Set((status.workstreams ?? []).map((line) => line.id));
const items = [
  ...(status.tasks ?? []).map((item) => ({ ...item, list: "tasks" })),
  ...(status.later ?? []).map((item) => ({ ...item, list: "later" })),
];
const ids = new Set();
for (const item of items) {
  if (!item.id || !item.title) problems.push(`ledger: item without id/title`);
  if (ids.has(item.id)) problems.push(`ledger: duplicate id ${item.id}`);
  ids.add(item.id);
  if (!workstreams.has(item.workstream) && item.workstream)
    problems.push(`${item.id}: unknown workstream ${item.workstream}`);
  if (item.list === "tasks" && !["todo", "doing"].includes(item.state))
    problems.push(`${item.id}: task state must be todo or doing`);
  if (
    item.list === "tasks" &&
    item.state === "doing" &&
    (item.kind ?? "task") !== "chore"
  ) {
    const missing = briefFields.filter(
      (field) => !String(item.brief?.[field] ?? "").trim(),
    );
    if (missing.length)
      problems.push(`${item.id}: doing task missing ${missing.join(", ")}`);
  }
  if (!item.spec) {
    problems.push(`${item.id}: missing spec`);
    continue;
  }
  const specPath = resolveSpec(item.spec);
  if (!specPath) {
    problems.push(`${item.id}: spec does not exist: ${item.spec}`);
    continue;
  }
  const meta = frontMatter(readFileSync(specPath, "utf8"));
  if ((item.kind ?? "task") === "chore") continue;
  if (!Array.isArray(meta.tasks)) {
    problems.push(`${item.id}: ${item.spec} has no tasks: front matter`);
  } else if (!meta.tasks.map(String).includes(String(item.id))) {
    problems.push(`${item.id}: ${item.spec} does not list it in tasks`);
  }
}

const layers = [
  ["specs", ["active", "frozen"]],
  ["proposals", ["draft", "deferred"]],
  ["research", ["reference"]],
  ["discipline", ["active"]],
];
const specTasks = new Map();
for (const [folder, allowed] of layers) {
  for (const file of docsIn(join(skein, folder))) {
    const path = rel(file);
    const meta = frontMatter(readFileSync(file, "utf8"));
    if (!allowed.includes(meta.status))
      problems.push(`${path}: status ${meta.status} not allowed in ${folder}/`);
    if (!meta.summary) problems.push(`${path}: missing summary`);
    if (!meta.updated) problems.push(`${path}: missing updated`);
    if (Array.isArray(meta.tasks)) specTasks.set(path, meta.tasks.map(String));
    if (
      (folder === "specs" || folder === "proposals") &&
      !Array.isArray(meta.tasks)
    )
      problems.push(`${path}: missing tasks front matter`);
  }
}

for (const [path, taskIds] of specTasks)
  for (const taskId of taskIds)
    if (!ids.has(taskId))
      problems.push(`${path}: lists unknown task ${taskId}`);

for (const file of docsIn(join(skein, "decisions"))) {
  if (file.endsWith("README.md")) continue;
  const path = rel(file);
  const meta = frontMatter(readFileSync(file, "utf8"));
  if (meta.type !== "decision") problems.push(`${path}: not type decision`);
  if (!Number.isInteger(meta.id)) problems.push(`${path}: missing integer id`);
  if (!meta.spec) problems.push(`${path}: missing spec`);
  else if (!resolveSpec(meta.spec))
    problems.push(`${path}: spec does not exist: ${meta.spec}`);
}

if (problems.length) {
  console.error(`Docs state check failed:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(
  `${ids.size} ledger items, ${specTasks.size} linked specs/notes; state and layers hold`,
);

#!/usr/bin/env node
// Finds commitments that live in prose but may not be in STATUS: lines under
// specs/ or proposals/ (research/ with --all) that say "later / next /
// deferred / pending" and carry no task id. This is a review aid, not a gate:
// the output is a triage list, not a verdict.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const skein = join(root, "docs/skein");
const inboxPath = join(skein, "inbox.yaml");
const args = process.argv.slice(2);
const summary = args.includes("--summary");
const all = args.includes("--all");
const terms =
  /待做|待办|暂缓|待补|待定|未做|待审|TODO|TBD|later|follow-up|下一步|以后(?:再|要|可|做|加)|后续(?:再|要|可|补|做|加)/i;
const taskId = /\b(?:[A-Z]{1,3}\d|UI-p\d|PH\d|TW\d|ED\d|CP\d)\b/;

function files(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...files(path));
    else if (name.endsWith(".md")) out.push(path);
  }
  return out;
}

function frontMatter(text) {
  if (!text.startsWith("---\n")) return {};
  const end = text.indexOf("\n---\n", 4);
  return end === -1 ? {} : (parse(text.slice(4, end)) ?? {});
}

function inboxCount() {
  if (!existsSync(inboxPath)) return 0;
  const data = parse(readFileSync(inboxPath, "utf8")) ?? {};
  return (data.items ?? []).filter((item) => item.status === "new").length;
}

const roots = [
  join(skein, "specs"),
  join(skein, "proposals"),
  ...(all ? [join(skein, "research")] : []),
];
const candidates = [];
for (const file of roots.flatMap(files)) {
  const rel = relative(skein, file).split(sep).join("/");
  const text = readFileSync(file, "utf8");
  const meta = frontMatter(text);
  if (["frozen", "done", "superseded"].includes(meta.status)) continue;
  const lines = text.split("\n");
  let fence = false;
  for (const [index, line] of lines.entries()) {
    if (line.startsWith("```")) {
      fence = !fence;
      continue;
    }
    if (fence) continue;
    if (line.startsWith("#") || !terms.test(line)) continue;
    if (!/^\s*(?:[-*]|\d+\.|\|)/.test(line)) continue;
    candidates.push({
      rel,
      line: index + 1,
      text: line.trim().replace(/\s+/g, " "),
      linked: taskId.test(line),
    });
  }
}

const open = inboxCount();
if (summary) {
  console.log(
    `inbox: ${open} open; prose candidates: ${candidates.length} (${candidates.filter((item) => !item.linked).length} without a task id)`,
  );
  process.exit(0);
}

console.log(`Inbox: ${open} open`);
for (const item of candidates.slice(0, 80)) {
  console.log(
    `${item.linked ? "  linked" : "* candidate"}  ${item.rel}:${item.line}  ${item.text.slice(0, 180)}`,
  );
}
if (candidates.length > 80) console.log(`… ${candidates.length - 80} more`);
console.log(
  `\n${candidates.length} prose candidate(s); ${candidates.filter((item) => !item.linked).length} without a task id. Triage: task / decision / explicitly not doing.`,
);

#!/usr/bin/env node
// Full-text search over the live Skein docs (and decisions), returning the
// short answer first: title, summary, and the first matching line.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const skein = join(root, "docs/skein");
const args = process.argv.slice(2);
const all = args.includes("--all");
const limitIndex = args.indexOf("--limit");
const limit = limitIndex === -1 ? 15 : Number(args[limitIndex + 1]) || 15;
const query = args
  .filter(
    (arg, index) =>
      !arg.startsWith("--") && !(limitIndex !== -1 && index === limitIndex + 1),
  )
  .join(" ")
  .trim();
if (!query) {
  console.error("Usage: npm run docs:find -- <关键词> [--all] [--limit N]");
  process.exit(1);
}

function files(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (all || name !== "archive") out.push(...files(path));
    } else if (name.endsWith(".md")) out.push(path);
  }
  return out;
}

function frontMatter(text) {
  if (!text.startsWith("---\n")) return {};
  const end = text.indexOf("\n---\n", 4);
  return end === -1 ? {} : (parse(text.slice(4, end)) ?? {});
}

function body(text) {
  return text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
}

const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
const hits = [];
for (const file of files(skein)) {
  const rel = relative(skein, file).split(sep).join("/");
  const text = readFileSync(file, "utf8");
  const meta = frontMatter(text);
  const title = /^# (.+)$/m.exec(text)?.[1].trim() ?? "";
  const summary = meta.summary ?? "";
  const content = body(text);
  const lower = content.toLowerCase();
  let score = 0;
  let firstLine = "";
  for (const term of terms) {
    if (title.toLowerCase().includes(term)) score += 10;
    if (summary.toLowerCase().includes(term)) score += 6;
    const count = lower.split(term).length - 1;
    score += Math.min(count, 5);
    if (!firstLine) {
      firstLine =
        content
          .split("\n")
          .find(
            (line) =>
              !line.startsWith("#") && line.toLowerCase().includes(term),
          )
          ?.trim() ?? "";
    }
  }
  if (score) hits.push({ rel, title, summary, score, firstLine });
}

for (const task of parse(readFileSync(join(skein, "status.yaml"), "utf8"))
  .tasks ?? []) {
  const haystack =
    `${task.id} ${task.title} ${task.acceptance ?? ""}`.toLowerCase();
  if (terms.every((term) => haystack.includes(term)))
    hits.push({
      rel: "status.yaml",
      title: `${task.id} — ${task.title}`,
      summary: task.acceptance ?? "",
      score: 8,
      firstLine: "",
    });
}

hits.sort((a, b) => b.score - a.score || a.rel.localeCompare(b.rel, "en"));
if (!hits.length) {
  console.log(`No matches for "${query}".`);
  process.exit(0);
}
for (const hit of hits.slice(0, limit)) {
  console.log(`\n${hit.rel}\n  ${hit.title}`);
  if (hit.summary) console.log(`  ${hit.summary}`);
  if (hit.firstLine) console.log(`  > ${hit.firstLine.slice(0, 180)}`);
}
console.log(`\n${Math.min(hits.length, limit)} of ${hits.length} matches.`);

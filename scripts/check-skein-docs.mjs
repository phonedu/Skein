#!/usr/bin/env node
// Checks the Skein documentation's own rules: relative links resolve, every
// live document carries the metadata the generated index needs, decision ids
// are unique and match their filename and heading, the generated index covers
// every live document, and the few documents read every day stay small.
// Run with `npm run check:skein`.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { brokenLinks } from "./check-links.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const skein = join(root, "docs/skein");
/** Frozen records and templates: not indexed, not held to the metadata rules. */
const skippedDirs = new Set(["archive", "_templates"]);
const skippedDocs = new Set(["README.md", "INDEX.md", "decisions/README.md"]);
const types = new Set(["spec", "decision", "research", "discipline", "status"]);
const statuses = new Set([
  "draft",
  "active",
  "frozen",
  "deferred",
  "reference",
  "accepted",
  "superseded",
]);

function markdownFiles(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (!skippedDirs.has(name)) files.push(...markdownFiles(path));
    } else if (name.endsWith(".md")) {
      files.push(path);
    }
  }
  return files;
}

const rel = (file) => relative(root, file).split(sep).join("/");
const skeinRel = (file) => relative(skein, file).split(sep).join("/");
const files = markdownFiles(skein);
const live = files.filter((file) => !skippedDocs.has(skeinRel(file)));
const problems = [];
const warnings = [];

function frontMatter(text) {
  if (!text.startsWith("---\n")) return null;
  const end = text.indexOf("\n---\n", 4);
  return end === -1 ? null : parse(text.slice(4, end));
}

// A relative link that leads nowhere is a lie in a document an agent reads.
for (const broken of brokenLinks(files.map(rel), root))
  problems.push(`broken link: ${broken}`);

const texts = new Map(live.map((file) => [file, readFileSync(file, "utf8")]));
const metas = new Map();
const decisionIds = new Map();

for (const file of live) {
  const path = skeinRel(file);
  const text = texts.get(file);
  const meta = frontMatter(text);
  if (!meta) {
    problems.push(`missing front matter: docs/skein/${path}`);
    continue;
  }
  metas.set(file, meta);
  if (!types.has(meta.type))
    problems.push(`unknown type "${meta.type}": docs/skein/${path}`);
  if (!statuses.has(meta.status))
    problems.push(`unknown status "${meta.status}": docs/skein/${path}`);
  if (!meta.summary) problems.push(`missing summary: docs/skein/${path}`);
  if (meta.type !== "decision" && !meta.updated)
    problems.push(`missing updated: docs/skein/${path}`);

  const heading = /^# (.+)$/m.exec(text)?.[1].trim() ?? "";
  if (!heading) problems.push(`missing level-one heading: docs/skein/${path}`);
  if (meta.type === "decision") {
    if (!Number.isInteger(meta.id))
      problems.push(`decision id must be an integer: docs/skein/${path}`);
    const id = String(meta.id).padStart(4, "0");
    if (decisionIds.has(id))
      problems.push(
        `duplicate decision id ${id}: docs/skein/${path} and ${decisionIds.get(id)}`,
      );
    decisionIds.set(id, path);
    if (!path.startsWith(`decisions/${id}-`))
      problems.push(
        `decision filename must start with ${id}-: docs/skein/${path}`,
      );
    if (!heading.startsWith(`裁决 ${meta.id} —`))
      problems.push(
        `decision heading must start "裁决 ${meta.id} —": docs/skein/${path}`,
      );
    if (!meta.date) problems.push(`missing date: docs/skein/${path}`);
    if (!meta.spec) problems.push(`missing spec: docs/skein/${path}`);
    if (meta.supersedes !== undefined && !Array.isArray(meta.supersedes))
      problems.push(`supersedes must be a list: docs/skein/${path}`);
  }

  // Version headings and change tables are what made the old docs unreadable;
  // git is the change log now.
  if (/^## .*修订记录/m.test(text))
    problems.push(`revision log belongs in git, not here: docs/skein/${path}`);
  if (/^> 版本：v/m.test(text))
    problems.push(`drop the version heading, use updated:: docs/skein/${path}`);
}

// Decisions may only point at ids that exist.
for (const [file, meta] of metas) {
  if (meta.type !== "decision") continue;
  for (const old of meta.supersedes ?? []) {
    const id = String(old).padStart(4, "0");
    if (!decisionIds.has(id))
      problems.push(
        `supersedes unknown decision ${id}: docs/skein/${skeinRel(file)}`,
      );
  }
}

// The generated index must cover every live document; docs-index.mjs --check
// separately catches a stale file.
const indexText = existsSync(join(skein, "INDEX.md"))
  ? readFileSync(join(skein, "INDEX.md"), "utf8")
  : "";
if (!indexText) problems.push("missing generated INDEX.md");
for (const file of live) {
  const path = skeinRel(file);
  if (!indexText.includes(path)) problems.push(`not in INDEX.md: ${path}`);
}

function lines(file) {
  return readFileSync(file, "utf8").split("\n").length;
}

if (lines(join(skein, "README.md")) > 100)
  problems.push("README.md is over 100 lines: route, don't catalogue");
if (lines(join(skein, "STATUS.md")) > 150)
  problems.push("STATUS.md is over 150 lines: keep only what is current");
for (const file of live) {
  if (metas.get(file)?.type !== "decision") continue;
  if (lines(file) > 120)
    problems.push(
      `decision is over 120 lines: docs/skein/${skeinRel(file)}`,
    );
}
for (const file of live) {
  if (metas.get(file)?.type !== "spec") continue;
  if (lines(file) > 600)
    warnings.push(
      `spec is over 600 lines: docs/skein/${skeinRel(file)} — split or delete history`,
    );
}

for (const warning of warnings) console.warn(`warning: ${warning}`);

if (problems.length) {
  console.error(`Skein docs check failed:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(
  `${live.length} live Skein docs, ${decisionIds.size} decisions; metadata, headings, index and links hold`,
);

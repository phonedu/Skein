#!/usr/bin/env node
// Creates a new decision, spec or research note from the shared templates,
// fills the front matter, assigns the next decision id, and refreshes the index.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const skein = join(root, "docs/skein");
const args = process.argv.slice(2);
const kind = args[0];
const flags = {};
const titleParts = [];
for (let i = 1; i < args.length; i++) {
  if (!args[i].startsWith("--")) {
    titleParts.push(args[i]);
    continue;
  }
  const key = args[i].slice(2);
  const value = args[i + 1];
  if (value !== undefined && !value.startsWith("--")) {
    flags[key] = value;
    i++;
  } else {
    flags[key] = true;
  }
}
const title = titleParts.join(" ").trim();
if (!["decision", "spec", "research"].includes(kind) || !title) {
  console.error(`Usage:
  npm run docs:new -- decision "标题" [--spec Textus-改造方案.md] [--legacy "§4.10"] [--supersedes 12,13]
  npm run docs:new -- spec "标题" [--summary "..."]
  npm run docs:new -- research "标题" [--summary "..."]`);
  process.exit(1);
}

const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
  .toISOString()
  .slice(0, 10);
const slug = title
  .replace(/[\\/:*?"<>|]/g, "-")
  .replace(/\s+/g, "-")
  .replace(/—/g, "-");
const folder =
  kind === "decision" ? "decisions" : kind === "spec" ? "specs" : "research";

function nextId() {
  const ids = readdirSync(join(skein, "decisions"))
    .map((name) => /^(\d{4})-/.exec(name)?.[1])
    .filter(Boolean)
    .map(Number);
  return String(Math.max(0, ...ids) + 1).padStart(4, "0");
}

function write(rel, text) {
  const path = join(skein, rel);
  if (existsSync(path)) {
    console.error(`Refusing to overwrite ${rel}`);
    process.exit(1);
  }
  writeFileSync(path, text);
  console.log(`Created docs/skein/${rel}`);
  execFileSync(process.execPath, ["scripts/docs-index.mjs"], {
    cwd: root,
    stdio: "inherit",
  });
}

const summary = flags.summary ?? title;
if (kind === "decision") {
  const id = nextId();
  const supersedes = flags.supersedes
    ? String(flags.supersedes)
        .split(",")
        .map((value) => Number(value.trim()))
        .filter(Boolean)
    : [];
  write(
    `decisions/${id}-${slug}.md`,
    `---
type: decision
id: ${Number(id)}
date: ${today}
status: accepted
summary: ${summary}
spec: ${flags.spec ?? "Textus-改造方案.md"}
legacy: ${flags.legacy ? JSON.stringify(flags.legacy) : '""'}
supersedes: [${supersedes.join(", ")}]
---

# 裁决 ${Number(id)} — ${title}

## 决定

（写决定）

## 理由

## 影响

## 来源
`,
  );
} else if (kind === "spec") {
  write(
    `${folder}/${slug}.md`,
    `---
type: spec
status: draft
summary: ${summary}
updated: ${today}
---

# ${title}

## 范围

- 做：
- 不做：

## 结论

## 设计 / 实施

## 验收
`,
  );
} else {
  write(
    `${folder}/${slug}.md`,
    `---
type: research
status: reference
summary: ${summary}
updated: ${today}
---

# ${title}

## 问题

## 证据

## 结论

## 适用边界
`,
  );
}

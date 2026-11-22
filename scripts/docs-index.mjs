#!/usr/bin/env node
// Builds the two generated indexes the Skein docs are read through:
// docs/skein/INDEX.md (every live document, by type and status) and
// docs/skein/decisions/README.md (the ruling register). Run with
// `npm run docs:index`; `--check` fails when the checked-in copies are stale,
// the same way plugin-reference.mjs guards its generated page.
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const skein = join(root, "docs/skein");
const indexPath = join(skein, "INDEX.md");
const decisionsDir = join(skein, "decisions");
const decisionsIndexPath = join(decisionsDir, "README.md");
const skippedDirs = new Set(["archive", "_templates"]);
const skippedDocs = new Set(["README.md", "INDEX.md", "decisions/README.md"]);
const statuses = new Set([
  "draft",
  "active",
  "frozen",
  "deferred",
  "reference",
  "accepted",
  "superseded",
]);
const types = new Set(["spec", "decision", "research", "discipline", "status"]);

function markdownFiles(dir) {
  const files = [];
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (!skippedDirs.has(name)) files.push(...markdownFiles(path));
    } else if (name.endsWith(".md")) {
      files.push(path);
    }
  }
  return files;
}

function frontMatter(text) {
  if (!text.startsWith("---\n")) return null;
  const end = text.indexOf("\n---\n", 4);
  if (end === -1) return null;
  return parse(text.slice(4, end));
}

function titleOf(text) {
  const heading = /^# (.+)$/m.exec(text);
  return heading?.[1].trim() ?? "";
}

function readDocs() {
  const docs = [];
  for (const file of markdownFiles(skein)) {
    const rel = relative(skein, file).split(sep).join("/");
    if (skippedDocs.has(rel)) continue;
    const text = readFileSync(file, "utf8");
    const meta = frontMatter(text);
    if (!meta) throw new Error(`${rel}: missing front matter`);
    const title = titleOf(text);
    if (!title) throw new Error(`${rel}: missing a level-one heading`);
    if (!types.has(meta.type))
      throw new Error(`${rel}: unknown type "${meta.type}"`);
    if (!statuses.has(meta.status))
      throw new Error(`${rel}: unknown status "${meta.status}"`);
    if (!meta.summary) throw new Error(`${rel}: missing summary`);
    if (!meta.updated && meta.type !== "decision")
      throw new Error(`${rel}: missing updated`);
    docs.push({ file, rel, text, meta, title });
  }
  return docs;
}

function validateDecisions(decisions) {
  const ids = new Set();
  for (const doc of decisions) {
    const { meta, rel } = doc;
    if (!Number.isInteger(meta.id))
      throw new Error(`${rel}: decision id must be an integer`);
    const id = String(meta.id).padStart(4, "0");
    if (ids.has(id)) throw new Error(`${rel}: duplicate decision id ${id}`);
    ids.add(id);
    if (!rel.startsWith(`decisions/${id}-`))
      throw new Error(`${rel}: filename must start with ${id}-`);
    if (!doc.title.startsWith(`裁决 ${meta.id} —`))
      throw new Error(`${rel}: heading must start "裁决 ${meta.id} —"`);
    if (!meta.date) throw new Error(`${rel}: missing date`);
    if (!meta.spec) throw new Error(`${rel}: missing spec`);
    if (meta.supersedes === undefined) meta.supersedes = [];
    if (!Array.isArray(meta.supersedes))
      throw new Error(`${rel}: supersedes must be a list`);
  }
  return ids;
}

function decisionStatus(decision, decisions) {
  const id = String(decision.meta.id).padStart(4, "0");
  const replacement = decisions.find((other) =>
    (other.meta.supersedes ?? []).some(
      (old) => String(old).padStart(4, "0") === id,
    ),
  );
  if (replacement)
    return `被 ${String(replacement.meta.id).padStart(4, "0")} 取代`;
  return decision.meta.status === "superseded" ? "已取代" : "有效";
}

function specCell(spec) {
  if (spec === "README.md") return "[README](../README.md)";
  const path = join(skein, "specs", spec);
  const label = spec.replace(/\.md$/, "");
  return existsSync(path) ? `[${label}](../specs/${spec})` : label;
}

function table(items, header, row) {
  return [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...items.map(row),
  ].join("\n");
}

function byRel(a, b) {
  return a.rel.localeCompare(b.rel, "en");
}

function buildIndex(docs, decisions) {
  const specs = docs.filter((doc) => doc.meta.type === "spec").sort(byRel);
  const discipline = docs
    .filter((doc) => doc.meta.type === "discipline")
    .sort(byRel);
  const research = docs
    .filter((doc) => doc.meta.type === "research")
    .sort(byRel);
  const status = docs.find((doc) => doc.meta.type === "status");
  const groups = [
    ["在办规格", specs.filter((doc) => doc.meta.status === "active")],
    [
      "提案 / 暂缓",
      specs.filter((doc) => ["draft", "deferred"].includes(doc.meta.status)),
    ],
    ["冻结规格", specs.filter((doc) => doc.meta.status === "frozen")],
  ];
  const lines = [
    "# Skein 文档索引",
    "",
    "> 自动生成，勿手改。运行 `npm run docs:index` 重新生成；`npm run check:skein` 会在过期时失败。",
    "",
    "## 现在",
    "",
    status
      ? `- [${status.title}](STATUS.md) — ${status.meta.summary}`
      : "- 缺 `STATUS.md`",
    "",
  ];
  for (const [heading, items] of groups) {
    if (!items.length) continue;
    lines.push(`## ${heading}`, "");
    lines.push(
      table(
        items,
        ["文档", "状态", "更新", "说明"],
        (doc) =>
          `| [${doc.title}](${doc.rel}) | ${doc.meta.status} | ${doc.meta.updated} | ${doc.meta.summary} |`,
      ),
    );
    lines.push("");
  }
  lines.push("## 裁决", "");
  lines.push(
    `- [裁决索引](decisions/README.md) — ${decisions.length} 条，按 ID 查；新裁决写 \`decisions/NNNN-*.md\`。`,
    "",
  );
  lines.push("## 纪律", "");
  lines.push(
    table(
      discipline,
      ["文档", "状态", "更新", "说明"],
      (doc) =>
        `| [${doc.title}](${doc.rel}) | ${doc.meta.status} | ${doc.meta.updated} | ${doc.meta.summary} |`,
    ),
    "",
  );
  lines.push("## 调研", "");
  lines.push(
    table(
      research,
      ["文档", "状态", "更新", "说明"],
      (doc) =>
        `| [${doc.title}](${doc.rel}) | ${doc.meta.status} | ${doc.meta.updated} | ${doc.meta.summary} |`,
    ),
    "",
  );
  lines.push("## 归档", "");
  lines.push(
    "- [archive/README.md](archive/README.md) — 已关闭的件，冻结，不再维护。",
    "",
  );
  return lines.join("\n");
}

function buildDecisions(decisions) {
  const sorted = [...decisions].sort((a, b) => a.meta.id - b.meta.id);
  const lines = [
    "# 裁决索引",
    "",
    "> 自动生成，勿手改。新裁决写 `decisions/NNNN-<标题>.md`；文件一旦写入不改，推翻旧裁决时在 `supersedes` 里写旧 ID。",
    "",
    `共 ${sorted.length} 条。`,
    "",
  ];
  lines.push(
    table(
      sorted,
      ["ID", "日期", "裁决", "状态", "取代", "旧引用", "规格"],
      (doc) => {
        const id = String(doc.meta.id).padStart(4, "0");
        const supersedes = (doc.meta.supersedes ?? [])
          .map((old) => String(old).padStart(4, "0"))
          .join("、");
        return `| ${id} | ${doc.meta.date} | [${doc.title}](${doc.rel.replace(/^decisions\//, "")}) | ${decisionStatus(doc, sorted)} | ${supersedes || "—"} | ${doc.meta.legacy || "—"} | ${specCell(doc.meta.spec)} |`;
      },
    ),
  );
  lines.push("");
  return lines.join("\n");
}

function versionParts(version) {
  return String(version)
    .replace(/^v/, "")
    .split("-")[0]
    .split(".")
    .map((part) => Number(part) || 0);
}

function compareVersions(a, b) {
  const left = versionParts(a);
  const right = versionParts(b);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff) return diff;
  }
  return 0;
}

function warnings(docs) {
  const version = JSON.parse(
    readFileSync(join(root, "package.json"), "utf8"),
  ).version;
  return docs
    .filter((doc) => doc.meta.verified)
    .filter((doc) => compareVersions(doc.meta.verified, version) < 0)
    .map(
      (doc) =>
        `${doc.rel}: verified at ${doc.meta.verified}, package is v${version}; refresh it or move it to archive`,
    );
}

const docs = readDocs();
const decisions = docs.filter((doc) => doc.meta.type === "decision");
validateDecisions(decisions);
const index = buildIndex(docs, decisions);
const decisionIndex = buildDecisions(decisions);

for (const warning of warnings(docs)) console.warn(`warning: ${warning}`);

if (process.argv.includes("--check")) {
  const stale = [];
  for (const [path, expected] of [
    [indexPath, index],
    [decisionsIndexPath, decisionIndex],
  ]) {
    if (!existsSync(path) || readFileSync(path, "utf8") !== expected)
      stale.push(relative(root, path).split(sep).join("/"));
  }
  if (stale.length) {
    console.error(
      `Generated doc index is stale:\n  ${stale.join("\n  ")}\nRun \`npm run docs:index\`.`,
    );
    process.exit(1);
  }
  console.log(
    `Skein index is current (${docs.length} live docs, ${decisions.length} decisions)`,
  );
} else {
  writeFileSync(indexPath, index);
  writeFileSync(decisionsIndexPath, decisionIndex);
  console.log(
    `Wrote docs/skein/INDEX.md and docs/skein/decisions/README.md (${docs.length} live docs, ${decisions.length} decisions)`,
  );
}

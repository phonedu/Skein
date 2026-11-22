#!/usr/bin/env node
// Prints a small, task-shaped context pack for an AI session. The task comes
// from status.yaml; the pack pulls the linked spec section, full decisions,
// and summaries of the other references, bounded by --max-chars.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const skein = join(root, "docs/skein");
const data = parse(readFileSync(join(skein, "status.yaml"), "utf8"));
const args = process.argv.slice(2);
const taskId = args.find((arg) => !arg.startsWith("--"));
const maxIndex = args.indexOf("--max-chars");
const maxChars = maxIndex === -1 ? 24000 : Number(args[maxIndex + 1]) || 24000;
const chunks = [];
let used = 0;

function add(text) {
  if (used + text.length > maxChars) {
    chunks.push(
      `\n[context truncated at ${maxChars} chars; read the linked files for the rest]`,
    );
    used = maxChars;
    return false;
  }
  chunks.push(text);
  used += text.length;
  return true;
}

function read(path) {
  return readFileSync(join(skein, path), "utf8");
}

function frontMatter(text) {
  if (!text.startsWith("---\n")) return {};
  const end = text.indexOf("\n---\n", 4);
  return end === -1 ? {} : (parse(text.slice(4, end)) ?? {});
}

function title(text) {
  return /^# (.+)$/m.exec(text)?.[1].trim() ?? "";
}

function body(text) {
  return text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
}

function slug(heading) {
  return heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

function section(path, anchor) {
  const text = read(path);
  if (!anchor) return text;
  const lines = text.split("\n");
  const heads = [];
  for (let i = 0; i < lines.length; i++) {
    const match = /^(#{1,6})\s+(.*)$/.exec(lines[i]);
    if (match) heads.push({ level: match[1].length, text: match[2], line: i });
  }
  const index = heads.findIndex((head) => slug(head.text) === anchor);
  if (index === -1)
    return `[section #${anchor} not found in ${path}; read the file]`;
  const level = heads[index].level;
  const end =
    heads.slice(index + 1).find((head) => head.level <= level)?.line ??
    lines.length;
  return lines.slice(heads[index].line, end).join("\n").trim();
}

function clipped(text, limit) {
  return text.length > limit ? `${text.slice(0, limit)}\n[clipped]` : text;
}

function includeReference(path, options = {}) {
  const text = read(path);
  const meta = frontMatter(text);
  const head = `### ${title(text)} (${path})\n`;
  if (options.full) {
    add(`${head}\n${clipped(body(text), 5000)}\n`);
    return;
  }
  add(
    `${head}\n- 状态：${meta.status ?? "—"}\n- 一句话：${meta.summary ?? "—"}\n- 路径：${path}\n`,
  );
}

function includeSpec(spec) {
  const [path, anchor] = spec.split("#");
  const content = section(path, anchor);
  add(
    `### ${path}${anchor ? `#${anchor}` : ""}\n\n${clipped(content, 7000)}\n`,
  );
}

if (taskId) {
  const task = data.tasks?.find((item) => item.id === taskId);
  if (!task) {
    console.error(`No task ${taskId} in docs/skein/status.yaml`);
    process.exit(1);
  }
  add(`# AI context — ${task.id}\n\n`);
  add(
    `- 任务：${task.title}\n- 工作线：${task.workstream}\n- 状态：${task.state}\n- 验收：${task.acceptance ?? "—"}\n- 估算：${task.estimate ?? "—"}\n\n`,
  );
  add("## 任务六行\n\n");
  for (const field of [
    "problem",
    "expected",
    "standard",
    "not",
    "scope",
    "evidence",
  ])
    add(`- **${field}**：${task.brief?.[field] ?? "（未填）"}\n`);
  add(`\n## 规格\n\n`);
  includeSpec(task.spec);
  const extra = task.context ?? [];
  if (extra.length) {
    add(`\n## 相关裁决 / 上下文\n\n`);
    for (const path of extra) {
      const isDecision = path.startsWith("decisions/");
      includeReference(path, { full: isDecision });
    }
  }
  add(
    `\n## 工程规矩\n\n- 开工前写任务六行；收尾写完成四行。\n- 门禁：\`npm run check:quick\`；\`npm run docs:check\`。\n- 只改当次范围；扩范围先问。\n- 规则全文：\`docs/skein/discipline/AI协作纪律.md\`。\n`,
  );
  add(
    `\n## 下一步\n\n\`npm run docs:task -- start ${task.id}\` 开始；完成后 \`npm run docs:task -- done ${task.id} --evidence "..."\`。\n`,
  );
} else {
  add(`# AI context — ${data.baseline}\n\n`);
  add(`> 全局包。指定任务用 \`npm run docs:context -- <id>\`。\n\n`);
  add(`## 现在\n\n`);
  for (const task of data.tasks.filter((item) => item.state === "doing"))
    add(`- **${task.id}** ${task.title}：${task.acceptance ?? "—"}\n`);
  add(`\n## 在办规格\n\n`);
  for (const line of data.workstreams)
    add(`- ${line.name}：${line.focus}（${line.spec}）\n`);
  add(`\n## 最近裁决\n\n`);
  const decisions = readFileSync(join(skein, "decisions/README.md"), "utf8");
  const rows = decisions
    .split("\n")
    .filter((line) => /^\| \d{4} /.test(line))
    .slice(-10);
  add(rows.join("\n") + "\n");
  add(
    `\n## 入口\n\n- 文档：docs/skein/README.md\n- 索引：docs/skein/INDEX.md\n- 状态：docs/skein/STATUS.md\n- 裁决：docs/skein/decisions/README.md\n`,
  );
  add(
    `\n## 工程规矩\n\n\`docs/skein/discipline/AI协作纪律.md\`；门禁 \`npm run check:quick\` / \`npm run docs:check\`。\n`,
  );
}

console.log(chunks.join(""));

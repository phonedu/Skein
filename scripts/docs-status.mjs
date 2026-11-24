#!/usr/bin/env node
// Builds docs/skein/STATUS.md from docs/skein/status.yaml. The YAML is the
// single source for what is in flight; the page is generated so tables, links
// and section order cannot drift. `--check` fails when the page is stale.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const skein = join(root, "docs/skein");
const sourcePath = join(skein, "status.yaml");
const pagePath = join(skein, "STATUS.md");
const briefFields = [
  "problem",
  "expected",
  "standard",
  "not",
  "scope",
  "evidence",
];

const data = parse(readFileSync(sourcePath, "utf8"));
const problems = [];
for (const key of [
  "baseline",
  "commit",
  "branch",
  "updated",
  "workstreams",
  "tasks",
]) {
  if (!data[key]) problems.push(`status.yaml: missing ${key}`);
}
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}

const link = (label, path) => `[${label}](${path})`;
const cell = (value) => String(value ?? "").replace(/\|/g, "\\|");

function briefMissing(task) {
  const brief = task.brief ?? {};
  return briefFields.filter((field) => !String(brief[field] ?? "").trim());
}

function workstreams() {
  return [
    "| 线 | 状态 | 当前焦点 | 出处 |",
    "| --- | --- | --- | --- |",
    ...data.workstreams.map(
      (line) =>
        `| ${cell(line.name)} | ${line.state === "doing" ? "◐" : "☐"} | ${cell(line.focus)} | ${link("规格", line.spec)} |`,
    ),
  ].join("\n");
}

function nowTasks() {
  const tasks = data.tasks.filter((task) => task.state === "doing");
  if (!tasks.length) return "暂无。";
  return tasks
    .map((task, index) => {
      const missing = briefMissing(task);
      const warning = missing.length
        ? `\n   > ⚠ 任务六行缺 ${missing.join(" / ")}；开工前跑 \`npm run docs:task -- brief ${task.id} ...\`。`
        : "";
      return `${index + 1}. **${task.id}** — ${task.title}。验收：${task.acceptance}规格：${link("规格", task.spec)}${
        task.estimate ? `；估算 ${task.estimate}` : ""
      }。${warning}`;
    })
    .join("\n");
}

function taskTable(tasks) {
  if (!tasks.length) return "暂无。";
  return [
    "| # | 任务 | 状态 | 验收 / 说明 | 出处 | 估算 |",
    "| --- | --- | --- | --- | --- | --- |",
    ...tasks.map(
      (task) =>
        `| **${cell(task.id)}** | ${cell(task.title)} | ${task.state === "todo" ? "☐" : "◐"} | ${cell(task.acceptance)} | ${link("规格", task.spec)} | ${cell(task.estimate ?? "—")} |`,
    ),
  ].join("\n");
}

function laterTable() {
  if (!data.later?.length) return "暂无。";
  return [
    "| # | 任务 | 说明 | 出处 | 估算 |",
    "| --- | --- | --- | --- | --- |",
    ...data.later.map(
      (task) =>
        `| ${cell(task.id)} | ${cell(task.title)} | ${cell(task.note)} | ${link("规格", task.spec)} | ${cell(task.estimate ?? "—")} |`,
    ),
  ].join("\n");
}

function waiting() {
  if (!data.waiting?.length) return "暂无。";
  return data.waiting.map((item) => `- ${item}`).join("\n");
}

function questions() {
  if (!data.questions?.length) return "暂无。";
  return [
    "| # | 事项 | 进度时点 | 默认 / 建议 | 触发 / 状态 | 出处 |",
    "| --- | --- | --- | --- | --- | --- |",
    ...data.questions.map(
      (item) =>
        `| ${cell(item.id)} | ${cell(item.text)} | ${cell(item.when ?? "—")} | ${cell(item.default)} | ${cell(item.trigger)} | ${link("出处", item.spec)} |`,
    ),
  ].join("\n");
}

const page = `---
type: status
status: active
summary: 当前工作线、Now/Next、阻塞与触发点
updated: ${data.updated}
---

# 状态

> **自动生成，勿手改。** 源：[status.yaml](status.yaml)；生成：\`npm run docs:status\`。
> 只写未完成 / 进行中；完成项由 \`npm run docs:task -- done <id> --evidence "..."\` 删除并归档。
> 基线：上游稳定 tag **${data.baseline}**（合并 \`${data.commit}\`）· 分支 \`${data.branch}\`。

## 1. 工作线

${workstreams()}

## 2. Now（按顺序）

${nowTasks()}

## 3. Next

${taskTable(data.tasks.filter((task) => task.state !== "doing"))}

## 4. Later（3–6 个月，按人周估算）

${laterTable()}

## 5. Waiting / Blocked

${waiting()}

## 6. 待审 / 触发点

${questions()}
`;

const stale = !existsSync(pagePath) || readFileSync(pagePath, "utf8") !== page;
if (process.argv.includes("--check")) {
  if (stale) {
    console.error(
      "docs/skein/STATUS.md is stale: run `npm run docs:status` and commit it.",
    );
    process.exit(1);
  }
  console.log(`STATUS.md is current (${data.tasks.length} tasks)`);
} else {
  writeFileSync(pagePath, page);
  console.log(`Wrote docs/skein/STATUS.md (${data.tasks.length} tasks)`);
}

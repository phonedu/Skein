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
const inboxPath = join(skein, "inbox.yaml");
const inbox = existsSync(inboxPath)
  ? (parse(readFileSync(inboxPath, "utf8"))?.items ?? [])
  : [];
const openInbox = inbox.filter((item) => item.status === "new");
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
  const name = (path) =>
    path.split("#")[0].split("/").pop().replace(/\.md$/, "");
  return [
    "| 线 | 状态 | 当前焦点 | 出处 |",
    "| --- | --- | --- | --- |",
    ...data.workstreams.map((line) => {
      const specs = [
        link("规格", line.spec),
        ...(line.also ?? []).map((extra) => link(name(extra), extra)),
      ].join(" · ");
      return `| ${cell(line.name)} | ${line.state === "doing" ? "◐" : "☐"} | ${cell(line.focus)} | ${specs} |`;
    }),
  ].join("\n");
}

function taskList() {
  const doing = data.tasks.filter((task) => task.state === "doing");
  const todo = data.tasks.filter((task) => task.state !== "doing");
  const later = data.later ?? [];
  const rows = [
    ...doing.map((task) => ({ ...task, listState: "doing" })),
    ...todo.map((task) => ({ ...task, listState: "todo" })),
    ...later.map((task) => ({ ...task, listState: "later" })),
  ];
  if (!rows.length) return "暂无。";
  const mark = { doing: "◐ 进行中", todo: "☐ 待做", later: "◌ 以后" };
  return [
    "> 顺序：进行中 → 待做 → 以后；同组按 `status.yaml` 的顺序。要改顺序就改 `status.yaml`，start/done 不会自动重排。",
    "",
    "| # | 状态 | 任务 | 验收 / 说明 | 规格 | 估算 |",
    "| --- | --- | --- | --- | --- | --- |",
    ...rows.map((task, index) => {
      const missing = task.listState === "doing" ? briefMissing(task) : [];
      const warning = missing.length ? ` ⚠ 缺六行：${missing.join(" / ")}` : "";
      const text =
        task.listState === "later"
          ? (task.note ?? "—")
          : `${task.acceptance ?? "—"}${warning}`;
      return `| ${index + 1} | ${mark[task.listState]} | **${cell(task.id)}** — ${cell(task.title)} | ${cell(text)} | ${link("规格", task.spec)} | ${cell(task.estimate ?? "—")} |`;
    }),
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

function commitments() {
  const doing = data.tasks
    .filter((task) => task.state === "doing")
    .map((task) => `${task.id} ${task.title}`);
  const next = data.tasks
    .filter((task) => task.state !== "doing")
    .slice(0, 6)
    .map((task) => `${task.id} ${task.title}`);
  const later = (data.later ?? [])
    .slice(0, 6)
    .map((task) => `${task.id} ${task.title}`);
  const open = openInbox.length
    ? `${openInbox.length} 条（\`npm run docs:audit\` → 分诊）`
    : "无";
  const ask = data.questions?.length
    ? `${data.questions.length} 条（前 3：${data.questions
        .slice(0, 3)
        .map((item) => item.id)
        .join("、")}）`
    : "无";
  return [
    `- **现在**：${doing.length ? doing.join("；") : "无进行中的任务"}`,
    `- **下一批**：${next.length ? next.join("；") : "无"}`,
    `- **以后**：${later.length ? later.join("；") : "无"}`,
    `- **待你裁**：${ask}`,
    `- **未分诊**：${open}`,
  ].join("\n");
}

function inboxSection() {
  if (!openInbox.length) return "";
  return `## 5. Inbox（未分诊）

| ID | 日期 | 内容 | 来源 |
| --- | --- | --- | --- |
${openInbox
  .map(
    (item) =>
      `| ${cell(item.id)} | ${cell(item.date)} | ${cell(item.text)} | ${cell(item.source ?? "—")} |`,
  )
  .join("\n")}
`;
}

const page = `---
type: status
status: active
summary: 当前任务清单、工作线、阻塞与触发点
updated: ${data.updated}
---

# 状态

> **自动生成，勿手改。** 源：[status.yaml](status.yaml)；生成：\`npm run docs:status\`。
> 只写未完成 / 进行中；完成项由 \`npm run docs:task -- done <id> --evidence "..."\` 删除并归档。
> 基线：上游稳定 tag **${data.baseline}**（合并 \`${data.commit}\`）· 分支 \`${data.branch}\`。

## 0. 承诺一览

${commitments()}

## 1. 任务清单（按顺序）

${taskList()}

## 2. 工作线

${workstreams()}

## 3. Waiting / Blocked

${waiting()}

## 4. 待审 / 触发点

${questions()}

${inboxSection()}
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

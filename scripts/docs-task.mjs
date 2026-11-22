#!/usr/bin/env node
// The task workflow behind STATUS.md. status.yaml is the source; this command
// fills the task six lines, starts a task, and closes one into archive/ so the
// page never has to be edited by hand.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, stringify } from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const skein = join(root, "docs/skein");
const sourcePath = join(skein, "status.yaml");
const archiveDir = join(skein, "archive");
const briefFields = [
  "problem",
  "expected",
  "standard",
  "not",
  "scope",
  "evidence",
];
const header =
  "# The source of STATUS.md. Run `npm run docs:status` after editing; the\n" +
  "# generated page and this file are checked for drift by `npm run docs:check`.\n";

function load() {
  return parse(readFileSync(sourcePath, "utf8"));
}

function save(data) {
  data.updated = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
  writeFileSync(sourcePath, header + stringify(data, { lineWidth: 0 }));
  run("scripts/docs-status.mjs");
  run("scripts/docs-index.mjs");
}

function run(script) {
  execFileSync(process.execPath, [script], { cwd: root, stdio: "inherit" });
}

function taskOf(data, id) {
  const task = data.tasks?.find((item) => item.id === id);
  if (!task) {
    console.error(`No task ${id} in docs/skein/status.yaml`);
    process.exit(1);
  }
  return task;
}

function missingBrief(task) {
  const brief = task.brief ?? {};
  return briefFields.filter((field) => !String(brief[field] ?? "").trim());
}

function usage() {
  console.error(`Usage:
  npm run docs:task -- brief <id> [--problem ...] [--expected ...] [--standard ...]
                                 [--not ...] [--scope ...] [--evidence ...]
  npm run docs:task -- start <id>
  npm run docs:task -- done <id> --evidence "..."
  npm run docs:task -- add --id <id> --title "..." --workstream <id> --spec <path>
                            [--now] [--acceptance "..."] [--estimate "..."]
                            [--problem ...] [--expected ...] [--standard ...]
                            [--not ...] [--scope ...] [--evidence ...]`);
  process.exit(1);
}

function flags(args) {
  const found = {};
  for (let i = 0; i < args.length; i++) {
    const name = args[i];
    if (!name.startsWith("--")) continue;
    const key = name.slice(2);
    const value = args[i + 1];
    if (value === undefined || value.startsWith("--")) {
      found[key] = true;
    } else {
      found[key] = value;
      i++;
    }
  }
  return found;
}

const argv = process.argv.slice(2);
const command = argv[0];
const id = command === "add" ? undefined : argv[1];
if (!command) usage();
const data = load();
const options = flags(command === "add" ? argv.slice(1) : argv.slice(2));

if (command === "brief") {
  if (!id) usage();
  const task = taskOf(data, id);
  task.brief ??= {};
  for (const field of briefFields)
    if (typeof options[field] === "string") task.brief[field] = options[field];
  if (!Object.keys(options).length) {
    for (const field of briefFields)
      console.log(`${field}: ${task.brief[field] ?? "（未填）"}`);
    process.exit(0);
  }
  const missing = missingBrief(task);
  save(data);
  console.log(
    missing.length
      ? `brief saved; still missing: ${missing.join(", ")}`
      : "brief complete; `npm run docs:task -- start " + id + "` is ready.",
  );
} else if (command === "start") {
  if (!id) usage();
  const task = taskOf(data, id);
  const missing = missingBrief(task);
  if (missing.length) {
    console.error(
      `Task ${id} cannot start: task six lines missing ${missing.join(", ")}.\n` +
        `Run: npm run docs:task -- brief ${id} --problem ... --expected ... --standard ... --not ... --scope ... --evidence ...`,
    );
    process.exit(1);
  }
  task.state = "doing";
  save(data);
  console.log(
    `Started ${id}. Read the context with:\n  npm run docs:context -- ${id}`,
  );
} else if (command === "done") {
  if (!id) usage();
  const task = taskOf(data, id);
  const evidence = options.evidence;
  if (typeof evidence !== "string" || !evidence.trim()) {
    console.error(
      `Refusing to close ${id}: pass --evidence "command / output / commit".`,
    );
    process.exit(1);
  }
  const date = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
  const archive = join(archiveDir, `${date}-${id}.md`);
  if (existsSync(archive)) {
    console.error(`Archive already exists: ${archive}`);
    process.exit(1);
  }
  const brief = task.brief ?? {};
  const lines = [
    `# ${id} — ${task.title}（${date} 完成）`,
    "",
    `> 工作线：${task.workstream} · 验收：${task.acceptance ?? "—"}`,
    "",
    "## 任务六行",
    "",
    ...briefFields.map(
      (field) => `- **${field}**：${brief[field] ?? "（未填）"}`,
    ),
    "",
    "## 证据",
    "",
    evidence,
    "",
  ];
  writeFileSync(archive, lines.join("\n"));
  data.tasks = data.tasks.filter((item) => item.id !== id);
  save(data);
  console.log(
    `Closed ${id}.\n  archive: ${archive}\n  STATUS and INDEX regenerated.`,
  );
} else if (command === "add") {
  const newId = options.id;
  const title = options.title;
  const workstream = options.workstream;
  const spec = options.spec;
  if (!newId || !title || !workstream || !spec) usage();
  if (data.tasks.some((item) => item.id === newId)) {
    console.error(`Task ${newId} already exists.`);
    process.exit(1);
  }
  const brief = {};
  for (const field of briefFields)
    if (typeof options[field] === "string") brief[field] = options[field];
  const task = {
    id: newId,
    title,
    workstream,
    state: options.now ? "doing" : "todo",
    acceptance: options.acceptance ?? "（未填）",
    spec,
    estimate: options.estimate ?? "—",
    ...(Object.keys(brief).length ? { brief } : {}),
  };
  data.tasks.push(task);
  save(data);
  console.log(
    `Added ${newId}. Fill the brief before starting:\n  npm run docs:task -- brief ${newId} ...`,
  );
} else {
  usage();
}

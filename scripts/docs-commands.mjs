#!/usr/bin/env node
// Renders docs/skein/COMMANDS.md from commands.yaml and package.json. The
// check fails on a command that is not a real npm script, so the page cannot
// promise a command that does not exist.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "docs/skein/commands.yaml");
const page = join(root, "docs/skein/COMMANDS.md");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const commands = parse(readFileSync(source, "utf8"));
const problems = [];
const seen = new Set();
for (const command of commands) {
  if (!command.name || !command.category || !command.description)
    problems.push(
      `commands.yaml: an entry is missing name/category/description`,
    );
  if (seen.has(command.name))
    problems.push(`commands.yaml: duplicate ${command.name}`);
  seen.add(command.name);
  if (!(command.name in pkg.scripts))
    problems.push(`commands.yaml: ${command.name} is not an npm script`);
}
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}

const categories = [];
for (const command of commands)
  if (!categories.includes(command.category)) categories.push(command.category);
const lines = [
  "# 命令速查",
  "",
  "> 自动生成，勿手改。源：[`commands.yaml`](commands.yaml) + `package.json`；生成：`npm run docs:commands`。",
  "> 操作步骤见 [`discipline/工程菜谱.md`](discipline/工程菜谱.md)；上游规则见 [`discipline/publishing-gate.md`](discipline/publishing-gate.md)。",
  "",
];
for (const category of categories) {
  lines.push(`## ${category}`, "");
  lines.push("| 命令 | 说明 |", "| --- | --- |");
  for (const command of commands.filter((item) => item.category === category))
    lines.push(`| \`npm run ${command.name}\` | ${command.description} |`);
  lines.push("");
}
const text = lines.join("\n");
if (process.argv.includes("--check")) {
  if (!existsSync(page) || readFileSync(page, "utf8") !== text) {
    console.error(
      "docs/skein/COMMANDS.md is stale: run `npm run docs:commands` and commit it.",
    );
    process.exit(1);
  }
  console.log(`COMMANDS.md is current (${commands.length} commands)`);
} else {
  writeFileSync(page, text);
  console.log(`Wrote docs/skein/COMMANDS.md (${commands.length} commands)`);
}

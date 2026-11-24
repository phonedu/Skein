#!/usr/bin/env node
// The intake for things said in a session but not yet planned. One line goes
// into docs/skein/inbox.yaml; `--check` fails while anything is still `new`,
// so an AI session cannot end with an untriaged promise.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, stringify } from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const path = join(root, "docs/skein/inbox.yaml");
const header =
  "# Captured commitments: things said in a session that are not yet a task or\n" +
  '# a decision. `npm run docs:capture -- "..."` appends; `npm run docs:wrap`\n' +
  "# refuses to pass while an item is still `new`. Triage moves it into\n" +
  "# status.yaml (task) or decisions/ (ruling), then marks it resolved.\n";
const rest = process.argv.slice(2);

function localDate() {
  return new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}

function load() {
  if (!existsSync(path)) return { items: [] };
  const data = parse(readFileSync(path, "utf8")) ?? {};
  data.items ??= [];
  return data;
}

function save(data) {
  writeFileSync(path, header + stringify(data, { lineWidth: 0 }));
}

function flags(argv) {
  const found = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    const value = argv[i + 1];
    if (value !== undefined && !value.startsWith("--")) {
      found[key] = value;
      i++;
    } else found[key] = true;
  }
  return found;
}

function open(data) {
  return data.items.filter((item) => item.status === "new");
}

function usage() {
  console.error(`Usage:
  npm run docs:capture -- "一句话承诺" [--source "会话 / 任务"] [--kind idea|task|decision]
  npm run docs:capture -- --list
  npm run docs:capture -- --check
  npm run docs:capture -- --resolve <id>
  npm run docs:capture -- --drop <id>`);
  process.exit(1);
}

const options = flags(rest);
const data = load();

if (options.list) {
  if (!data.items.length) console.log("inbox is empty");
  for (const item of data.items)
    console.log(
      `${item.id}  ${item.date}  [${item.status}] ${item.text}${item.source ? `  (${item.source})` : ""}`,
    );
  process.exit(0);
}
if (options.check) {
  const pending = open(data);
  if (pending.length) {
    console.error(
      `inbox has ${pending.length} untriaged item(s):\n${pending
        .map((item) => `  ${item.id}  ${item.text}`)
        .join("\n")}\nTriage with docs:task / docs:new, then --resolve <id>.`,
    );
    process.exit(1);
  }
  console.log("inbox is clear");
  process.exit(0);
}
if (options.resolve || options.drop) {
  const id = options.resolve ?? options.drop;
  const item = data.items.find((entry) => entry.id === id);
  if (!item) {
    console.error(`No inbox item ${id}`);
    process.exit(1);
  }
  item.status = options.resolve ? "resolved" : "dropped";
  item.resolved_at = localDate();
  save(data);
  console.log(`${id} ${item.status}`);
  process.exit(0);
}

const text = rest
  .filter((arg, index) => {
    if (arg.startsWith("--")) return false;
    const before = rest[index - 1];
    return !before || !["--source", "--kind"].includes(before);
  })
  .join(" ")
  .trim();
if (!text) usage();
const date = localDate();
const prefix = `I-${date.replaceAll("-", "")}-`;
let n = data.items.filter((item) => item.id.startsWith(prefix)).length + 1;
let id = `${prefix}${n}`;
while (data.items.some((item) => item.id === id)) id = `${prefix}${++n}`;
data.items.push({
  id,
  date,
  text,
  source: options.source ?? "manual",
  kind: options.kind ?? "idea",
  status: "new",
});
save(data);
console.log(`Captured ${id}: ${text}`);
console.log("Before finishing: triage it, then `npm run docs:wrap`.");

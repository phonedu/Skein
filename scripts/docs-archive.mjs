#!/usr/bin/env node
// Moves a closed spec into archive/ (or a draft into proposals/) and prints
// every file that still names the old path. Link rewriting is left to the
// caller because relative paths differ by depth; check-links proves it.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const skein = join(root, "docs/skein");
const args = process.argv.slice(2);
const propose = args.includes("--propose");
const stub = args.includes("--stub");
const source = args.find((arg) => !arg.startsWith("--"));
if (!source) {
  console.error(`Usage:
  npm run docs:archive -- <specs/file.md> [--stub]
  npm run docs:propose -- <specs/file.md>`);
  process.exit(1);
}
const from = join(skein, source);
if (!existsSync(from)) {
  console.error(`Not found: ${source}`);
  process.exit(1);
}
const date = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
  .toISOString()
  .slice(0, 10);
const folder = propose ? "proposals" : "archive";
const toRel = `${folder}/${date}-${basename(source)}`;
const to = join(skein, toRel);
if (existsSync(to)) {
  console.error(`Already exists: ${toRel}`);
  process.exit(1);
}
const references = execFileSync(
  "git",
  ["grep", "-l", source, "--", "docs/skein"],
  {
    cwd: root,
    encoding: "utf8",
  },
).trim();
execFileSync("git", ["mv", from, to], { cwd: root, stdio: "inherit" });
let text = readFileSync(to, "utf8");
const title = /^# .+$/m.exec(text)?.[0];
if (!title) throw new Error(`No level-one heading in ${source}`);
text = text.replace(
  title,
  `${title}\n\n> ${propose ? "提案" : "归档"}：${date}，原路径 \`${source}\`；${propose ? "草案/暂缓，不参与当前实现。" : "历史记录，不再维护。"}`,
);
writeFileSync(to, text);
if (stub && !propose) {
  writeFileSync(
    from,
    `---\ntype: spec\nstatus: frozen\ntasks: []\nsummary: 已归档，现行规则见界面契约\nupdated: ${date}\n---\n\n# ${basename(source, ".md")}\n\n> 已归档：\`${toRel}\`。现行界面规则见[《界面契约》](界面契约.md)；历史与证据见归档件。\n`,
  );
}
console.log(`Moved ${source} -> ${toRel}`);
if (stub && !propose) console.log(`Redirect stub left at ${source}`);
if (references) {
  console.log(`\nFiles still naming the old path:\n${references}`);
}
console.log("\nUpdate those links, then run `npm run docs`.");

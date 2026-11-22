#!/usr/bin/env node
// Creates a release-note fragment (one file per user-visible change) so the
// section headings are right from the start. The fragment is deliberately
// empty: `npm run release:check` fails until it has real bullets.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "docs/releases/next");
const args = process.argv.slice(2);
const sections = ["New", "Improved", "Fixed", "Platform notes"];
let section = "New";
const words = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--section") {
    section = args[++i];
    continue;
  }
  if (args[i].startsWith("--")) continue;
  words.push(args[i]);
}
const title = words.join(" ").trim();
if (!title || !sections.includes(section)) {
  console.error(
    `Usage: npm run release:new -- "change-slug" [--section New|Improved|Fixed|Platform notes]`,
  );
  process.exit(1);
}
const slug = title
  .toLowerCase()
  .replace(/[\\/:*?"<>|]/g, "-")
  .replace(/\s+/g, "-")
  .replace(/^-+|-+$/g, "");
const file = join(dir, `${slug}.md`);
if (existsSync(file)) {
  console.error(`Refusing to overwrite ${file}`);
  process.exit(1);
}
const template = readFileSync(join(root, "docs/releases/TEMPLATE.md"), "utf8");
if (!template.includes(`### ${section}`)) {
  console.error(`TEMPLATE.md has no section ${section}`);
  process.exit(1);
}
writeFileSync(file, `### ${section}\n`);
console.log(`Created ${file}`);
console.log(
  'Add one or more "- " bullets; `npm run release:check` fails until you do.',
);

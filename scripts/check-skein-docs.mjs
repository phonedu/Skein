#!/usr/bin/env node
// Checks the Skein documentation's own rules: relative links resolve, every
// non-archive document is named by another one, and the interface plan's
// numbered rulings are unique and ascending. Run with `npm run check:skein`.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { brokenLinks } from "./check-links.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const skein = join(root, "docs/skein");
/** Frozen records: their links may point at files deleted since. */
const skipped = new Set(["archive", "04-boards"]);

function markdownFiles(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (!skipped.has(name)) files.push(...markdownFiles(path));
    } else if (name.endsWith(".md")) {
      files.push(path);
    }
  }
  return files;
}

const files = markdownFiles(skein);
const rel = (file) => relative(root, file).split(sep).join("/");
const problems = [];

// A relative link that leads nowhere is a lie in a document an agent reads.
for (const broken of brokenLinks(files.map(rel), root)) {
  problems.push(`broken link: ${broken}`);
}

// A document nobody names is a document nobody finds. READMEs are entry points.
const texts = new Map(files.map((file) => [file, readFileSync(file, "utf8")]));
for (const file of files) {
  if (file.endsWith("README.md")) continue;
  const name = file.split(sep).pop();
  const path = rel(file).replace(/^docs\/skein\//, "");
  const named = [...texts].some(
    ([other, text]) =>
      other !== file && (text.includes(name) || text.includes(path)),
  );
  if (!named) problems.push(`not named by any other doc: ${rel(file)}`);
}

// The interface plan's §4 holds numbered entries; a number that repeats or
// goes backwards makes every later reference ambiguous.
const plan = join(skein, "02-方案/Textus-界面改造方案.md");
const text = readFileSync(plan, "utf8");
const section = text.split(/^## 4\./m)[1]?.split(/^## 5\./m)[0] ?? "";
const numbers = [...section.matchAll(/^\|\s*(\d+)\s*\|/gm)].map((match) =>
  Number(match[1]),
);
const seen = new Set();
let last = 0;
for (const number of numbers) {
  if (seen.has(number)) problems.push(`duplicate ruling number: ${number}`);
  if (number <= last) problems.push(`ruling number not ascending: ${number}`);
  seen.add(number);
  last = number;
}

if (problems.length) {
  console.error(`Skein docs check failed:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(
  `${files.length} Skein markdown files, ${numbers.length} numbered rulings; links, names and numbers hold`,
);

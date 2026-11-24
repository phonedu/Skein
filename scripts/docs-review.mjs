#!/usr/bin/env node
// Builds a read-only packet for an external review AI: the task brief and
// context, the spec/decisions, and the code diff. The external reviewer never
// writes the repo; findings are captured by the managing session.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const taskId = args.find((arg) => !arg.startsWith("--"));
const baseIndex = args.indexOf("--base");
const outIndex = args.indexOf("--out");
const base = baseIndex === -1 ? "HEAD~1" : args[baseIndex + 1];
const out = outIndex === -1 ? undefined : args[outIndex + 1];
if (!taskId) {
  console.error(
    "Usage: npm run docs:review -- <task-id> [--base <ref>] [--out <file>]",
  );
  process.exit(1);
}

const status = parse(
  readFileSync(join(root, "docs/skein/status.yaml"), "utf8"),
);
const task = [...(status.tasks ?? []), ...(status.later ?? [])].find(
  (item) => item.id === taskId,
);
if (!task) {
  console.error(`No task ${taskId} in status.yaml`);
  process.exit(1);
}

function git(argv, options = {}) {
  return execFileSync("git", argv, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  }).trim();
}

const context = execFileSync(
  process.execPath,
  ["scripts/docs-context.mjs", taskId],
  { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
).trim();
const stat = git(["diff", "--stat", `${base}...HEAD`]);
const diff = git([
  "diff",
  `${base}...HEAD`,
  "--",
  ".",
  ":(exclude)docs/skein",
  ":(exclude).claude",
  ":(exclude).githooks",
]);
const clipped =
  diff.length > 40000 ? `${diff.slice(0, 40000)}\n[diff clipped]` : diff;
const packet = `# External review packet — ${taskId}

> Read-only review. Do not edit this repository. Report each finding with
> severity, file:line, why it is wrong, and a repro/test. Merge/release
> decisions stay with the managing session.

## Task context

${context}

## Diff (${base}...HEAD)

\`\`\`text
${stat}
\`\`\`

\`\`\`diff
${clipped}
\`\`\`
`;
if (out) {
  writeFileSync(out, packet);
  console.log(`Wrote ${out}`);
} else {
  console.log(packet);
}

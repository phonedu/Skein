#!/usr/bin/env node
// Every relative link in the repository's documentation leads to a file
// that is there: `[text](../dev/guide.md#part)` and `![](pictures/a.png)`.
// Markdown under src/, e2e/ and src-tauri/ is the app's content (prompts,
// guides, test input), not documentation. Links to the web, mail and
// anchors in the same page are not followed.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The targets of a Markdown text's inline links and pictures, outside code. */
export function linkTargets(markdown) {
  const text = markdown
    .replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, "")
    .replace(/`[^`\n]*`/g, "");
  const targets = [];
  for (const [, target] of text.matchAll(
    /\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g,
  ))
    targets.push(target);
  return targets;
}

/** Whether a target is a file in this repository to look for. */
export function isLocal(target) {
  return !/^([a-z][a-z0-9+.-]*:|#|\/|\{)/i.test(target);
}

/** What the fork drops on purpose (`db35f863`, "fork: drop upstream docs
 *  and assets the fork does not use"). The upstream files that remain
 *  (AGENTS.md, CONTRIBUTING, docs/dev/*) still link to them; editing those
 *  files would grow the rebase's patch face, so the targets are named here
 *  once instead. */
const droppedByFork = (base) => [
  join(base, "docs", "design"),
  join(base, "docs", "archive", "2026-10-ios-plan.zh.md"),
  join(base, "ROADMAP.md"),
  join(base, "ROADMAP.zh.md"),
];

/** The broken relative links in `files` (paths from `base`). */
export function brokenLinks(files, base = root) {
  const broken = [];
  const dropped = droppedByFork(base);
  const isDropped = (path) =>
    dropped.some((gone) => path === gone || path.startsWith(gone + sep));
  for (const file of files) {
    const from = dirname(join(base, file));
    for (const target of linkTargets(readFileSync(join(base, file), "utf8"))) {
      if (!isLocal(target)) continue;
      const path = decodeURIComponent(target.split(/[#?]/)[0]);
      if (!path) continue;
      const absolute = resolve(from, path);
      if (!existsSync(absolute) && !isDropped(absolute))
        broken.push(`${file}: ${target}`);
    }
  }
  return broken;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // `-z`: NUL-separated and unquoted, so a path outside ASCII (a Chinese
  // directory name) arrives as itself rather than git's `"\347\272\252"`
  // quoted-escaped form, which readFileSync cannot open.
  const files = execFileSync("git", ["ls-files", "-z", "*.md"], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\0")
    .filter((file) => file && !/^(src|e2e|src-tauri)\//.test(file));
  const broken = brokenLinks(files);
  if (broken.length) {
    console.error(`Broken links:\n  ${broken.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`${files.length} Markdown files, every relative link found`);
}

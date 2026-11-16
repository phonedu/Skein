#!/usr/bin/env node
// The publishing gate. Every push runs through here (.githooks/pre-push),
// and the same checks are run by hand before an upstream pull request is
// opened - the whole procedure lives in docs/ryugi/publishing-gate.md.
// This file belongs to the fork only and is on its own denylist
// (CONFIG.privatePaths): it never reaches the upstream repository.
//
// Two modes:
//   fork      the fork on GitHub (origin): privacy scan only - no real
//             email address, phone number or secret may be published.
//   upstream  the project we pull-request to: everything the fork checks,
//             plus private paths, internal codenames and any CJK text
//             (upstream documentation and comments are English).
//
// Usage:
//   node .githooks/gate.mjs fork     --range <base>..<head>
//   node .githooks/gate.mjs upstream --range <base>..<head>
//   node .githooks/gate.mjs <mode>   --head <oid> --base <oid|auto>
// ("auto" resolves to the merge-base with origin/main: a brand-new branch.)
//
// Tree diffs run from the merge-base of the range, like `git diff A...B`:
// with a plain two-dot tree diff, upstream's own newer commits would show
// up as if this side had reverted them (that once phantom-flagged
// .github/workflows). Commit-message scans keep the two-dot rev-list.

// node: imports instead of the console/process globals: this file lives
// outside scripts/, where the shared eslint config only provides browser
// globals, and the config itself is not ours to touch.
import { execFileSync } from "node:child_process";
import console from "node:console";
import process from "node:process";

const CONFIG = {
  // Remotes as set up in this clone: origin is the fork, upstream is the
  // project itself. The hook maps the remote name to a mode; anything not
  // listed here is scanned as a fork (privacy only, the safe default).
  upstreamRemotes: ["upstream"],
  // Paths whose very presence in a range bars it from upstream.
  privatePaths: ["docs/baseline/", "docs/ryugi/", ".ryugi/", ".githooks/"],
  // Substrings that never belong in upstream-bound content: the internal
  // project names, and the "baseline/" link form, which catches links to
  // the private docs from public files (docs/README.md did this once)
  // without banning the English word "baseline" from a sentence.
  blockedStrings: ["ryugi", "skein", "dsh", "deepseek harness", "baseline/"],
  // Paths that draw a warning, not a failure: a real CI change going
  // upstream would fail to push anyway (the fork's token has no workflow
  // scope), and AGENTS.md keeps CI changes out of contribution branches.
  warnPaths: [".github/"],
  // Privacy patterns run in every mode, fork pushes included. The email
  // domain must hold a letter, so version strings like react@1.9.0 pass.
  emailAllowDomains: ["users.noreply.github.com", "example.com"],
  // Commit identities are published too. Allowed: GitHub's noreply forms,
  // plus every author/committer already in upstream/main's history - those
  // are public wherever upstream's commits are, and a synced-main push
  // republishes them. Anything else (a personal address some machine's
  // global git config left on a commit) stops the push.
  identityAllowEmails: ["noreply@github.com"],
  identityAllowSuffixes: ["@users.noreply.github.com"],
  keyPatterns: [
    /\bghp_[A-Za-z0-9]{20,}\b/,
    /\bgho_[A-Za-z0-9]{20,}\b/,
    /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
    /\bsk-ant-[A-Za-z0-9-]{20,}\b/,
    /\bAKIA[0-9A-Z]{16}\b/,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
  ],
  // A mainland-China mobile number; none of those is ever legitimate here.
  phonePattern: /\b1[3-9]\d{9}\b/,
  // CJK in an added line means private material leaked into a public
  // change. Exempted: the locale files and the tests, where other
  // languages are the point. (Built from a string so the source stays
  // plain ASCII.)
  cjkPattern: new RegExp(
    "[\\u3000-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff" +
      "\\uf900-\\ufaff\\uac00-\\ud7af\\uff00-\\uffef]",
  ),
  cjkExemptPaths: [
    /^src\/i18n\//,
    /^e2e\//,
    /\/testdata\//,
    /\.test\.[cm]?[jt]sx?$/,
  ],
  // Examples past this many per rule group are summarised as a count.
  maxExamplesPerRule: 8,
};

const git = (...args) =>
  execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--range") {
      args.range = argv[i + 1];
      i += 1;
    } else if (arg === "--head") {
      args.head = argv[i + 1];
      i += 1;
    } else if (arg === "--base") {
      args.base = argv[i + 1];
      i += 1;
    } else {
      args._.push(arg);
    }
  }
  return args;
}

function fail(message) {
  console.error(`gate: ${message}`);
  process.exit(2);
}

function resolveBaseHead(args) {
  if (args.range) {
    const [base, head] = args.range.split("..");
    if (!base || !head) {
      fail(`--range must look like <base>..<head>, got "${args.range}"`);
    }
    return [base, head];
  }
  if (!args.head) {
    fail("give either --range <base>..<head> or --head <oid> [--base <oid>]");
  }
  let { base } = args;
  if (!base || base === "auto") {
    // A brand-new branch: everything since the fork's main left off.
    // merge-base fails outright when origin/main is unknown (a packed ref
    // is fine) or shares no history, so there is no existsSync dance.
    try {
      base = git("merge-base", "origin/main", args.head).trim();
    } catch {
      fail(
        "cannot resolve --base auto against origin/main; " +
          "run git fetch origin, or pass an explicit --base",
      );
    }
  }
  return [base, args.head];
}

// The path of a `+++ b/<path>` (or `--- a/<path>`) diff header. Git quotes
// non-ASCII paths with C escapes (core.quotepath): those headers read
// `+++ "b/docs/\346\224\271..."`, with the quote outside the b/ prefix.
// Only the ASCII prefix matters for the denylists, so the octal bytes are
// decoded one char at a time; a mojibake tail never hides the directory.
function diffPath(header) {
  let rest = header.slice(4);
  if (rest.startsWith('"')) {
    let out = "";
    for (let i = 1; i < rest.length && rest[i] !== '"'; i += 1) {
      if (rest[i] === "\\") {
        const octal = rest.slice(i + 1, i + 4);
        if (/^[0-7]{3}$/.test(octal)) {
          out += String.fromCharCode(parseInt(octal, 8));
          i += 3;
        } else {
          out += rest[i + 1];
          i += 1;
        }
      } else {
        out += rest[i];
      }
    }
    rest = out;
  }
  return rest.startsWith("b/") ? rest.slice(2) : rest;
}

const isPrivatePath = (path) =>
  CONFIG.privatePaths.some((prefix) => path.startsWith(prefix));

const isWarnPath = (path) =>
  CONFIG.warnPaths.some((prefix) => path.startsWith(prefix));

const isCjkExempt = (path) =>
  CONFIG.cjkExemptPaths.some((pattern) => pattern.test(path));

// Pure-word codenames match on word boundaries: "dsh" must not fire on
// "fixedShortcuts". Entries with punctuation (like "baseline/") keep
// plain substring matching - the slash is the point there.
const codewordMatchers = CONFIG.blockedStrings.map((word) => ({
  word,
  re: /^[\w ]+$/.test(word) ? new RegExp(`\\b${word}\\b`) : null,
}));

function codewordHit(loweredLine) {
  for (const { word, re } of codewordMatchers) {
    if (re ? re.test(loweredLine) : loweredLine.includes(word)) {
      return word;
    }
  }
  return null;
}

function privacyFindings(line) {
  const hits = [];
  const email = line.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+/);
  if (
    email &&
    /[A-Za-z]/.test(email[0].split("@")[1]) &&
    !CONFIG.emailAllowDomains.some((domain) =>
      email[0].toLowerCase().endsWith(`@${domain}`),
    )
  ) {
    hits.push({ rule: "email address", detail: email[0] });
  }
  for (const pattern of CONFIG.keyPatterns) {
    if (pattern.test(line)) {
      hits.push({ rule: "secret material", detail: `${pattern}` });
      break;
    }
  }
  if (CONFIG.phonePattern.test(line)) {
    hits.push({ rule: "mainland mobile number" });
  }
  return hits;
}

function upstreamFindings(line) {
  const hits = [];
  const codeword = codewordHit(line.toLowerCase());
  if (codeword) {
    hits.push({ rule: "internal codename", detail: `"${codeword}"` });
  }
  if (CONFIG.cjkPattern.test(line)) {
    hits.push({ rule: "CJK text (upstream docs are English)" });
  }
  return hits;
}

// Walks the added lines of the tree diff, tracking which file each line
// belongs to so path exemptions apply. Private-path files are skipped: the
// path itself is already a finding, their content is only noise. Binary
// patches carry base85 payload whose lines would match anything, so the
// current file is dropped while one passes by.
function scanDiff(base, head, mode, findings) {
  const diff = git("diff", "--unified=0", base, head);
  let file = null;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++")) {
      file = diffPath(line);
    } else if (
      line.startsWith("Binary files") ||
      line.startsWith("GIT binary patch")
    ) {
      file = null;
    } else if (line.startsWith("+")) {
      const added = line.slice(1);
      if (!added.trim() || !file || isPrivatePath(file)) {
        continue;
      }
      for (const hit of privacyFindings(added)) {
        findings.push({ where: file, ...hit, sample: added });
      }
      if (mode === "upstream" && !isCjkExempt(file)) {
        for (const hit of upstreamFindings(added)) {
          findings.push({ where: file, ...hit, sample: added });
        }
      }
    }
  }
}

// Commit messages are published with the push too. The revision args come
// from the caller, already narrowed to this side's commits.
function scanMessages(revArgs, mode, findings) {
  const log = git("log", "--format=%h %s%n%b", ...revArgs);
  for (const line of log.split("\n")) {
    for (const hit of privacyFindings(line)) {
      findings.push({ where: "commit message", ...hit, sample: line });
    }
    if (mode === "upstream") {
      for (const hit of upstreamFindings(line)) {
        findings.push({ where: "commit message", ...hit, sample: line });
      }
    }
  }
}

// The author and the committer of every published commit are public too.
// A personal address left in some machine's global git config would ride
// along unnoticed; upstream's own identities are the baseline, because a
// synced-main push legitimately republishes them.
function scanIdentities(base, head, findings) {
  const allowed = new Set(CONFIG.identityAllowEmails);
  try {
    for (const identity of git("log", "--format=%ae%n%ce", "upstream/main")
      .split("\n")
      .filter(Boolean)) {
      allowed.add(identity.toLowerCase());
    }
  } catch {
    // No upstream/main yet: noreply forms still pass, fetch upstream first.
  }
  const isAllowed = (email) =>
    allowed.has(email.toLowerCase()) ||
    CONFIG.identityAllowSuffixes.some((suffix) =>
      email.toLowerCase().endsWith(suffix),
    );
  const commits = git(
    "log",
    "--format=%h%x00%ae%x00%ce%x00%s",
    `${base}..${head}`,
  );
  for (const line of commits.split("\n")) {
    const [hash, author, committer, subject] = line.split("\0");
    if (!hash) continue;
    for (const [role, email] of [
      ["author", author],
      ["committer", committer],
    ]) {
      if (email && !isAllowed(email)) {
        findings.push({
          where: `${hash} ${role}`,
          rule: "commit identity (not noreply, not upstream's own)",
          detail: email,
          sample: subject ?? "",
        });
      }
    }
  }
}

// Failures grouped by rule, so one noisy category cannot hide another.
function report(findings) {
  const groups = new Map();
  for (const finding of findings) {
    const list = groups.get(finding.rule) ?? [];
    list.push(finding);
    groups.set(finding.rule, list);
  }
  console.error(`gate: FAILED, ${findings.length} finding(s):`);
  for (const [rule, list] of groups) {
    console.error(`  ${rule} (${list.length}):`);
    for (const finding of list.slice(0, CONFIG.maxExamplesPerRule)) {
      const detail = finding.detail ? ` ${finding.detail}` : "";
      const sample = (finding.sample ?? "").trim().slice(0, 70);
      console.error(
        `    ${finding.where}${detail}${sample ? ` | ${sample}` : ""}`,
      );
    }
    if (list.length > CONFIG.maxExamplesPerRule) {
      console.error(
        `    ... and ${list.length - CONFIG.maxExamplesPerRule} more`,
      );
    }
  }
  console.error("The procedure for fixing this: docs/ryugi/publishing-gate.md");
}

const args = parseArgs(process.argv.slice(2));
const mode = args._;
if (mode.length !== 1 || !["fork", "upstream"].includes(mode[0])) {
  fail("usage: gate.mjs <fork|upstream> --range <base>..<head>");
}

const [base, head] = resolveBaseHead(args);
const findings = [];
const warnings = [];

// Content and messages are scanned for this side's commits only, measured
// against upstream/main: a push that syncs the fork with upstream
// republishes upstream's own (already public) fixtures, sign-offs and
// identities, and flagging those would make every sync a false alarm.
// Without a fetched upstream/main the whole pushed range is scanned.
let contentBase = git("merge-base", base, head).trim();
let logArgs = [head, "--not", base];
try {
  git("rev-parse", "--verify", "-q", "upstream/main");
  contentBase = git("merge-base", "upstream/main", head).trim();
  logArgs = [head, "--not", base, "upstream/main"];
} catch {
  // No upstream/main in this clone yet; scan everything pushed.
}

if (mode[0] === "upstream") {
  // -z: raw NUL-separated paths, immune to the quoting of non-ASCII names.
  const paths = git("diff", "--name-only", "-z", contentBase, head)
    .split("\0")
    .filter(Boolean);
  for (const path of paths) {
    if (isPrivatePath(path)) {
      findings.push({
        where: path,
        rule: "private path (never goes upstream)",
      });
    } else if (isWarnPath(path)) {
      warnings.push(
        `${path}: CI change - AGENTS.md keeps those out of contribution ` +
          `branches, and the fork token has no workflow scope to push it`,
      );
    }
  }
}

scanDiff(contentBase, head, mode[0], findings);
scanMessages(logArgs, mode[0], findings);
scanIdentities(base, head, findings);

for (const warning of warnings) {
  console.error(`gate: WARNING ${warning}`);
}
if (findings.length === 0) {
  console.log(`gate: ${mode[0]} scan clean over ${base}..${head}`);
  process.exit(0);
}
report(findings);
process.exit(1);

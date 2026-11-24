#!/usr/bin/env node
// Shared lookup for the commit gates: a Task: id is valid while the task is
// doing, or after it has been closed into archive/. It deliberately rejects a
// todo/later id: the work must start through the ledger first.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export function checkTaskId(id, base = root) {
  const statusPath = join(base, "docs/skein/status.yaml");
  if (!existsSync(statusPath))
    return { ok: false, reason: "status.yaml missing" };
  const status = parse(readFileSync(statusPath, "utf8")) ?? {};
  const task = (status.tasks ?? []).find((item) => item.id === id);
  if (task) {
    if (task.state === "doing") return { ok: true, task };
    return {
      ok: false,
      reason: `task ${id} is ${task.state ?? "todo"}; run \`npm run docs:task -- start ${id}\` first`,
    };
  }
  const later = (status.later ?? []).find((item) => item.id === id);
  if (later)
    return {
      ok: false,
      reason: `task ${id} is in later; run \`npm run docs:task -- start ${id}\` first`,
    };
  const archive = join(base, "docs/skein/archive");
  if (existsSync(archive)) {
    for (const name of readdirSync(archive)) {
      if (!name.endsWith(".md") || name === "README.md" || name === "INDEX.md")
        continue;
      const path = join(archive, name);
      const text = readFileSync(path, "utf8");
      if (
        name.includes(`-${id}.md`) ||
        new RegExp(`^# ${id} —`, "m").test(text)
      )
        return { ok: true, archived: name };
    }
  }
  return {
    ok: false,
    reason: `unknown task ${id}; add it with \`npm run docs:task -- add ...\` or capture it`,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const id = process.argv[2];
  if (!id) {
    console.error("usage: check-task-id.mjs <id>");
    process.exit(1);
  }
  const result = checkTaskId(id);
  if (result.ok) {
    console.log(
      `Task ${id} is ${result.archived ? `archived (${result.archived})` : "doing"}`,
    );
  } else {
    console.error(result.reason);
    process.exit(1);
  }
}

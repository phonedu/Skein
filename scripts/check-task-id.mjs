#!/usr/bin/env node
import { checkTaskId } from "./task-ledger.mjs";

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

// Vault fixtures and the tree comparison every step ends with. `.textus` is
// this device's identity, not synced content.
import { createHash } from "node:crypto";
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, sep } from "node:path";

export const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function write(root, path, content) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

export function remove(root, path) {
  rmSync(join(root, path), { force: true });
}

export function tree(root) {
  const files = {};
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === ".textus") continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        const bytes = readFileSync(full);
        files[relative(root, full).split(sep).join("/")] = {
          hash: hash(bytes),
          size: bytes.length,
        };
      }
    }
  };
  walk(root);
  return files;
}

export function assertTreeEqual(left, right, label) {
  const leftPaths = Object.keys(left).sort();
  const rightPaths = Object.keys(right).sort();
  if (leftPaths.join("\n") !== rightPaths.join("\n")) {
    throw new Error(
      `${label}: paths differ:\n  A: ${leftPaths.join(", ")}\n  B: ${rightPaths.join(", ")}`,
    );
  }
  for (const path of leftPaths) {
    if (left[path].hash !== right[path].hash) {
      throw new Error(`${label}: ${path} differs`);
    }
  }
}

export function content(root, path) {
  try {
    return readFileSync(join(root, path), "utf8");
  } catch {
    return null;
  }
}

export function exists(root, path) {
  try {
    return statSync(join(root, path)).isFile();
  } catch {
    return false;
  }
}

export function conflictPath(tree) {
  return Object.keys(tree).find((path) => path.startsWith("Sync conflicts/"));
}

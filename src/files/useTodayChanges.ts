import { useEffect, useState } from "react";
import { fs } from "../platform/ipc";
import {
  FILE_CREATED_EVENT,
  FILE_RELOADED_EVENT,
  FILE_WRITTEN_EVENT,
} from "../utils/events";

/** A note changed today: its path, its title (front matter or first H1,
 *  falling back to the file's name), its id when it carries one, and the
 *  time it was written. */
export interface TodayChange {
  path: string;
  name: string;
  title: string;
  id: string | null;
  modified_ms: number;
}

const DAY_START = () => {
  const at = new Date();
  at.setHours(0, 0, 0, 0);
  return at.getTime();
};

const DOCUMENT = /\.(md|markdown|mdx|txt)$/i;
const SKIP = new Set(["_history", "_usage", ".textus", ".git", "node_modules"]);
const MAX_ENTRIES = 2000;
const MAX_DEPTH = 8;
const SHOWN = 6;
/** A save, a focus: the walk waits this long, then runs once. */
const SETTLE_MS = 1000;
/** Coming back to the window re-reads at most this often. */
const FOCUS_MS = 30_000;

/** The title a note introduces itself with: front matter's `title`, else
 *  the first H1, else its file name. Its `id` comes from the front matter. */
function noteIdentity(
  text: string,
  name: string,
): { title: string; id: string | null } {
  const head = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const field = (key: string) => {
    const found = head?.[1].match(new RegExp(`^${key}:\\s*(.+)$`, "m"))?.[1];
    return found ? found.trim().replace(/^["']|["']$/g, "") : null;
  };
  const h1 = text.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? null;
  return { title: field("title") || h1 || name, id: field("id") };
}

/**
 * The notes under `root` written today, newest first: the host's own
 * mtime data, for the Today view (not the recently opened files, which
 * belong to the Files view). A folder walk, bounded by entries and depth;
 * the six it shows then have their titles read. A walk that fails (a
 * folder too broad) leaves the list empty rather than failing the view.
 * Saves settle before walking; a focus re-reads at most every 30 seconds.
 */
export function useTodayChanges(root: string | null): TodayChange[] {
  const [changes, setChanges] = useState<TodayChange[]>([]);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    if (!root) {
      setChanges([]);
      return;
    }
    let cancelled = false;
    const since = DAY_START();
    const found: Omit<TodayChange, "title" | "id">[] = [];
    let seen = 0;
    const walk = async (dir: string, depth: number): Promise<void> => {
      if (cancelled || depth > MAX_DEPTH || seen >= MAX_ENTRIES) return;
      const entries = await fs.listDir(dir).catch(() => []);
      for (const entry of entries) {
        if (cancelled || seen >= MAX_ENTRIES) return;
        seen += 1;
        if (entry.is_dir) {
          if (entry.hidden || entry.ignored || SKIP.has(entry.name)) continue;
          await walk(entry.path, depth + 1);
          continue;
        }
        if (entry.hidden || entry.ignored) continue;
        if (!DOCUMENT.test(entry.name)) continue;
        if ((entry.modified_ms ?? 0) < since) continue;
        found.push({
          path: entry.path,
          name: entry.name.replace(DOCUMENT, ""),
          modified_ms: entry.modified_ms ?? 0,
        });
      }
    };
    void walk(root, 0).then(async () => {
      if (cancelled) return;
      const top = found
        .sort((a, b) => b.modified_ms - a.modified_ms)
        .slice(0, SHOWN);
      // The six shown introduce themselves by their own title; reading six
      // short files keeps the view's cost bounded.
      const shown = await Promise.all(
        top.map(async (change) => {
          const text = await fs.readTextFile(change.path).catch(() => "");
          return { ...change, ...noteIdentity(text, change.name) };
        }),
      );
      if (!cancelled) setChanges(shown);
    });
    return () => {
      cancelled = true;
    };
  }, [root, generation]);

  // A save, a new note, or the window coming back to the front: today's
  // list follows, a burst of saves walking once.
  useEffect(() => {
    let timer: number | undefined;
    let lastFocus = 0;
    const bump = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(() => setGeneration((n) => n + 1), SETTLE_MS);
    };
    const focused = () => {
      const now = Date.now();
      if (now - lastFocus < FOCUS_MS) return;
      lastFocus = now;
      bump();
    };
    window.addEventListener(FILE_WRITTEN_EVENT, bump);
    window.addEventListener(FILE_CREATED_EVENT, bump);
    window.addEventListener(FILE_RELOADED_EVENT, bump);
    window.addEventListener("focus", focused);
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      window.removeEventListener(FILE_WRITTEN_EVENT, bump);
      window.removeEventListener(FILE_CREATED_EVENT, bump);
      window.removeEventListener(FILE_RELOADED_EVENT, bump);
      window.removeEventListener("focus", focused);
    };
  }, []);

  return changes;
}

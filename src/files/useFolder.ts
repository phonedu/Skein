import { useEffect, useState } from "react";
import type { DirEntryInfo } from "../platform/bindings/files";
import { fs } from "../platform/ipc";
import { explainError } from "../utils/error-explain";
import { currentStrings } from "../i18n/current";
import { isInside, isWithin } from "../utils/path";

/** `next`, keeping each entry of `was` that is unchanged, and `was` itself
 *  when none changed: a folder read again as the window comes to the front
 *  draws none of its rows again. */
function keptEntries(
  was: DirEntryInfo[] | undefined,
  next: DirEntryInfo[],
): DirEntryInfo[] {
  if (!was) return next;
  const known = new Map(was.map((e) => [e.path, e]));
  const same = (a: DirEntryInfo, b: DirEntryInfo) =>
    (Object.keys(b) as (keyof DirEntryInfo)[]).every((k) => a[k] === b[k]);
  let changed = was.length !== next.length;
  const kept = next.map((entry, i) => {
    const old = known.get(entry.path);
    if (old && same(old, entry)) {
      if (was[i] !== old) changed = true;
      return old;
    }
    changed = true;
    return entry;
  });
  return changed ? kept : was;
}

/** Newest first; one the system gave no date for goes last. */
export function byModified(a: DirEntryInfo, b: DirEntryInfo): number {
  return (b.modified_ms ?? -Infinity) - (a.modified_ms ?? -Infinity);
}

export function useFolderOpen({
  path,
  depth,
  activePath,
  reveal,
  version,
  drafting,
}: {
  path: string;
  depth: number;
  activePath: string | null;
  reveal: string | null;
  version: number;
  drafting: "document" | "folder" | null;
}) {
  const [open, setOpen] = useState(
    depth === 0 || (activePath !== null && isInside(activePath, path)),
  );
  useEffect(() => {
    if (
      (activePath !== null && isInside(activePath, path)) ||
      (reveal && isWithin(reveal, path))
    )
      setOpen(true);
  }, [activePath, reveal, path]);
  useEffect(() => {
    if (version > 0 || drafting) setOpen(true);
  }, [version, drafting]);
  return [open, setOpen] as const;
}

export function useFolderListing({
  path,
  open,
  filter,
  listing,
}: {
  path: string;
  open: boolean;
  filter: string;
  listing: string;
}) {
  const [loaded, setLoaded] = useState<{
    listing: string;
    entries: DirEntryInfo[];
    failed?: string;
  } | null>(null);
  useEffect(() => {
    if (filter && !open) {
      return;
    }
    if (!open || loaded?.listing === listing) return;
    let cancelled = false;
    fs.listDir(path).then(
      (entries) =>
        !cancelled &&
        setLoaded((was) => ({
          listing,
          entries: keptEntries(was?.entries, entries),
        })),
      (err: unknown) =>
        !cancelled &&
        setLoaded({
          listing,
          entries: [],
          failed: explainError(err, currentStrings()),
        }),
    );
    return () => {
      cancelled = true;
    };
  }, [filter, open, loaded, listing, path]);
  return loaded;
}

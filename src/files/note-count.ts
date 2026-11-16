import { useEffect, useState } from "react";
import { fs } from "../platform/ipc";

/** The notes in a folder: the count the notes view's foot shows. Files the
 *  folder index lists past its cap keep the count honest with a plus. */
export function countNotes(files: readonly { rel: string }[]): number {
  let n = 0;
  for (const file of files) if (/\.md$/i.test(file.rel)) n += 1;
  return n;
}

/** The label value: the count, or the count plus "+", for an index that
 *  hit its cap before listing the whole folder. */
export function noteCountLabel(
  files: readonly { rel: string }[],
  truncated: boolean,
): string {
  const n = countNotes(files);
  return truncated && n > 0 ? `${n}+` : `${n}`;
}

/** The note count for a folder, from the folder index the search already
 *  uses. Loaded on mount and on folder change; the event-driven refresh
 *  lands with the workspace pass - the foot is a fact, not a live meter. */
export function useNoteCount(folder: string | null): string | null {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    if (!folder) {
      setLabel(null);
      return;
    }
    let stale = false;
    fs.indexFolder(folder)
      .then((result) => {
        if (!stale) setLabel(noteCountLabel(result.files, result.truncated));
      })
      .catch(() => {
        if (!stale) setLabel(null);
      });
    return () => {
      stale = true;
    };
  }, [folder]);
  return label;
}

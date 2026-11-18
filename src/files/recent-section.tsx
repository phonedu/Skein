import type { Strings } from "../i18n/strings";
import { isWithin } from "../utils/path";

/** The row's own name, whatever separators the path came in with. */
export const baseName = (path: string) =>
  path
    .replace(/[\\/]+$/, "")
    .split(/[\\/]/)
    .pop() ?? path;

/**
 * The notes board's recent files, above the library's tree: only the ones
 * inside the tree's root when one is given (recents are global across
 * folders), the most recent first as the list arrives. Nothing to show,
 * nothing drawn.
 */
export function RecentSection({
  t,
  files,
  root,
  onOpen,
}: {
  t: Strings;
  files: readonly string[];
  /** Left out: no filtering, the list stands as it arrived. */
  root?: string;
  onOpen: (path: string) => void;
}) {
  const recent = (
    root ? files.filter((path) => isWithin(path, root)) : [...files]
  ).slice(0, 5);
  if (recent.length === 0) return null;
  return (
    <section className="recent-section">
      <div className="tree-section-title">{t.notesRecent}</div>
      <div className="recent-list" role="list">
        {recent.map((path) => (
          <button
            key={path}
            type="button"
            role="listitem"
            className="recent-row"
            title={path}
            onClick={() => onOpen(path)}
          >
            {baseName(path)}
          </button>
        ))}
      </div>
    </section>
  );
}

import { fileIconFor } from "../engine/controls/file-icons";
import type { Strings } from "../i18n/strings";
import { isWithin } from "../utils/path";

/** The row's own name, whatever separators the path came in with. */
const baseName = (path: string) =>
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
        {recent.map((path) => {
          const name = baseName(path);
          const Icon = fileIconFor(name);
          return (
            <button
              key={path}
              type="button"
              role="listitem"
              className="recent-row"
              title={path}
              onClick={() => onOpen(path)}
            >
              {/* aria-hidden is set by the icon itself; its props don't take it. */}
              <Icon className="recent-row-ic" />
              <span className="recent-row-name">{name}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

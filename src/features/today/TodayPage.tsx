import { useEffect, useMemo, useState } from "react";
import { SearchIcon, ChevronIcon, lucide } from "../../engine/controls/icons";
import { Sun } from "lucide-react";
import { fileIconFor } from "../../engine/controls/file-icons";
import { baseName } from "../../files/recent-section";
import { useNoteCount } from "../../files/note-count";
import { readRecents } from "../../app/menu/recents";
import { fill } from "../../i18n/fill";
import type { Strings } from "../../i18n/strings";
import "./today.css";

const TodayStartIcon = lucide(Sun, 18);

/**
 * Today (the notes board's ui-d-today): the queue's column - its fixed
 * groups with their counts, the recent notes as real rows - beside the
 * day's main area, which is the start card until a selection has somewhere
 * to land. The tasks', assets' and confirmations' rows arrive with the
 * workspace pass; their groups stand ready with their empty states.
 */
export function TodayPage({
  t,
  folder,
  onOpenFile,
  onGoNotes,
}: {
  t: Strings;
  /** The opened folder, or the tree's root: the header's note count. */
  folder: string | null;
  /** Opening a note from here lands back in the notes view. */
  onOpenFile: (path: string) => void;
  onGoNotes: () => void;
}) {
  const [recents, setRecents] = useState<readonly string[]>([]);
  const [query, setQuery] = useState("");
  useEffect(() => {
    let stale = false;
    readRecents().then(
      (recents) => !stale && setRecents(recents.files),
      () => undefined,
    );
    return () => {
      stale = true;
    };
  }, []);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [...recents];
    return recents.filter((path) => baseName(path).toLowerCase().includes(q));
  }, [recents, query]);
  const counted = useNoteCount(folder);
  const noteCount = counted ?? `${recents.length}`;
  const empty = [
    { title: t.todayGroupActive, hint: t.todayEmptyActive },
    { title: t.todayGroupAssets, hint: t.todayEmptyAssets },
    { title: t.todayGroupConfirm, hint: t.todayEmptyConfirm },
  ];
  return (
    <div className="today-page">
      <aside className="today-queue" aria-label={t.navToday}>
        <div className="today-q-head">
          <span className="today-q-title">
            {t.navToday}
            <span className="today-q-count">
              {fill(t.todayNoteCount, { n: noteCount })}
            </span>
          </span>
        </div>
        <div className="today-q-search">
          <SearchIcon />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.todayFilterQueue}
            aria-label={t.todayFilterQueue}
          />
        </div>
        <div className="today-q-scroll">
          {empty.map(({ title, hint }) => (
            <section key={title} className="today-q-group">
              <div className="today-q-gh">
                <span>{title}</span>
                <span className="today-q-n">0</span>
              </div>
              <div className="today-q-box">
                <div className="today-q-empty">{hint}</div>
              </div>
            </section>
          ))}
          <section className="today-q-group">
            <div className="today-q-gh">
              <span>{t.todayRecentGroup}</span>
              <span className="today-q-n">{recents.length}</span>
            </div>
            <div className="today-q-box">
              {shown.map((path) => {
                const Icon = fileIconFor(path);
                return (
                  <button
                    key={path}
                    type="button"
                    className="today-q-row"
                    title={path}
                    onClick={() => {
                      onOpenFile(path);
                      onGoNotes();
                    }}
                  >
                    <span className="today-q-ic">
                      <Icon />
                    </span>
                    <span className="today-q-tx">
                      <span className="today-q-rt">{baseName(path)}</span>
                      <span className="today-q-rm">{t.todayNoteMeta}</span>
                    </span>
                    <ChevronIcon className="today-q-chev" />
                  </button>
                );
              })}
              {recents.length === 0 && (
                <div className="today-q-empty">{t.todayEmptyRecent}</div>
              )}
              {recents.length > 0 && shown.length === 0 && (
                <div className="today-q-empty">{t.todayNoMatch}</div>
              )}
            </div>
          </section>
        </div>
      </aside>
      <div className="today-main">
        <div className="today-start">
          <span className="today-start-ic">
            <TodayStartIcon />
          </span>
          <p className="today-start-title">{t.todayPickTitle}</p>
          <p className="today-start-hint">{t.todayStartHint}</p>
          <button type="button" className="today-go-notes" onClick={onGoNotes}>
            {t.todayGoNotes}
          </button>
        </div>
      </div>
    </div>
  );
}

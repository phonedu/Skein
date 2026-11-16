import { useEffect, useState } from "react";
import type { Strings } from "../../i18n/strings";
import { readRecents } from "../../app/menu/recents";
import { RecentSection } from "../../files/recent-section";
import "./today.css";

/**
 * Today (the notes board's ui-d-today), first pass: the queue's column with
 * its fixed groups - the counts are real zeros until the workspace pass
 * brings the tasks and assets - the recent notes the window already knows,
 * and a start card where the day's detail will grow.
 */
export function TodayPage({
  t,
  onOpenFile,
  onGoNotes,
}: {
  t: Strings;
  /** Opening a note from here lands back in the notes view. */
  onOpenFile: (path: string) => void;
  onGoNotes: () => void;
}) {
  const [recents, setRecents] = useState<readonly string[]>([]);
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
  const empty = [
    { title: t.todayGroupActive, hint: t.todayEmptyActive },
    { title: t.todayGroupAssets, hint: t.todayEmptyAssets },
    { title: t.todayGroupConfirm, hint: t.todayEmptyConfirm },
  ];
  return (
    <div className="today-page">
      <aside className="today-queue" aria-label={t.navToday}>
        {empty.map(({ title, hint }) => (
          <section key={title} className="today-queue-group">
            <div className="today-group-title">
              {title}
              <span className="today-group-count">0</span>
            </div>
            <div className="today-empty">{hint}</div>
          </section>
        ))}
        <section className="today-queue-group">
          <div className="today-group-title">
            {t.todayRecentGroup}
            <span className="today-group-count">{recents.length}</span>
          </div>
          <RecentSection
            t={t}
            files={recents}
            onOpen={(path) => {
              onOpenFile(path);
              onGoNotes();
            }}
          />
          {recents.length === 0 && (
            <div className="today-empty">{t.todayEmptyRecent}</div>
          )}
        </section>
      </aside>
      <div className="today-main">
        <h1 className="today-title">{t.navToday}</h1>
        <div className="today-start">
          <p className="today-start-hint">{t.todayStartHint}</p>
          <button type="button" className="today-go-notes" onClick={onGoNotes}>
            {t.todayGoNotes}
          </button>
        </div>
      </div>
    </div>
  );
}

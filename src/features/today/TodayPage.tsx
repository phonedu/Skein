import { useEffect, useState } from "react";
import type { Strings } from "../../i18n/strings";
import { readRecents } from "../../app/menu/recents";
import { RecentSection } from "../../files/recent-section";
import "./today.css";

/**
 * Today (the notes board's ui-d-today), its first pass: the three groups'
 * places with their empty states - the queue's data lands with the
 * workspace pass - and the recent notes, which the window already knows.
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
      {empty.map(({ title, hint }) => (
        <section key={title} className="today-group">
          <div className="today-group-title">{title}</div>
          <p className="today-empty">{hint}</p>
        </section>
      ))}
      <section className="today-group">
        <div className="today-group-title">{t.todayRecentGroup}</div>
        <RecentSection
          t={t}
          files={recents}
          onOpen={(path) => {
            onOpenFile(path);
            onGoNotes();
          }}
        />
        {recents.length === 0 && (
          <p className="today-empty">{t.todayEmptyActive}</p>
        )}
      </section>
    </div>
  );
}

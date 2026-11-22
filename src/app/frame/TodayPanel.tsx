import { useSyncExternalStore } from "react";
import {
  ChevronIcon,
  ClockIcon,
  MarkdownFileIcon,
  NewDocumentIcon,
} from "../../engine/controls/icons";
import type { Strings } from "../../i18n/strings";
import { useTodayChanges } from "../../files/useTodayChanges";
import { runCommand } from "../../registry/commands";
import {
  statusItemsSnapshot,
  subscribeStatusItems,
} from "../../plugins/contributions/status-items";
import { pluginName, pluginRecord } from "../../plugins/store/plugin-records";
import type { OpenFolder } from "../useOpenFolder";
import "./today-panel.css";

/**
 * Today: what is happening now - the note in front, the Skein asset plugin's
 * pending confirmations, and the notes written today. It is not a smaller
 * file tree: the full library, its recents and its search belong to the
 * Files view beside it.
 */
export function TodayPanel({
  t,
  activeTitle,
  activePath,
  openFolder,
  onOpenFile,
  onCapture,
}: {
  t: Strings;
  activeTitle: string;
  activePath: string | null;
  openFolder: OpenFolder;
  onOpenFile: (path: string) => void;
  /** The day's one action, for the empty view's call. */
  onCapture: () => void;
}) {
  const statuses = useSyncExternalStore(
    subscribeStatusItems,
    statusItemsSnapshot,
  );
  // The asset plugin's own status is its confirmations; a sync's status
  // belongs to the bar, not here.
  const pending = statuses.filter((item) => item.plugin === "skein.collect");
  const changes = useTodayChanges(
    openFolder.folder ?? openFolder.treeRoot ?? null,
  );

  const time = (ms: number) =>
    new Date(ms).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });

  const empty = !activeTitle && !pending.length && !changes.length;

  return (
    <div className="today-panel">
      {empty ? (
        <div className="today-empty">
          <span className="today-empty-mark" aria-hidden>
            <NewDocumentIcon />
          </span>
          <div className="today-empty-title">{t.todayEmptyTitle}</div>
          <div className="today-empty-hint">{t.todayEmptyHint}</div>
          <button type="button" className="tx-button small" onClick={onCapture}>
            {t.todayCapture}
          </button>
        </div>
      ) : null}

      {activeTitle ? (
        <>
          <div className="today-label tx-section-label">{t.todayCurrent}</div>
          <button
            type="button"
            className="today-current"
            onClick={() => activePath && onOpenFile(activePath)}
          >
            {/* aria-hidden is set by the icon itself; its props don't take it. */}
            <MarkdownFileIcon className="today-current-ic" />
            <span className="today-current-text">
              <span className="today-current-title">{activeTitle}</span>
              {activePath ? (
                <span className="today-current-path">
                  {activePath.split(/[\\/]/).slice(-2).join(" / ")}
                </span>
              ) : null}
            </span>
          </button>
        </>
      ) : null}

      {pending.length ? (
        <>
          <div className="today-label tx-section-label">{t.todayPending}</div>
          {pending.map((item) => {
            const record = pluginRecord(item.plugin);
            const name = record ? pluginName(record) : item.plugin;
            return (
              <button
                key={item.key}
                type="button"
                className="today-row"
                disabled={!item.command}
                onClick={() => item.command && runCommand(item.command)}
                title={item.tooltip ? `${item.tooltip} · ${name}` : name}
              >
                <span className="today-row-dot" aria-hidden />
                <span className="today-row-text">{item.text}</span>
                <ChevronIcon className="today-row-chev" />
              </button>
            );
          })}
        </>
      ) : null}

      {changes.length ? (
        <>
          <div className="today-label tx-section-label">{t.todayChanged}</div>
          {changes.map((change) => (
            <button
              key={change.path}
              type="button"
              className="today-row"
              onClick={() => onOpenFile(change.path)}
              title={change.path}
            >
              <MarkdownFileIcon className="today-row-ic" />
              <span className="today-row-text">{change.title}</span>
              <span className="today-row-time">
                <ClockIcon className="today-row-clock" />
                {time(change.modified_ms)}
                {change.id ? ` · ${change.id}` : ""}
              </span>
            </button>
          ))}
        </>
      ) : null}
    </div>
  );
}

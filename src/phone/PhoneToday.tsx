import { useState, useSyncExternalStore } from "react";
import {
  ActionSheet,
  type ActionSheetItem,
} from "../engine/controls/ActionSheet";
import {
  ChevronIcon,
  MarkdownFileIcon,
  MoreIcon,
  PluginsTabIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
} from "../engine/controls/icons";
import { Presence } from "../engine/motion/usePresence";
import type { Strings } from "../i18n/strings";
import type { OpenFolder } from "../app/useOpenFolder";
import { useTodayChanges } from "../files/useTodayChanges";
import { runCommand } from "../registry/commands";
import {
  statusItemsSnapshot,
  subscribeStatusItems,
} from "../plugins/contributions/status-items";
import { emitToThisWindow } from "../platform/menu-events";
import { openCommandPalette } from "../app/command-palette";
import { VaultButton } from "../vaults/VaultButton";
import { PhoneSyncStatus } from "./PhoneSyncStatus";
import { PhoneViewSeg } from "./PhoneViewSeg";
import "./PhoneToday.css";

/**
 * The phone's home: Today. The day's capture sits in the view capsule's row
 * as it does on the desktop, so it is in sight on both surfaces; everything
 * lower-frequency is behind the ⋯ sheet. No floating button, no bottom
 * action bar: the page itself carries the actions.
 */
export function PhoneToday({
  t,
  activeTitle,
  activePath,
  openFolder,
  onOpenFile,
  onOpenCurrent,
  onOpenLibrary,
  onCapture,
}: {
  t: Strings;
  activeTitle: string;
  activePath: string | null;
  openFolder: OpenFolder;
  onOpenFile: (path: string) => void;
  /** The document in front, by its tab: an unsaved one has no path. */
  onOpenCurrent: () => void;
  onOpenLibrary: () => void;
  onCapture: () => void;
}) {
  const [more, setMore] = useState(false);
  const statuses = useSyncExternalStore(
    subscribeStatusItems,
    statusItemsSnapshot,
  );
  const pending = statuses.filter((item) => item.plugin === "skein.collect");
  const changes = useTodayChanges(
    openFolder.folder ?? openFolder.treeRoot ?? null,
  );
  const root = openFolder.folder ?? openFolder.treeRoot;
  const vault = root ? root.split(/[\\/]/).filter(Boolean).pop() : null;
  const time = (ms: number) =>
    new Date(ms).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });

  const moreItems: (ActionSheetItem | "separator")[] = [
    {
      label: t.pluginsTitle,
      Icon: PluginsTabIcon,
      onSelect: () => {
        setMore(false);
        void import("../plugins/views/plugin-launcher").then((m) =>
          m.openPluginLauncher(),
        );
      },
    },
    "separator",
    {
      label: t.menuCommandPalette,
      Icon: SearchIcon,
      onSelect: () => {
        setMore(false);
        void openCommandPalette();
      },
    },
  ];

  return (
    <div className="phone-today">
      <div className="ptop">
        <VaultButton
          t={t}
          openFolder={openFolder}
          variant="today"
          current={root}
          name={vault ?? t.menuOpenFolder}
        />
        <span className="ptop-spacer" />
        <button
          type="button"
          className="ptop-ic"
          aria-label={t.phoneMoreActions}
          onClick={() => setMore(true)}
        >
          <MoreIcon />
        </button>
        <button
          type="button"
          className="ptop-ic"
          aria-label={t.settingsTitle}
          onClick={() => emitToThisWindow("menu-settings")}
        >
          <SettingsIcon />
        </button>
      </div>

      <PhoneViewSeg
        t={t}
        value="today"
        onChange={(view) => view === "files" && onOpenLibrary()}
        onCapture={onCapture}
      />

      <PhoneSyncStatus folder={root || null} t={t} />

      <div className="pbody">
        {!activeTitle && !pending.length && !changes.length ? (
          <div className="pempty">
            <span className="pempty-mark" aria-hidden>
              <PlusIcon />
            </span>
            <div className="pempty-title">{t.todayEmptyTitle}</div>
            <div className="pempty-hint">{t.todayEmptyHint}</div>
          </div>
        ) : null}

        {activeTitle ? (
          <>
            <div className="plabel tx-section-label">{t.todayCurrent}</div>
            <button
              type="button"
              className="pcard"
              onClick={() =>
                activePath ? onOpenFile(activePath) : onOpenCurrent()
              }
            >
              <span className="pcard-title">{activeTitle}</span>
              {activePath ? (
                <span className="pcard-path">
                  {activePath.split(/[\\/]/).slice(-2).join(" / ")}
                </span>
              ) : (
                // No file yet: named as what it is, and still the way in.
                <span className="pcard-path pcard-draft">
                  {t.todayDraftUnsaved}
                </span>
              )}
            </button>
          </>
        ) : null}

        {pending.length ? (
          <>
            <div className="plabel tx-section-label">{t.todayPending}</div>
            {pending.map((item) => (
              <button
                key={item.key}
                type="button"
                className="prow"
                disabled={!item.command}
                onClick={() => item.command && runCommand(item.command)}
              >
                <span className="prow-dot" aria-hidden />
                <span className="prow-text">{item.text}</span>
                <ChevronIcon className="prow-chev" />
              </button>
            ))}
          </>
        ) : null}

        {changes.length ? (
          <>
            <div className="plabel tx-section-label">{t.todayChanged}</div>
            <div className="pchanges">
              {changes.map((change) => (
                <button
                  key={change.path}
                  type="button"
                  className="prow prow-doc"
                  onClick={() => onOpenFile(change.path)}
                  title={change.path}
                >
                  <MarkdownFileIcon className="prow-ic" />
                  <span className="prow-doc-text">
                    <span className="prow-title">{change.title}</span>
                    <span className="prow-sub">
                      {time(change.modified_ms)}
                      {change.id ? ` · ${change.id}` : ""}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : null}
      </div>

      <Presence show={more}>
        {more && (
          <ActionSheet
            title={t.phoneMoreActions}
            items={moreItems}
            onClose={() => setMore(false)}
          />
        )}
      </Presence>
    </div>
  );
}

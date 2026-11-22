import {
  Fragment,
  Suspense,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { barRowsHaveRoom } from "../../engine/layout/row-insets";
import { useFitSteps } from "../../engine/controls/fit-steps";
import { useSettings } from "../../prefs/SettingsContext";
import { WindowCaptionButtons } from "../../engine/controls/WindowCaptionButtons";
import type { MenuChecks } from "../../registry/menu/app-menu-model";
import { MenuBar } from "../menu/MenuBar";
import { Tooltip } from "../../engine/controls/Tooltip";
import { TextusAiButton } from "../../ai/TextusAiSwitch";
import { AgentButtons } from "../../ai/agents/AgentButtons";
import { canUseWindows } from "../../platform/capabilities";
import {
  LockIcon,
  PluginsTabIcon,
  SearchIcon,
  SidebarToggleIcon,
} from "../../engine/controls/icons";
import { useBarLayout } from "../../engine/layout/useBarLayout";
import { useTitleRoom } from "./useTitleRoom";
import { usePhoneLayout } from "../../engine/controls/usePhoneLayout";
import { lazyModule } from "../../lazy/lazy-module";
import { lazyComponent } from "../../lazy/lazy-component";
import {
  anyStatus,
  subscribeAnyStatus,
} from "../../plugins/contributions/status-items";

// What plugins show here comes with the first of it: plugins run once the
// window is up, so it stays out of what loads before the first frame.
const PluginStatusItems = lazyComponent(
  lazyModule("plugin-status", () => import("../PluginStatusItems")),
  (m) => m.PluginStatusItems,
);

/** As the bar runs short, in turn: the menu's titles to ☰, plugins'
 *  status to their icons, the agents' buttons to one menu. */
const BAR_FOLDS = ["menu", "status", "agents"] as const;

/**
 * The window's one top strip: a real layout row (an overlay title bar hides
 * the native drag area) and the drag region. Where the OS draws no frame,
 * it is also the caption and the app menu.
 */
export function WindowBar({
  menuChecks,
  title,
  dirty,
  sidebarOpen,
  sidebarShortcut,
  onToggleSidebar,
  showAgentToggle,
  agentOpen,
  agentShortcut,
  onToggleAgent,
  onToggleReadOnly,
  onOpenPlugins,
  documentMenu,
}: {
  menuChecks: MenuChecks;
  title: string;
  dirty: boolean;
  sidebarOpen: boolean;
  /** The sidebar's shortcut, as shown in the button's tooltip. */
  sidebarShortcut: string;
  onToggleSidebar: () => void;
  /** The plugin pages and commands, in one QuickPick. */
  onOpenPlugins: () => void;
  /** The AI panel can be opened: Textus AI is on, and so is its chat. */
  showAgentToggle: boolean;
  agentOpen: boolean;
  /** The AI panel's shortcut, as shown in the button's tooltip. */
  agentShortcut: string;
  onToggleAgent: () => void;
  /** The padlock beside a read-only document's title turns it off. */
  onToggleReadOnly: () => void;
  /** A phone's document menu (its ⋯), beside the AI toggle; none on a
   *  desktop, where the tabs and menus hold the document's actions. */
  documentMenu?: ReactNode;
}) {
  const { t, settings } = useSettings();
  const bar = useBarLayout({
    menuBarShown: settings.menuBarShown,
    titleRowShown: canUseWindows && settings.titleRowShown,
    // The H0 shell has no activity rail: the bar keeps the sidebar's own
    // button, which opens and closes the view column.
    rail: false,
    railOff: true,
    zen: !!menuChecks.zen,
  });
  const hasStatus = useSyncExternalStore(subscribeAnyStatus, anyStatus);
  // A phone's row is its tabs': no title over them.
  const phone = usePhoneLayout();
  // Too narrow for the menu bar's titles: the ☰ instead (window-controls.css),
  const header = useRef<HTMLElement>(null);
  // ...and while a tab row under the bar's end has no tab's room.
  useFitSteps(header, BAR_FOLDS, barRowsHaveRoom);
  return (
    <>
      <header ref={header} className="window-bar" data-tauri-drag-region>
        {bar.lead.map((item) => {
          switch (item) {
            case "lights":
              // The traffic lights' room, for the tabs to clear.
              return (
                <span
                  key={item}
                  className="window-bar-lead window-bar-lights"
                  aria-hidden
                />
              );
            case "menu-bar":
              return (
                <Fragment key={item}>
                  <MenuBar checks={menuChecks} />
                  {/* For a window too narrow for the titles. */}
                  <span className="window-menu-fallback">
                    <PaletteButton />
                  </span>
                </Fragment>
              );
            case "menu":
              return <PaletteButton key={item} />;
            case "sidebar-toggle":
              return (
                <Tooltip
                  key={item}
                  text={`${t.menuToggleSidebar} (${sidebarShortcut})`}
                >
                  <button
                    type="button"
                    className="window-bar-sidebar-toggle"
                    aria-pressed={sidebarOpen}
                    aria-label={t.menuToggleSidebar}
                    onClick={onToggleSidebar}
                  >
                    <SidebarToggleIcon />
                  </button>
                </Tooltip>
              );
          }
        })}
        <WindowTitle
          placed={bar.rows === 1 && !bar.lead.includes("menu-bar") && !phone}
          title={title}
          dirty={dirty}
          readOnly={!!menuChecks.readOnly}
          onToggleReadOnly={onToggleReadOnly}
        />
        <div className="window-bar-status">
          {hasStatus && (
            <Suspense fallback={null}>
              <PluginStatusItems />
            </Suspense>
          )}
          {/* Struck through while Textus AI is off; right-click pauses or
          turns it off. */}
          <Tooltip text={t.pluginsTitle}>
            <button
              type="button"
              className="window-bar-toggle window-bar-plugins"
              aria-label={t.pluginsTitle}
              onClick={onOpenPlugins}
            >
              <PluginsTabIcon />
            </button>
          </Tooltip>
          <AgentButtons aiOpen={agentOpen} onToggleAi={onToggleAgent} />
          <TextusAiButton
            className="window-bar-toggle"
            panelOpen={agentOpen}
            showPanel={showAgentToggle}
            shortcut={agentShortcut}
            onTogglePanel={onToggleAgent}
          />
          {documentMenu}
        </div>
        <WindowCaptionButtons />
      </header>
    </>
  );
}

/** The menu's replacement on the desktop: one search key that opens the
 *  command palette, which lists every menu item and command. */
function PaletteButton() {
  const { t } = useSettings();
  return (
    <Tooltip text={t.menuCommandPalette}>
      <button
        type="button"
        className="window-menu-button window-palette-button"
        aria-label={t.menuCommandPalette}
        onClick={() =>
          void import("../command-palette").then((m) => m.openCommandPalette())
        }
      >
        <SearchIcon />
      </button>
    </Tooltip>
  );
}

/** The document's name over its island, followed as the islands move
 *  (useTitleRoom): drawn on its own, so a divider dragged redraws only it. */
function WindowTitle({
  placed,
  title,
  dirty,
  readOnly,
  onToggleReadOnly,
}: {
  placed: boolean;
  title: string;
  dirty: boolean;
  readOnly: boolean;
  onToggleReadOnly: () => void;
}) {
  const { t } = useSettings();
  const titleRef = useTitleRoom(placed);
  // The unsaved dot leads the title, as a native edited title does.
  return (
    <span className="window-bar-title" ref={titleRef}>
      {dirty && (
        <Tooltip text={t.unsavedIndicator}>
          <span
            className="unsaved-dot"
            role="img"
            aria-label={t.unsavedIndicator}
          />
        </Tooltip>
      )}
      <span className="tx-truncate window-bar-title-text">{title}</span>
      {readOnly && (
        <Tooltip text={t.readOnlyLock}>
          <button
            type="button"
            className="window-bar-lock"
            aria-label={t.readOnlyLock}
            onClick={onToggleReadOnly}
          >
            <LockIcon />
          </button>
        </Tooltip>
      )}
    </span>
  );
}

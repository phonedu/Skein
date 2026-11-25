import { Suspense, useRef, useSyncExternalStore } from "react";
import { TextusAiOffNote } from "../../ai/TextusAiSwitch";
import { WindowConversation } from "../../ai/chat/panel/WindowConversation";
import { ChatHistoryMenu } from "../../ai/chat/ChatHistoryMenu";
import { reopenConversation } from "../../ai/chat/reopen-conversation";
import { useAgentPanel } from "../../ai/chat/panel/agent-panel";
import { CloseIcon, PlusIcon, ProjectIcon } from "../../engine/controls/icons";
import type { PresenceHandle } from "../../engine/motion/usePresence";
import type { Strings } from "../../i18n/strings";
import { useSettings } from "../../prefs/SettingsContext";
import {
  PluginListPane,
  PluginTabPane,
  ViewTitleActions,
} from "../../plugins/views/plugin-views";
import { PluginCatalogPane } from "../../plugins/views/PluginCatalogPane";
import {
  rightPanelRequest,
  subscribeRightPanelView,
} from "../../plugins/views/right-panel-view";
import "./right-panel.css";

/** The right column's two pages: the AI at the page's edge, and a plugin's
 *  list or view. */
export type RightPanelMode = "agent" | "plugin";

/**
 * The H0 shell's on-demand right column (340): Agent draws the window's
 * live conversation, the edge beside the document; Plugins hosts one of a
 * plugin's pages. It is the AI's home on a wide layout; a phone and a fold
 * show the AI and plugin pages full-screen instead.
 */
export function RightPanel({
  presence,
  mode,
  onClose,
  t,
}: {
  /** The column's exit: it stays mounted while it plays out. */
  presence: PresenceHandle;
  mode: RightPanelMode;
  onClose: () => void;
  t: Strings;
}) {
  const { settings } = useSettings();
  const panel = useAgentPanel();
  const newConversation = useRef<(() => void) | null>(null);
  const request = useSyncExternalStore(
    subscribeRightPanelView,
    rightPanelRequest,
  );
  const view = request.view;
  // The AI off, or its chat not yet open: the edge says so, as a tab does.
  const agent = mode === "agent";
  const closing = presence.state === "closing";
  return (
    <aside
      ref={presence.ref}
      className="right-panel"
      aria-label={t.agentPanelTitle}
      data-state={presence.state}
      inert={closing || undefined}
    >
      <div className="right-panel-head">
        <span className="right-panel-label tx-pane-title">
          {agent ? t.agentPanelTitle : (view?.title ?? t.pluginsTitle)}
        </span>
        {agent && settings.textusAi ? (
          <div className="right-panel-tools">
            <button
              type="button"
              className="tx-icon-button"
              aria-label={t.agentTabProject}
              aria-pressed={panel.tab === "memory"}
              onClick={() =>
                panel.setTab(panel.tab === "memory" ? "chat" : "memory")
              }
            >
              <ProjectIcon />
            </button>
            <ChatHistoryMenu
              buttonClassName="tx-icon-button"
              onReopen={(entry) => void reopenConversation(entry, t)}
            />
            <button
              type="button"
              className="tx-icon-button"
              aria-label={t.chatNewConversation}
              onClick={() => newConversation.current?.()}
            >
              <PlusIcon />
            </button>
          </div>
        ) : null}
        {/* A plugin's own buttons over its view ("view/title"). */}
        {!agent && view && view.kind !== "catalog" ? (
          <ViewTitleActions view={view.view} />
        ) : null}
        <button
          type="button"
          className="right-panel-close"
          aria-label={t.close}
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </div>
      {agent ? (
        <div className="right-panel-body">
          {settings.textusAi ? (
            <Suspense fallback={null}>
              <WindowConversation newSlot={newConversation} />
            </Suspense>
          ) : (
            <TextusAiOffNote className="agent-panel-placeholder" />
          )}
        </div>
      ) : view ? (
        <div className="right-panel-body">
          {view.kind === "catalog" ? (
            <PluginCatalogPane t={t} />
          ) : view.kind === "list" ? (
            <PluginListPane
              plugin={view.plugin}
              view={view.view}
              className="right-panel-list"
            />
          ) : (
            <PluginTabPane
              tabId={`right-panel:${view.plugin}:${view.view}`}
              plugin={view.plugin}
              view={view.view}
              kind="view"
              resource={view.resource}
              state={view.state}
            />
          )}
        </div>
      ) : null}
    </aside>
  );
}

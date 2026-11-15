import { CreateChat } from "../settings/pages/create-chat-lazy";
import { Suspense, useEffect, useState, useSyncExternalStore } from "react";
import { OPEN_CREATE_EVENT } from "../ai/chat/create-request";
import { lazyModule } from "../lazy/lazy-module";
import { lazyComponent } from "../lazy/lazy-component";
import {
  openExtensionsTab,
  openPluginPage,
} from "../settings/pages/extensions-tab";
import type { SettingsPanelProps } from "../settings/SettingsPanel";
import { Presence } from "../engine/motion/usePresence";
import { isIOSApp } from "../platform/capabilities";
import { SHOW_SIDEBAR_TAB_EVENT } from "../utils/events";
import {
  closeSettingsDialog,
  onSettingsDialogChange,
  OPEN_SETTINGS_PAGE_EVENT,
  pluginPageId,
  settingsDialogOpen,
  showSettingsDialog,
  type SettingsPageRequest,
} from "../settings/settings-nav";
import { pageOf, showPage, type PageRequest } from "./tabs/page-tabs";
import { placeOnArrival, tabInUse } from "../engine/layout/store";
import { moveTab } from "../engine/layout/ops";
import { panesOf } from "../engine/layout/tree";
import type { TabState } from "./tabs/useTabState";
import type { Strings } from "../i18n/strings";

/** The dialog's module: loaded the first time it opens, never at startup. */
const SettingsDialog = lazyComponent(
  lazyModule("settings-features", () => import("../features/settings")),
  (m) => m.SettingsHost,
);

/** Settings asked for from the AI's column: its new tab goes to an island
 *  of documents, not the AI's narrow one. */
function showSettings(tabs: TabState, to?: string, jump?: unknown): void {
  const isAi = (id: string) =>
    pageOf(tabs.tabsRef.current.find((tab) => tab.id === id)) === "ai";
  const fromAi = isAi(tabInUse());
  const made = showPage(tabs, "settings", to, undefined, jump);
  if (made && fromAi)
    placeOnArrival(made, (now) => {
      const home = now && panesOf(now.root).find((p) => !p.tabs.some(isAi));
      return (home && moveTab(now, made, home.id)) || now;
    });
}

/** Settings and the plugins' pages as tabs: the iPhone and iPad (ruling 3:
 *  the desktop has the dialog). */
const inTabs = isIOSApp;

/** The Create tab's page: its conversation, filling the tab. */
export function CreateTabPage({ t }: { t: Strings }) {
  return (
    <Suspense fallback={null}>
      <div className="create-tab">
        <CreateChat t={t} />
      </div>
    </Suspense>
  );
}

// A plugin's tab loads on first open.
const PluginTab = lazyComponent(
  lazyModule("plugin-tab", () => import("../settings/pages/PluginTab")),
  (m) => m.PluginTab,
);

// The iPad's Settings sheet loads on first open, warmed once the window is
// idle (the desktop's dialog is not warmed: it loads on its first open).
const SettingsPanel = lazyComponent(
  lazyModule("settings", () => import("../settings/SettingsPanel"), {
    warm: true,
  }),
  (m) => m.SettingsPanel,
);

/** Where the iPad's Settings sheet opens: a page, or "updates" - About,
 *  checking. */
type SettingsStart = "general" | "extensions" | "updates";

/**
 * Whether Settings is open, and at which page. Each request counts, so one
 * made while Settings is open goes to its page from wherever it was. The
 * desktop opens the dialog (ruling 1); the iPhone and iPad keep the sheet
 * over the window (ruling 3), and the plugins' and the Create tab's pages
 * - which the desktop does not have as sheets.
 */
export function useSettingsOpening(tabs: TabState) {
  const [sheet, setSheet] = useState<{
    open: SettingsStart | null;
    request: number;
  }>({ open: null, request: 0 });
  const request = (open: SettingsStart | null) =>
    setSheet((s) => ({ open, request: s.request + 1 }));
  const dialog = useSyncExternalStore(
    onSettingsDialogChange,
    settingsDialogOpen,
  );
  // A request for Create no open tab took: Extensions, on Create, which
  // takes it as it mounts.
  useEffect(() => {
    const open = () => {
      openExtensionsTab("create");
      // Making a theme, a plugin or a skill with the AI: a tab of its own
      // on the desktop; the iPad's Extensions page in its sheet.
      if (inTabs) request("extensions");
      else showPage(tabs, "create");
    };
    window.addEventListener(OPEN_CREATE_EVENT, open);
    // A page picked in the sidebar's list, or a search result there.
    const page = (e: Event) => {
      const { page, jump } = (e as CustomEvent<SettingsPageRequest>).detail;
      if (!inTabs) return showSettingsDialog(page, jump);
      showSettings(tabs, page, jump);
    };
    window.addEventListener(OPEN_SETTINGS_PAGE_EVENT, page);
    return () => {
      window.removeEventListener(OPEN_CREATE_EVENT, open);
      window.removeEventListener(OPEN_SETTINGS_PAGE_EVENT, page);
    };
  }, [tabs]);
  return {
    /** The open dialog's page, or null (desktop). */
    dialog,
    /** The iPhone's and iPad's sheet. */
    sheet,
    openSettings: () => {
      if (inTabs) return request("general");
      // Open: at the page it shows; shut: General.
      showSettingsDialog(dialog?.page ?? "general");
    },
    openUpdates: () => {
      if (inTabs) return request("updates");
      showSettingsDialog("about");
    },
    openPluginSettings: (id?: string) => {
      if (!inTabs)
        return id
          ? showSettingsDialog(pluginPageId(id))
          : window.dispatchEvent(
              new CustomEvent(SHOW_SIDEBAR_TAB_EVENT, { detail: "plugins" }),
            );
      // A plugin's page in its tab; the list itself is the sidebar's.
      if (id) openPluginPage(id);
      else openExtensionsTab("plugins");
      request("extensions");
    },
    close: () => (inTabs ? request(null) : closeSettingsDialog()),
  };
}

/** The iPad's Settings sheet, loaded the first time it opens. */
export function SettingsLayer({
  opening,
  ...props
}: Omit<SettingsPanelProps, "onClose" | "initialCategory"> & {
  opening: ReturnType<typeof useSettingsOpening>;
}) {
  const { sheet, close } = opening;
  return (
    // The longest exit is the phone's: the page going back down.
    <Presence show={sheet.open !== null}>
      {sheet.open && (
        <Suspense fallback={null}>
          <SettingsPanel
            key={sheet.request}
            {...props}
            onClose={close}
            initialCategory={sheet.open}
          />
        </Suspense>
      )}
    </Presence>
  );
}

/** The desktop's Settings dialog, over the window, from its first open. */
export function SettingsDialogLayer({
  opening,
  ...props
}: Omit<SettingsPanelProps, "onClose" | "initialCategory"> & {
  opening: ReturnType<typeof useSettingsOpening>;
}) {
  const { dialog, close } = opening;
  return (
    <Suspense fallback={null}>
      {dialog && (
        <SettingsDialog
          key={dialog.request}
          page={dialog.page}
          jump={dialog.jump ?? null}
          onClose={close}
          {...props}
        />
      )}
    </Suspense>
  );
}

/** A plugin's tab: the page of the plugin last asked for. */
export function PluginTabPage({
  request,
  t,
}: {
  request: PageRequest | null;
  t: Strings;
}) {
  return (
    <Suspense fallback={null}>
      <PluginTab t={t} id={request?.to ?? null} />
    </Suspense>
  );
}

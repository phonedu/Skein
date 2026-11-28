import {
  showQuickPick,
  type QuickPickItem,
} from "../../engine/controls/quick-pick-queue";
import { currentStrings } from "../../i18n/current";
import { runCommand, commands } from "../../registry/commands";
import { addedSidebarTabs } from "../../registry/sidebar-tabs";
import { getWindowAccess } from "../app-bridge";
import {
  pluginName,
  pluginsSnapshot,
  windowInfo,
} from "../store/plugin-records";
import { localize } from "../store/manifest";
import { openExtensionsTab } from "../../settings/pages/extensions-tab";
import { openSettingsPage } from "../../settings/settings-nav";
import { layoutMode } from "../../platform/layout-mode";
import { openRightPanelView } from "./right-panel-view";
import { openSidebarView } from "../../engine/layout/sidebar-view-request";

/**
 * The plugin entry: one search surface over the plugin pages a plugin
 * declares (its sidebar tabs and views) and its commands. On a desktop and
 * a tablet the top bar's button opens the left column's Plugins view; a
 * phone and a fold have no column to open, so the button's QuickPick is
 * their one way in.
 */
export interface Surface {
  label: string;
  description?: string;
  /** The plugin a page belongs to; none for a command. */
  plugin?: string;
  /** The page's id, for deduplicating the tab and manifest lists. */
  view?: string;
  run: () => void;
}

/** The right column exists on a desktop and a tablet; a phone and a fold
 *  open a plugin's page full-screen instead. */
function hasEdge(): boolean {
  const mode = layoutMode();
  return mode === "desktop" || mode === "tablet";
}

/** A plugin page: a list at the page's edge where there is one, else the
 *  page's own tab (or, on a phone, the page in front). */
export function openPluginPage(
  plugin: string,
  view: string,
  kind: "list" | "view",
  title: string,
): void {
  if (kind === "list" && hasEdge()) {
    openRightPanelView({ plugin, view, kind, title });
    return;
  }
  getWindowAccess()?.openPluginTab({
    plugin,
    view,
    kind,
    title,
  });
}

/** The pages the installed plugins declare, in the order the launcher and
 *  the right column's catalog show them. */
export function pluginPages(): Surface[] {
  const t = currentStrings();
  const snapshot = pluginsSnapshot();
  const language = windowInfo().language();
  const out: Surface[] = [];

  for (const tab of addedSidebarTabs()) {
    if (!tab.plugin) continue;
    const record = snapshot.records.find((r) => r.id === tab.plugin);
    const plugin = tab.plugin;
    const kind = tab.type === "webview" ? "view" : "list";
    out.push({
      label: tab.label(t),
      description: record ? pluginName(record) : plugin,
      plugin,
      view: tab.id,
      run: () => openPluginPage(plugin, tab.id, kind, tab.label(t)),
    });
  }

  for (const record of snapshot.records) {
    if (!record.manifest) continue;
    for (const view of record.manifest.contributes.views) {
      const title = localize(record.manifest, view.title, language);
      const kind = view.type === "list" ? "list" : "view";
      out.push({
        label: title,
        description: pluginName(record),
        plugin: record.id,
        view: view.id,
        run: () => openPluginPage(record.id, view.id, kind, title),
      });
    }
  }
  const seen = new Set<string>();
  return out.filter((page) => {
    const key = `${page.plugin}:${page.view}:${page.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The pages and commands the launcher lists, in its order: plugin pages
 *  first, then commands (one whose title is its plugin's page left out),
 *  then the Extensions page. */
export function pluginSurfaces(): Surface[] {
  const t = currentStrings();
  const pages = pluginPages();
  // A command whose title is one of its plugin's pages opens that same
  // page: the page answers, and the list says it once (the confirm
  // center, the review page).
  const pageLabels = new Map<string, Set<string>>();
  for (const page of pages) {
    if (!page.plugin) continue;
    const labels = pageLabels.get(page.plugin) ?? new Set<string>();
    labels.add(page.label);
    pageLabels.set(page.plugin, labels);
  }
  const commandOwner = new Map<string, string>();
  for (const record of pluginsSnapshot().records)
    for (const command of record.manifest?.contributes.commands ?? [])
      commandOwner.set(command.command, record.id);
  const out = [...pages];

  for (const command of commands()) {
    if (command.id.startsWith("textus.") || command.palette === false) continue;
    const owner = commandOwner.get(command.id);
    const title = command.title(t);
    if (owner && pageLabels.get(owner)?.has(title)) continue;
    out.push({
      label: title,
      run: () => void runCommand(command.id),
    });
  }

  out.push({
    label: t.extensionsTabPlugins,
    description: t.settingsTitle,
    run: () => {
      openExtensionsTab("plugins");
      openSettingsPage("extensions");
    },
  });
  return out;
}

/** The top bar's plugin button: on a desktop or tablet, the right
 *  column's catalog of every plugin page; elsewhere the QuickPick, where
 *  there is no column. */
export function openPluginCatalog(): void {
  if (hasEdge()) {
    openSidebarView("plugins");
    return;
  }
  void openPluginLauncher();
}

/** The QuickPick over the plugin's pages and commands, filtered as it is
 *  typed. */
export async function openPluginLauncher(): Promise<void> {
  const items: QuickPickItem[] = pluginSurfaces().map((surface) => ({
    label: surface.label,
    description: surface.description,
    value: surface,
  }));
  const picked = await showQuickPick(
    items,
    currentStrings().pluginLauncherPlaceholder,
  );
  if (picked) (picked as Surface).run();
}

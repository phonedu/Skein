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

/**
 * The plugin entry of the H0 shell: one search surface over the plugin
 * pages a plugin declares (its sidebar tabs and views) and its commands.
 * It replaces the old activity rail's plugin icons: nothing is permanent
 * but the top bar's button.
 */
interface Surface {
  label: string;
  description?: string;
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
function openPage(
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

function surfaces(): Surface[] {
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
      run: () => openPage(plugin, tab.id, kind, tab.label(t)),
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
        run: () => openPage(record.id, view.id, kind, title),
      });
    }
  }

  for (const command of commands()) {
    if (command.id.startsWith("textus.") || command.palette === false) continue;
    out.push({
      label: command.title(t),
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

/** The top bar's plugin button: a QuickPick over the plugin's pages and
 *  commands, filtered as it is typed. */
export async function openPluginLauncher(): Promise<void> {
  const items: QuickPickItem[] = surfaces().map((surface) => ({
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

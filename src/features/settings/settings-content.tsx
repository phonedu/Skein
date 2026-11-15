import type { ReactNode } from "react";
import { useSettings } from "../../prefs/SettingsContext";
import type { Strings } from "../../i18n/strings";
import type { FixedShortcutGroup } from "../../registry/fixed-shortcuts";
import type { SettingsPageDef } from "../../settings/settings-pages";
import { pageComponent } from "../../settings/builtin-pages";
import { pageProps, type ShortcutCommand } from "../../settings/pages/types";
import { GeneralPage } from "./pages/general";
import { AppearancePage } from "./pages/appearance";
import "./settings-content.css";

/**
 * The settings dialog's content column (spec Task 5): it hosts the open
 * page. General and Appearance are drawn here with the new rows (ruling 3);
 * every other page - built-in or a plugin's (ruling 5) - renders its
 * existing component unchanged, the transition rule. Mount with
 * `key={page.id}` so a page reopens fresh, like a request.
 */
export function SettingsContent(props: {
  t: Strings;
  page: SettingsPageDef;
  onOpenPage: (id: string) => void;
  /** Shortcuts pages: what ShortcutsPage needs, passed on by the wiring. */
  fixedShortcuts?: FixedShortcutGroup[];
  pluginCommands?: ShortcutCommand[];
}) {
  const { settings, setSettings } = useSettings();
  if (props.page.id === "general") {
    return <GeneralPage t={props.t} />;
  }
  if (props.page.id === "look-basic") {
    return <AppearancePage t={props.t} />;
  }
  const Page = pageComponent(props.page);
  return (
    <div className="settings-legacy-page">
      <Page
        {...pageProps({
          t: props.t,
          settings,
          setSettings,
          openPage: props.onOpenPage,
          fixedShortcuts: props.fixedShortcuts ?? [],
          pluginCommands: props.pluginCommands ?? [],
        })}
      />
    </div>
  );
}

/** A page section: the board's group heading over its rows. */
export function PageGroup(props: { title: string; children: ReactNode }) {
  return (
    <section className="settings-page-group">
      <h3 className="settings-page-group-title">{props.title}</h3>
      <div className="settings-page-group-body">{props.children}</div>
    </section>
  );
}

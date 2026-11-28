// The left column's Plugins view: every page the installed plugins
// declare, grouped by plugin. It is where the top bar's plugin button
// lands on a desktop and a tablet.
import { useSyncExternalStore } from "react";
import type { Strings } from "../../i18n/strings";
import { pluginPages, type Surface } from "./plugin-launcher";
import { pluginsSnapshot, subscribePlugins } from "../store/plugin-records";
import "./plugin-catalog.css";

export function PluginCatalogPane({ t }: { t: Strings }) {
  useSyncExternalStore(subscribePlugins, pluginsSnapshot);
  const pages = pluginPages();
  const groups = new Map<string, { title: string; pages: Surface[] }>();
  for (const page of pages) {
    const key = page.plugin ?? page.description ?? page.label;
    const group = groups.get(key) ?? {
      title: page.description ?? page.plugin ?? t.pluginsTitle,
      pages: [],
    };
    group.pages.push(page);
    groups.set(key, group);
  }
  return (
    <div className="plugin-catalog">
      {groups.size === 0 ? (
        <p className="tx-list-note">{t.pluginCatalogEmpty}</p>
      ) : (
        [...groups.entries()].map(([key, group]) => (
          <section className="plugin-catalog-group" key={key}>
            <h2 className="plugin-catalog-title">{group.title}</h2>
            {group.pages.map((page) => (
              <button
                type="button"
                className="plugin-catalog-row"
                key={`${key}:${page.label}`}
                onClick={page.run}
              >
                {page.label}
              </button>
            ))}
          </section>
        ))
      )}
    </div>
  );
}

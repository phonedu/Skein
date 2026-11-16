import { ChevronIcon } from "../../engine/controls/icons";
import { useState } from "react";
import type { Strings } from "../../i18n/strings";
import {
  SETTINGS_GROUPS,
  type SettingsPageDef,
  type SettingsGroupId,
} from "../../settings/settings-pages";
import "./settings-nav-column.css";

/**
 * The settings dialog's nav column (design board ui-d-settings, ruling 6):
 * the registry's pages, ungrouped ones first, then under their groups folded
 * until opened - the plugins' `group` semantics unchanged. Rows at the
 * board's 32 high; the active one on the surface with a hair ring.
 */
export function SettingsNavColumn(props: {
  t: Strings;
  pages: SettingsPageDef[];
  active: string;
  onOpen: (id: string) => void;
}) {
  const { t, pages, active, onOpen } = props;
  // The groups the user folded; the one holding the open page stays open,
  // so the page they are on is in sight (the old list did the same).
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  const ungrouped = pages.filter((p) => !p.group);
  const groups = Object.keys(SETTINGS_GROUPS) as SettingsGroupId[];
  const activeGroup = pages.find((p) => p.id === active)?.group;
  const row = (page: SettingsPageDef) => (
    <button
      key={page.id}
      type="button"
      className={"settings-nav-row" + (page.id === active ? " on" : "")}
      aria-current={page.id === active ? "page" : undefined}
      onClick={() => onOpen(page.id)}
    >
      {page.Icon ? <page.Icon className="settings-nav-ic" /> : null}
      <span className="settings-nav-label">{page.label(t)}</span>
    </button>
  );
  return (
    <nav className="settings-nav" aria-label={t.settingsTitle}>
      {ungrouped.map(row)}
      {groups.map((id) => {
        const group = SETTINGS_GROUPS[id];
        const inGroup = pages.filter((p) => p.group === id);
        if (!inGroup.length) return null;
        // Folded until opened - unless the group holds the open page, which
        // the old list also kept in sight. The user's own choice wins.
        const open = folded[id] ?? activeGroup === id;
        return (
          <div
            key={id}
            className="settings-nav-group"
            data-open={open || undefined}
          >
            <button
              type="button"
              className="settings-nav-group-head"
              aria-expanded={open}
              onClick={() => setFolded((f) => ({ ...f, [id]: !open }))}
            >
              <group.Icon className="settings-nav-ic" />
              <span className="settings-nav-label">{group.label(t)}</span>
              <ChevronIcon className="settings-nav-chev" />
            </button>
            {open ? inGroup.map(row) : null}
          </div>
        );
      })}
    </nav>
  );
}

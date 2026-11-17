import { ChevronRight } from "lucide-react";
import { lucide } from "../../engine/controls/icons";
import type { Strings } from "../../i18n/strings";
import {
  SETTINGS_GROUPS,
  type SettingsGroupId,
  type SettingsPageDef,
} from "../../settings/settings-pages";

const RowChevron = lucide(ChevronRight, 18);

/**
 * The phone's list of settings pages: grouped cards, every page in sight.
 * The desktop column folds its groups to save height; a phone scrolls, so a
 * fold would only hide pages behind an extra tap.
 */
export function SettingsPhoneList(props: {
  t: Strings;
  pages: SettingsPageDef[];
  onOpen: (id: string) => void;
}) {
  const { t, pages, onOpen } = props;
  const groups = Object.keys(SETTINGS_GROUPS) as SettingsGroupId[];
  const sections = [
    { id: "main", label: null, pages: pages.filter((p) => !p.group) },
    ...groups.map((id) => ({
      id,
      label: SETTINGS_GROUPS[id].label(t),
      pages: pages.filter((p) => p.group === id),
    })),
  ].filter((section) => section.pages.length > 0);

  return (
    <nav className="settings-phone-list" aria-label={t.settingsTitle}>
      {sections.map((section) => (
        <section key={section.id} className="settings-phone-section">
          {section.label ? (
            <h2 className="settings-phone-section-title">{section.label}</h2>
          ) : null}
          <div className="settings-phone-card">
            {section.pages.map((page) => (
              <button
                key={page.id}
                type="button"
                className="settings-phone-row"
                onClick={() => onOpen(page.id)}
              >
                {page.Icon ? (
                  <span className="settings-phone-row-ic" aria-hidden>
                    <page.Icon />
                  </span>
                ) : null}
                <span className="settings-phone-row-label">
                  {page.label(t)}
                </span>
                <RowChevron className="settings-phone-row-chev" />
              </button>
            ))}
          </div>
        </section>
      ))}
    </nav>
  );
}

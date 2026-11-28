import { ChevronRight } from "lucide-react";
import { lucide } from "../../engine/controls/icons";
import type { Strings } from "../../i18n/strings";
import {
  SETTINGS_GROUPS,
  type SettingsPageDef,
} from "../../settings/settings-pages";

const RowChevron = lucide(ChevronRight, 18);

/**
 * The list of settings pages: grouped cards, every page in sight. It is
 * the phone's list and, since the H0 shell, the desktop dialog's too - one
 * arrangement on every end. The cards follow the pages' own order: a run
 * of one group draws as one card, so the list reads in the order the
 * ledger sets, not in a group table's. The groups stay open: a phone
 * scrolls, and the dialog's column scrolls, so a fold would only hide
 * pages behind a tap.
 */
export function SettingsPhoneList(props: {
  t: Strings;
  pages: SettingsPageDef[];
  /** The page in the content column (the dialog's); the phone's list has
   *  none open, so no row is marked there. */
  active?: string;
  onOpen: (id: string) => void;
}) {
  const { t, pages, onOpen } = props;
  // Consecutive pages of one group share a card; ungrouped runs before
  // the groups sit under the list's caption, a run after them (Shortcuts,
  // Privacy, About) draws without one.
  const sections: {
    id: string;
    label: string | null;
    pages: SettingsPageDef[];
  }[] = [];
  for (const page of pages) {
    const id = page.group ?? "main";
    const last = sections[sections.length - 1];
    if (last && last.id === id) last.pages.push(page);
    else
      sections.push({
        id,
        label: page.group
          ? SETTINGS_GROUPS[page.group].label(t)
          : sections.length === 0
            ? t.navOptions
            : null,
        pages: [page],
      });
  }

  return (
    <nav className="settings-phone-list" aria-label={t.settingsTitle}>
      {sections.map((section, at) => (
        <section key={at} className="settings-phone-section">
          {section.label ? (
            <h2 className="settings-phone-section-title tx-section-label">
              {section.label}
            </h2>
          ) : null}
          <div className="settings-phone-card">
            {section.pages.map((page) => (
              <button
                key={page.id}
                type="button"
                className={
                  "settings-phone-row" + (page.id === props.active ? " on" : "")
                }
                aria-current={page.id === props.active ? "page" : undefined}
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

import type { Strings } from "../../../i18n/strings";
import { useSettings } from "../../../prefs/SettingsContext";
import { ProvidersSections } from "../../../settings/sections/providers";
import { PageGroup } from "../page-group";
// The providers' two-column layout: the stylesheet lives with the page it
// was drawn for.
import "../../../settings/pages/providers-page.css";

/**
 * Providers, in the new group shells: the list, then the picked provider's
 * sign-in and models. The sections are shared with the iPad sheet - only
 * the shell differs. Which provider each use takes is chosen on Writing
 * assist.
 */
export function ProvidersPage({ t }: { t: Strings }) {
  const { settings } = useSettings();
  return <ProvidersSections t={t} settings={settings} Group={PageGroup} />;
}

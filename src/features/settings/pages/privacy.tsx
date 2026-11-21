import type { Strings } from "../../../i18n/strings";
import { useSettings } from "../../../prefs/SettingsContext";
import { PrivacySections } from "../../../settings/sections/privacy";
import { PageGroup } from "../page-group";

/**
 * Privacy, in the new group shells: a switch per kind of local history,
 * plus a clear. The rows are shared with the iPad sheet - only the shell
 * differs.
 */
export function PrivacyPage({ t }: { t: Strings }) {
  const { settings, setSettings } = useSettings();
  return (
    <PrivacySections
      t={t}
      settings={settings}
      setSettings={setSettings}
      Group={PageGroup}
    />
  );
}

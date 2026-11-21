import type { Strings } from "../../../i18n/strings";
import type { FixedShortcutGroup } from "../../../registry/fixed-shortcuts";
import type { ShortcutCommand } from "../../../settings/pages/types";
import { useSettings } from "../../../prefs/SettingsContext";
import { ShortcutsSections } from "../../../settings/sections/shortcuts";
import { PageGroup } from "../page-group";

/**
 * Shortcuts, in the new group shells: the ones that can be changed, by
 * group - the plugins' commands last among them - then the fixed ones. The
 * groups are shared with the iPad sheet - only the shell differs.
 */
export function ShortcutsPage({
  t,
  fixedShortcuts,
  pluginCommands,
}: {
  t: Strings;
  fixedShortcuts: FixedShortcutGroup[];
  pluginCommands: ShortcutCommand[];
}) {
  const { settings, setSettings } = useSettings();
  return (
    <ShortcutsSections
      t={t}
      settings={settings}
      setSettings={setSettings}
      fixedShortcuts={fixedShortcuts}
      pluginCommands={pluginCommands}
      editorRows={[
        "commandPalette",
        "findReplace",
        "searchFiles",
        "nextTab",
        "previousTab",
      ]}
      Group={PageGroup}
    />
  );
}

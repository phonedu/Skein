import type { SettingsPageProps } from "./types";
import { SettingsGroup } from "./SettingsGroup";
import { ShortcutsSections } from "../sections/shortcuts";

/** Shortcuts: the ones that can be changed, by group - the plugins'
 *  commands last among them - then the fixed ones. */
export function ShortcutsPage(props: SettingsPageProps) {
  return (
    <ShortcutsSections
      {...props}
      editorRows={[
        "commandPalette",
        "findReplace",
        "searchFiles",
        "showFiles",
        "showOutline",
        "nextTab",
        "previousTab",
      ]}
      evenRows
      Group={SettingsGroup}
    />
  );
}

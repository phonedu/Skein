import type {
  HeadingAction,
  ShortcutAction,
} from "../../prefs/SettingsContext";
import type { ShortcutCommand } from "../pages/types";
import {
  CommandShortcutRow,
  ShortcutRow,
  FixedShortcutList,
} from "./shortcut-rows";
import { actionLabels, headingLabels } from "../../prefs/key-owner";
import type { SettingsPageProps } from "../pages/types";
import type { GroupShell } from "./group-shell";

/**
 * Shortcuts' groups, shared by the iPad sheet and the new dialog: the ones
 * that can be changed, by group - the plugins' commands last among them -
 * then the fixed ones. Only the shell and the editor group's rows differ.
 */
export function ShortcutsSections({
  t,
  settings,
  setSettings,
  fixedShortcuts,
  pluginCommands,
  editorRows,
  evenRows = false,
  Group,
}: Pick<
  SettingsPageProps,
  "t" | "settings" | "setSettings" | "fixedShortcuts" | "pluginCommands"
> & {
  /** The editor group's actions: the sheet still lists the side panels
   *  among them; the new dialog's rail has those. */
  editorRows: ShortcutAction[];
  evenRows?: boolean;
  Group: GroupShell;
}) {
  const labels = actionLabels(t);
  const keyOf = (command: ShortcutCommand) =>
    settings.commandShortcuts[command.id] ?? command.shortcut ?? "";
  return (
    <>
      {/* Most used first: finding, moving between tabs, the window's panels
          and modes, then the AI's keys. */}
      {(
        [
          [t.shortcutEditorGroupLabel, editorRows],
          [
            t.settingsViewGroup,
            [
              "toggleSidebar",
              "toggleAgentPanel",
              "toggleSplitView",
              "toggleSourceMode",
              "toggleTypewriterMode",
              "toggleZenMode",
              "splitEditor",
            ],
          ],
          [
            t.shortcutAiGroupLabel,
            [
              "toggleTextusAi",
              "triggerCompletion",
              "triggerGrammarCheck",
              "toggleFloatingChat",
            ],
          ],
        ] satisfies [string, ShortcutAction[]][]
      ).map(([title, rows]) => (
        <Group key={title} title={title} evenRows={evenRows}>
          {rows.map((action) => (
            <ShortcutRow
              key={action}
              label={labels[action]}
              action={action}
              shortcuts={settings.shortcuts}
              setSettings={setSettings}
              t={t}
              fixed={fixedShortcuts}
            />
          ))}
        </Group>
      ))}
      <Group title={t.shortcutHeadingsGroupLabel} evenRows={evenRows}>
        {Object.entries(headingLabels(t)).map(([action, label]) => (
          <ShortcutRow
            key={action}
            label={label}
            action={action as HeadingAction}
            shortcuts={settings.shortcuts}
            setSettings={setSettings}
            t={t}
            fixed={fixedShortcuts}
          />
        ))}
      </Group>
      {pluginCommands.length > 0 && (
        <Group title={t.menuPlugins} evenRows={evenRows}>
          {pluginCommands.map((command) => (
            <CommandShortcutRow
              key={command.id}
              label={command.title}
              command={command.id}
              fallback={command.shortcut}
              overrides={settings.commandShortcuts}
              setOverrides={(commandShortcuts) =>
                setSettings({ commandShortcuts })
              }
              others={pluginCommands
                .filter((other) => other.id !== command.id && keyOf(other))
                .map((other) => ({ label: other.title, combo: keyOf(other) }))}
              shortcuts={settings.shortcuts}
              t={t}
              fixed={fixedShortcuts}
            />
          ))}
        </Group>
      )}
      {fixedShortcuts.length > 0 && (
        <Group title={t.shortcutFixedGroupLabel} evenRows={evenRows}>
          <FixedShortcutList groups={fixedShortcuts} />
        </Group>
      )}
    </>
  );
}

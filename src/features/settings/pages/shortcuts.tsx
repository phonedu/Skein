import type { Strings } from "../../../i18n/strings";
import type { FixedShortcutGroup } from "../../../registry/fixed-shortcuts";
import type {
  HeadingAction,
  ShortcutAction,
} from "../../../prefs/SettingsContext";
import type { ShortcutCommand } from "../../../settings/pages/types";
import {
  CommandShortcutRow,
  ShortcutRow,
  FixedShortcutList,
} from "../../../settings/sections/shortcut-rows";
import { actionLabels, headingLabels } from "../../../prefs/key-owner";
import { useSettings } from "../../../prefs/SettingsContext";
import { PageGroup } from "../settings-content";

/**
 * Shortcuts, in the new group shells: the ones that can be changed, by
 * group - the plugins' commands last among them - then the fixed ones. The
 * capture rows and the fixed list keep their components for now - the
 * transition rule, repainted when their rows are.
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
  const labels = actionLabels(t);
  const keyOf = (command: ShortcutCommand) =>
    settings.commandShortcuts[command.id] ?? command.shortcut ?? "";
  return (
    <>
      {/* Most used first: finding, moving between tabs, the window's panels
          and modes, then the AI's keys. */}
      {(
        [
          [
            t.shortcutEditorGroupLabel,
            [
              "commandPalette",
              "findReplace",
              "searchFiles",
              "nextTab",
              "previousTab",
            ],
          ],
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
        <PageGroup key={title} title={title}>
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
        </PageGroup>
      ))}
      <PageGroup title={t.shortcutHeadingsGroupLabel}>
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
      </PageGroup>
      {pluginCommands.length > 0 && (
        <PageGroup title={t.menuPlugins}>
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
        </PageGroup>
      )}
      {fixedShortcuts.length > 0 && (
        <PageGroup title={t.shortcutFixedGroupLabel}>
          <FixedShortcutList groups={fixedShortcuts} />
        </PageGroup>
      )}
    </>
  );
}

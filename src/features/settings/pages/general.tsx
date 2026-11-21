import { useSettings } from "../../../prefs/SettingsContext";
import { LANGS, LANG_NAMES, type Lang } from "../../../i18n/strings";
import type { Strings } from "../../../i18n/strings";
import {
  canInstallCliCommand,
  canSetDefaultEditor,
  canUseWindows,
} from "../../../platform/capabilities";
import {
  CliCommandSection,
  DefaultEditorSection,
} from "../../../settings/sections/general";
import { BackgroundSection } from "../../../settings/sections/background";
import { PageGroup } from "../page-group";
import { SettingsRow } from "../settings-row";
import { SettingsSelect, SettingsSwitch } from "../settings-controls";

/**
 * General, drawn with the new rows: language,
 * start-up and close-last from the store; the file rows as switches; the
 * system sections keep their existing components for now - the transition
 * rule, repainted when their rows are.
 */
export function GeneralPage({ t }: { t: Strings }) {
  const { settings, setSettings } = useSettings();
  return (
    <>
      <PageGroup title={t.generalBasicsLabel}>
        <SettingsRow label={t.languageLabel}>
          <SettingsSelect
            value={settings.language}
            options={LANGS.map((lang) => ({
              value: lang,
              label: LANG_NAMES[lang],
            }))}
            onChange={(lang) => setSettings({ language: lang as Lang })}
          />
        </SettingsRow>
        {canUseWindows && (
          <>
            <SettingsRow label={t.startupOpenLabel}>
              <SettingsSelect
                value={
                  settings.restoreSessionOnStartup
                    ? "session"
                    : settings.startPageOnLaunch
                      ? "start"
                      : "blank"
                }
                options={[
                  { value: "session", label: t.startupOpenSession },
                  { value: "start", label: t.startupOpenStartPage },
                  { value: "blank", label: t.startupOpenBlank },
                ]}
                onChange={(value) =>
                  setSettings({
                    restoreSessionOnStartup: value === "session",
                    startPageOnLaunch: value === "start",
                  })
                }
              />
            </SettingsRow>
            <SettingsRow label={t.closeLastLabel}>
              <SettingsSelect
                value={settings.closeLastToStartPage ? "start" : "window"}
                options={[
                  { value: "window", label: t.closeLastWindow },
                  { value: "start", label: t.closeLastStartPage },
                ]}
                onChange={(value) =>
                  setSettings({ closeLastToStartPage: value === "start" })
                }
              />
            </SettingsRow>
          </>
        )}
      </PageGroup>

      {/* How documents reach the disk - used daily, so above the rarer
          groups. */}
      <PageGroup title={t.settingsFilesGroup}>
        <SettingsRow label={t.autosaveLabel}>
          <SettingsSwitch
            checked={settings.autosave}
            onChange={(on) => setSettings({ autosave: on })}
          />
        </SettingsRow>
        <SettingsRow label={t.autoSuggestFilenameLabel}>
          <SettingsSwitch
            checked={settings.autoSuggestFilename}
            onChange={(on) => setSettings({ autoSuggestFilename: on })}
          />
        </SettingsRow>
      </PageGroup>

      {/* A desktop's: the phone has no windows to close, no default editor
          and no terminal, so no group either. */}
      {(canUseWindows || canSetDefaultEditor || canInstallCliCommand) && (
        <PageGroup title={t.generalSystemLabel}>
          {canUseWindows && <BackgroundSection t={t} />}
          {canSetDefaultEditor && <DefaultEditorSection t={t} />}
          {canInstallCliCommand && <CliCommandSection t={t} />}
        </PageGroup>
      )}
    </>
  );
}

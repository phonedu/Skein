import { useSettings, type Settings } from "../../../prefs/SettingsContext";
import {
  UI_TEXT_SCALES,
  type ContentWidth,
  type UiTextScale,
} from "../../../prefs/SettingsContext";
import type { Strings } from "../../../i18n/strings";
import { appDrawsWindowFrame } from "../../../platform/window-chrome";
import { canUseWindows, isMobileApp } from "../../../platform/capabilities";
import { ThemeSection, ThemesTab } from "../../../settings/sections/theme";
import { useFileIconThemes } from "../../../plugins/contributions/file-icon-themes";
import { DocTextFold } from "../../../settings/sections/text-font";
import { PageGroup } from "../page-group";
import { SettingsRow } from "../settings-row";
import { SettingsSelect, SettingsSwitch } from "../settings-controls";

/** Appearance, drawn with the new rows: the theme section keeps its
 *  existing component for now (the transition rule); the interface scale,
 *  the document's text, the window layout and menu bar are new rows off the
 *  store. */
const SIZE_NAMES = {
  0.85: "uiTextSmall",
  1: "uiTextMedium",
  1.25: "uiTextLarge",
} as const satisfies Record<UiTextScale, keyof Strings>;

export function AppearancePage({ t }: { t: Strings }) {
  const { settings, setSettings } = useSettings();
  const iconThemes = useFileIconThemes();
  // A theme whose plugin is off shows as Default; the choice stays for
  // when it is back, as the phone's older Appearance page has it.
  const iconTheme = iconThemes.some((x) => x.id === settings.fileIconTheme)
    ? settings.fileIconTheme
    : "";
  return (
    <>
      <PageGroup title={t.navAppearance}>
        <ThemeSection t={t} />
        <SettingsRow label={t.uiTextScaleLabel}>
          <SettingsSelect
            value={String(settings.uiTextScale)}
            options={UI_TEXT_SCALES.map((scale) => ({
              value: String(scale),
              label: t[SIZE_NAMES[scale]],
            }))}
            onChange={(value) =>
              setSettings({ uiTextScale: Number(value) as UiTextScale })
            }
          />
        </SettingsRow>
        <SettingsRow label={t.fileIconThemeLabel}>
          <SettingsSelect
            value={iconTheme}
            options={[
              { value: "", label: t.fileIconThemeDefault },
              ...iconThemes.map((theme) => ({
                value: theme.id,
                label: theme.label,
              })),
            ]}
            onChange={(value) => setSettings({ fileIconTheme: value })}
          />
        </SettingsRow>
      </PageGroup>
      <PageGroup title={t.appearanceTextGroup}>
        <DocTextFold t={t} settings={settings} setSettings={setSettings} />
        <SettingsRow label={t.contentWidthLabel}>
          <SettingsSelect
            value={settings.contentWidth}
            options={[
              { value: "auto", label: t.contentWidthAuto },
              { value: "standard", label: t.contentWidthStandard },
              { value: "full", label: t.contentWidthFull },
            ]}
            onChange={(value) =>
              setSettings({ contentWidth: value as ContentWidth })
            }
          />
        </SettingsRow>
        <SettingsRow label={t.firstLineIndentLabel}>
          <SettingsSwitch
            checked={settings.firstLineIndent}
            onChange={(on) => setSettings({ firstLineIndent: on })}
          />
        </SettingsRow>
        {!isMobileApp && (
          <SettingsRow label={t.smoothCaretLabel}>
            <SettingsSwitch
              checked={settings.smoothCaret}
              onChange={(on) => setSettings({ smoothCaret: on })}
            />
          </SettingsRow>
        )}
      </PageGroup>
      <PageGroup title={t.windowLayoutGroup}>
        <SettingsRow label={t.layoutLabel}>
          <SettingsSelect
            value={settings.layout}
            options={[
              { value: "islands", label: t.layoutIslands },
              { value: "classic", label: t.layoutClassic },
            ]}
            onChange={(value) =>
              setSettings({ layout: value as Settings["layout"] })
            }
          />
        </SettingsRow>
        {canUseWindows && (
          <SettingsRow label={t.titleRowLabel}>
            <SettingsSwitch
              checked={settings.titleRowShown}
              onChange={(on) => setSettings({ titleRowShown: on })}
            />
          </SettingsRow>
        )}
        {appDrawsWindowFrame && (
          <SettingsRow label={t.menuBarLabel}>
            <SettingsSwitch
              checked={settings.menuBarShown}
              onChange={(on) => setSettings({ menuBarShown: on })}
            />
          </SettingsRow>
        )}
      </PageGroup>
      {/* The installed themes and the gallery, unchanged (the transition
          rule): the board repaints the page above, not its store. */}
      <ThemesTab t={t} />
    </>
  );
}

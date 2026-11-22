import { useSettings, type Settings } from "../../../prefs/SettingsContext";
import {
  UI_TEXT_SCALES,
  type UiTextScale,
} from "../../../prefs/SettingsContext";
import type { Strings } from "../../../i18n/strings";
import { appDrawsWindowFrame } from "../../../platform/window-chrome";
import { canUseWindows } from "../../../platform/capabilities";
import {
  ThemeSection,
  CustomCssRow,
  ThemesTab,
} from "../../../settings/sections/theme";
import { AdvancedFold } from "../../../settings/sections/controls";
import { PageGroup } from "../page-group";
import { SettingsRow } from "../settings-row";
import { SettingsSelect, SettingsSwitch } from "../settings-controls";

/** Appearance, drawn with the new rows: the theme
 *  section keeps its existing component for now (the transition rule); the
 *  interface scale, layout, rail, title row and menu bar are new rows off
 *  the store, one's own CSS under Advanced. */
const SIZE_NAMES = {
  0.85: "uiTextSmall",
  1: "uiTextMedium",
  1.25: "uiTextLarge",
} as const satisfies Record<UiTextScale, keyof Strings>;

export function AppearancePage({ t }: { t: Strings }) {
  const { settings, setSettings } = useSettings();
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
      <AdvancedFold t={t}>
        <CustomCssRow t={t} />
      </AdvancedFold>
      {/* The installed themes and the gallery, unchanged (the transition
          rule): the board repaints the page above, not its store. */}
      <ThemesTab t={t} />
    </>
  );
}

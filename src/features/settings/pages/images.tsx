import type { Strings } from "../../../i18n/strings";
import type { ImageAlign } from "../../../prefs/SettingsContext";
import { useSettings } from "../../../prefs/SettingsContext";
import { ImageStorageSection } from "../../../settings/sections/images";
import { PageGroup } from "../settings-content";
import { SettingsRow } from "../settings-row";
import { SettingsSelect } from "../settings-controls";

/**
 * Images, drawn with the new rows: how a picture on its own line sits; the
 * storage section keeps its existing component for now - the transition
 * rule, repainted when its rows are.
 */
export function ImagesPage({ t, docPath }: { t: Strings; docPath: string | null }) {
  const { settings, setSettings } = useSettings();
  return (
    <PageGroup title={t.imageStorageGroupLabel}>
      <SettingsRow label={t.imageAlignLabel}>
        <SettingsSelect
          value={settings.imageAlign}
          options={[
            { value: "center", label: t.imageAlignCenter },
            { value: "left", label: t.imageAlignLeft },
          ]}
          onChange={(value) => setSettings({ imageAlign: value as ImageAlign })}
        />
      </SettingsRow>
      <ImageStorageSection t={t} docPath={docPath} />
    </PageGroup>
  );
}

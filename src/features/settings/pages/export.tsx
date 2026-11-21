import type { Strings } from "../../../i18n/strings";
import { useSettings } from "../../../prefs/SettingsContext";
import {
  canExportPdf,
  canExportWithPandoc,
} from "../../../platform/capabilities";
import { isMacPlatform } from "../../../platform/os";
import { AdvancedFold } from "../../../settings/sections/controls";
import { ExportFileRow } from "../../../settings/sections/export-files";
import { PandocArgsRows } from "../../../settings/sections/pandoc-args";
import { PageGroup } from "../page-group";
import { SettingsRow } from "../settings-row";
import { SettingsSwitch } from "../settings-controls";

/**
 * Export, drawn with the new rows: PDF and Word, Pandoc's arguments under
 * Advanced. The file rows keep their components for now - the transition
 * rule, repainted when their rows are. No PDF export on the phone, so no
 * group there either.
 */
export function ExportPage({ t }: { t: Strings }) {
  const { settings, setSettings } = useSettings();
  return (
    <>
      {canExportPdf && (
        <PageGroup title={t.menuExport}>
          <SettingsRow label={t.pdfPageNumbersLabel}>
            <SettingsSwitch
              checked={settings.pdfPageNumbers}
              onChange={(on) => setSettings({ pdfPageNumbers: on })}
            />
          </SettingsRow>
          {isMacPlatform() && (
            <SettingsRow label={t.pdfLightColorsLabel}>
              <SettingsSwitch
                checked={settings.pdfLightColors}
                onChange={(on) => setSettings({ pdfLightColors: on })}
              />
            </SettingsRow>
          )}
          {canExportWithPandoc && (
            <>
              <ExportFileRow t={t} setting="docxReferenceDoc" />
              <SettingsRow label={t.exportTocLabel}>
                <SettingsSwitch
                  checked={settings.exportToc}
                  onChange={(on) => setSettings({ exportToc: on })}
                />
              </SettingsRow>
              <SettingsRow
                label={t.exportNumberHeadingsLabel}
                description={t.exportNumberHeadingsHelp}
              >
                <SettingsSwitch
                  checked={settings.exportNumberHeadings}
                  onChange={(on) => setSettings({ exportNumberHeadings: on })}
                />
              </SettingsRow>
              <ExportFileRow t={t} setting="exportBibliography" />
              {settings.exportBibliography && (
                <ExportFileRow t={t} setting="exportCsl" />
              )}
            </>
          )}
        </PageGroup>
      )}
      {canExportWithPandoc && (
        <AdvancedFold t={t}>
          <PandocArgsRows t={t} />
        </AdvancedFold>
      )}
    </>
  );
}

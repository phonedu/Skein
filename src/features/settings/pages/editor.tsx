import type { Strings } from "../../../i18n/strings";
import { useSettings } from "../../../prefs/SettingsContext";
import type {
  ColorSwatchMode,
  ContentWidth,
  DiagramEngine,
  EmbedDisplay,
} from "../../../prefs/SettingsContext";
import type { ViewMode } from "../../../prefs/settings-values";
import { AdvancedFold } from "../../../settings/sections/controls";
import { DocTextFold } from "../../../settings/sections/text-font";
import { PageGroup } from "../settings-content";
import { SettingsRow } from "../settings-row";
import { SettingsSelect, SettingsSwitch } from "../settings-controls";

/**
 * Editing, drawn with the new rows: how the text is set, the view a
 * document opens in, what Markdown shows and how typing behaves; the
 * document-text fold and the advanced fold keep their existing components
 * for now - the transition rule, repainted when their rows are.
 */
export function EditorPage({ t }: { t: Strings }) {
  const { settings, setSettings } = useSettings();
  return (
    <>
      {/* How the text is set. */}
      <PageGroup title={t.settingsTextGroup}>
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
        <SettingsRow label={t.emptyLineHintLabel}>
          <SettingsSwitch
            checked={settings.emptyLineHint}
            onChange={(on) => setSettings({ emptyLineHint: on })}
          />
        </SettingsRow>
        <DocTextFold t={t} settings={settings} setSettings={setSettings} />
      </PageGroup>
      {/* One view for every document in every window. */}
      <PageGroup title={t.settingsViewGroup}>
        <SettingsRow label={t.viewModeLabel} description={t.viewModeHelp}>
          <SettingsSelect
            value={settings.viewMode}
            options={[
              { value: "rich", label: t.viewModeRich },
              { value: "source", label: t.menuToggleSourceMode },
              { value: "split", label: t.menuToggleSplitView },
            ]}
            onChange={(value) => setSettings({ viewMode: value as ViewMode })}
          />
        </SettingsRow>
        <SettingsRow label={t.menuFormatBar}>
          <SettingsSwitch
            checked={settings.formatBar}
            onChange={(on) => setSettings({ formatBar: on })}
          />
        </SettingsRow>
        <SettingsRow
          label={t.zoomTogetherLabel}
          description={t.zoomTogetherHint}
        >
          <SettingsSwitch
            checked={settings.zoomTogether}
            onChange={(on) => setSettings({ zoomTogether: on })}
          />
        </SettingsRow>
        <SettingsRow label={t.menuToggleTypewriterMode}>
          <SettingsSwitch
            checked={settings.typewriterMode}
            onChange={(on) => setSettings({ typewriterMode: on })}
          />
        </SettingsRow>
      </PageGroup>
      {/* What the document shows, then how typing behaves. */}
      <PageGroup title={t.navMarkdown}>
        <SettingsRow label={t.enableMathLabel}>
          <SettingsSwitch
            checked={settings.enableMath}
            onChange={(on) => setSettings({ enableMath: on })}
          />
        </SettingsRow>
        <SettingsRow label={t.enableMermaidLabel}>
          <SettingsSwitch
            checked={settings.enableMermaid}
            onChange={(on) => setSettings({ enableMermaid: on })}
          />
        </SettingsRow>
        <SettingsRow label={t.codeLineNumbersLabel}>
          <SettingsSwitch
            checked={settings.codeLineNumbers}
            onChange={(on) => setSettings({ codeLineNumbers: on })}
          />
        </SettingsRow>
        <SettingsRow label={t.autoCloseBracketsLabel}>
          <SettingsSwitch
            checked={settings.autoCloseBrackets}
            onChange={(on) => setSettings({ autoCloseBrackets: on })}
          />
        </SettingsRow>
        <SettingsRow label={t.plainTextMenuLabel}>
          <SettingsSwitch
            checked={settings.plainTextMenu}
            onChange={(on) => setSettings({ plainTextMenu: on })}
          />
        </SettingsRow>
        <SettingsRow label={t.embedDisplayLabel}>
          <SettingsSelect
            value={settings.embedDisplay}
            options={[
              { value: "expand", label: t.embedDisplayExpand },
              { value: "card", label: t.embedDisplayCard },
            ]}
            onChange={(value) =>
              setSettings({ embedDisplay: value as EmbedDisplay })
            }
          />
        </SettingsRow>
      </PageGroup>
      {/* Rarely changed: how diagrams are drawn, colour swatches, and the
       ** and ` pairs. */}
      <AdvancedFold t={t}>
        {settings.enableMermaid && (
          <SettingsRow
            label={t.diagramEngineLabel}
            description={t.diagramEngineHint}
          >
            <SettingsSelect
              value={settings.diagramEngine}
              options={[
                { value: "mermaid", label: t.diagramEngineMermaid },
                { value: "pele", label: t.diagramEnginePele },
              ]}
              onChange={(value) =>
                setSettings({ diagramEngine: value as DiagramEngine })
              }
            />
          </SettingsRow>
        )}
        <SettingsRow label={t.colorSwatchesLabel}>
          <SettingsSelect
            value={settings.colorSwatches}
            options={[
              { value: "off", label: t.colorSwatchesOff },
              { value: "code", label: t.colorSwatchesCode },
              { value: "everywhere", label: t.colorSwatchesEverywhere },
            ]}
            onChange={(value) =>
              setSettings({ colorSwatches: value as ColorSwatchMode })
            }
          />
        </SettingsRow>
        <SettingsRow label={t.autoCloseMarksLabel}>
          <SettingsSwitch
            checked={settings.autoCloseMarks}
            onChange={(on) => setSettings({ autoCloseMarks: on })}
          />
        </SettingsRow>
      </AdvancedFold>
    </>
  );
}

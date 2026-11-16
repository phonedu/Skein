import type { Strings } from "../../../i18n/strings";
import { clearAllConversations } from "../../../ai/chat/chat-history";
import { drafts } from "../../../platform/ipc";
import { hasTextusAi, isDesktopApp } from "../../../platform/capabilities";
import { useSettings } from "../../../prefs/SettingsContext";
import { ClearRow } from "../../../settings/sections/privacy";
import { ToggleRow } from "../../../settings/sections/controls";
import { SettingsFileSection } from "../../../settings/sections/settings-file";
import { PageGroup } from "../settings-content";

/**
 * Privacy, in the new group shells: a switch per kind of local history,
 * plus a clear. The rows keep their components for now - the transition
 * rule, repainted when their rows are.
 */
export function PrivacyPage({ t }: { t: Strings }) {
  const { settings, setSettings } = useSettings();
  return (
    <>
      {hasTextusAi && (
        <PageGroup title={t.privacyChatHistoryLabel}>
          <ToggleRow
            label={t.privacyChatHistoryToggle}
            checked={settings.enableChatHistory}
            onChange={(v) => setSettings({ enableChatHistory: v })}
          />
          <ClearRow
            label={t.privacyClearChatHistory}
            warning={t.privacyChatHistoryClearHint}
            t={t}
            onClear={clearAllConversations}
          />
        </PageGroup>
      )}
      <PageGroup title={t.privacyDraftRecoveryLabel}>
        <ToggleRow
          label={t.privacyDraftRecoveryToggle}
          checked={settings.enableDraftRecovery}
          onChange={(v) => setSettings({ enableDraftRecovery: v })}
        />
        {/* Kept as drafts: only while drafts are kept at all. */}
        {settings.enableDraftRecovery && (
          <ToggleRow
            label={t.privacyKeepUnsavedToggle}
            help={t.privacyKeepUnsavedHelp}
            checked={settings.keepUnsavedOnClose}
            onChange={(v) => setSettings({ keepUnsavedOnClose: v })}
          />
        )}
        <ClearRow
          label={t.privacyClearDrafts}
          warning={t.privacyDraftRecoveryClearHint}
          t={t}
          onClear={() => drafts.clearAllDrafts()}
        />
      </PageGroup>
      {isDesktopApp && (
        <PageGroup title={t.settingsFileLabel}>
          <SettingsFileSection t={t} />
        </PageGroup>
      )}
    </>
  );
}

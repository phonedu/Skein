import { useEffect, useState, useSyncExternalStore } from "react";
import type { SettingsPageProps } from "../pages/types";
import type { GroupShell } from "./group-shell";
import { ToggleRow } from "./controls";
import {
  AgentSystemPromptSection,
  AgentWorkspaceRootSection,
  AgentWorkspaceSection,
} from "./agent";
import { BuiltinSkillsSection, OwnSkillsList, importSkill } from "./skills";
import { AvailableSkills } from "./market-skills";
import {
  catalogSnapshot,
  loadCatalog,
  subscribeCatalog,
} from "../../plugins/store/catalog";
import { explainError } from "../../utils/error-explain";
import {
  canPickFolder,
  canRevealInFileManager,
} from "../../platform/capabilities";

/**
 * Memory & Skills' sections, shared by the iPad sheet and the new dialog:
 * only the group shell around them differs, so the rows live once.
 */
export function MemorySections({
  t,
  settings,
  setSettings,
  indexing,
  onOpenFile,
  onFilesDeleted,
  onClose,
  Group,
}: Pick<
  SettingsPageProps,
  | "t"
  | "settings"
  | "setSettings"
  | "indexing"
  | "onOpenFile"
  | "onFilesDeleted"
  | "onClose"
> & { Group: GroupShell }) {
  const [error, setError] = useState<string | null>(null);
  const catalog = useSyncExternalStore(subscribeCatalog, catalogSnapshot);
  useEffect(() => {
    if (!indexing) void loadCatalog();
  }, [indexing]);
  return (
    <>
      <Group title={t.memoryGroup}>
        <ToggleRow
          label={t.rememberAutomaticallyLabel}
          help={t.rememberAutomaticallyHint}
          checked={settings.rememberAutomatically}
          onChange={(v) => setSettings({ rememberAutomatically: v })}
        />
        {canPickFolder && <AgentWorkspaceRootSection t={t} />}
        <AgentSystemPromptSection
          t={t}
          onOpenFile={onOpenFile}
          onClose={onClose}
        />
        {canRevealInFileManager && <AgentWorkspaceSection t={t} />}
      </Group>
      <Group
        title={t.navSkills}
        actions={
          <button
            type="button"
            className="tx-button text-button settings-inline-button"
            onClick={() =>
              void importSkill().then(
                () => setError(null),
                (err: unknown) => setError(explainError(err, t)),
              )
            }
          >
            {t.agentSkillsImport}
          </button>
        }
      >
        {error && (
          <div className="settings-error" role="alert">
            {error}
          </div>
        )}
        <BuiltinSkillsSection
          t={t}
          bare
          onOpenFile={onOpenFile}
          onFilesDeleted={onFilesDeleted}
          onClose={onClose}
        />
        <OwnSkillsList t={t} onFilesDeleted={onFilesDeleted} />
      </Group>
      <AvailableSkills t={t} catalog={catalog} query="" />
    </>
  );
}

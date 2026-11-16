import { useEffect, useState, useSyncExternalStore } from "react";
import type { Strings } from "../../../i18n/strings";
import { useSettings } from "../../../prefs/SettingsContext";
import {
  useSettingsIndexing,
} from "../../../settings/indexing";
import { ToggleRow } from "../../../settings/sections/controls";
import {
  AgentSystemPromptSection,
  AgentWorkspaceRootSection,
  AgentWorkspaceSection,
} from "../../../settings/sections/agent";
import {
  BuiltinSkillsSection,
  OwnSkillsList,
  importSkill,
} from "../../../settings/sections/skills";
import { AvailableSkills } from "../../../settings/sections/market-skills";
import {
  catalogSnapshot,
  loadCatalog,
  subscribeCatalog,
} from "../../../plugins/store/catalog";
import { explainError } from "../../../utils/error-explain";
import {
  canPickFolder,
  canRevealInFileManager,
} from "../../../platform/capabilities";
import { PageGroup } from "../settings-content";

/**
 * Memory & Skills, in the new group shells: what the AI knows of the
 * project and of the writer; the skills it has - each mode's built-in
 * ones, then one's own (import at the section's end); then the catalog's
 * to install. The rows and lists keep their components for now - the
 * transition rule, repainted when their rows are.
 */
export function MemoryPage({
  t,
  onClose,
  onOpenFile,
  onFilesDeleted,
}: {
  t: Strings;
  onClose?: () => void;
  onOpenFile?: (path: string) => void;
  onFilesDeleted?: (paths: string[]) => void;
}) {
  const { settings, setSettings } = useSettings();
  const indexing = useSettingsIndexing();
  const [error, setError] = useState<string | null>(null);
  const catalog = useSyncExternalStore(subscribeCatalog, catalogSnapshot);
  useEffect(() => {
    if (!indexing) void loadCatalog();
  }, [indexing]);
  const close = onClose ?? (() => {});
  const openFile = onOpenFile ?? (() => {});
  const filesDeleted = onFilesDeleted ?? (() => {});
  return (
    <>
      <PageGroup title={t.memoryGroup}>
        <ToggleRow
          label={t.rememberAutomaticallyLabel}
          help={t.rememberAutomaticallyHint}
          checked={settings.rememberAutomatically}
          onChange={(v) => setSettings({ rememberAutomatically: v })}
        />
        {canPickFolder && <AgentWorkspaceRootSection t={t} />}
        <AgentSystemPromptSection
          t={t}
          onOpenFile={openFile}
          onClose={close}
        />
        {canRevealInFileManager && <AgentWorkspaceSection t={t} />}
      </PageGroup>
      <PageGroup
        title={t.navSkills}
        actions={
          <button
            type="button"
            className="text-button settings-inline-button"
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
          onOpenFile={openFile}
          onFilesDeleted={filesDeleted}
          onClose={close}
        />
        <OwnSkillsList t={t} onFilesDeleted={filesDeleted} />
      </PageGroup>
      <AvailableSkills t={t} catalog={catalog} query="" />
    </>
  );
}

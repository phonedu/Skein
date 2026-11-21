import type { Strings } from "../../../i18n/strings";
import { useSettings } from "../../../prefs/SettingsContext";
import { useSettingsIndexing } from "../../../settings/indexing";
import { MemorySections } from "../../../settings/sections/memory";
import { PageGroup } from "../page-group";

/**
 * Memory & Skills, in the new group shells: what the AI knows of the
 * project and of the writer; the skills it has - each mode's built-in
 * ones, then one's own; then the catalog's to install. The rows and lists
 * keep their components for now - the transition rule.
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
  return (
    <MemorySections
      t={t}
      settings={settings}
      setSettings={setSettings}
      indexing={indexing}
      onOpenFile={onOpenFile ?? (() => {})}
      onFilesDeleted={onFilesDeleted ?? (() => {})}
      onClose={onClose ?? (() => {})}
      Group={PageGroup}
    />
  );
}

// The settings page, rebuilt on Base UI (docs/ryugi/specs/
// 2026-11-15-base-ui-settings-design.md). This module loads on first use -
// settings opens only from ⌘, , the rail's gear or the app menu - so none of
// it may be imported at startup: lazy.ts's dynamic import is the only way in.

/** Opens the settings dialog (Task 2 draws it; wiring in Task 7). */
export async function openSettingsDialog(): Promise<void> {}

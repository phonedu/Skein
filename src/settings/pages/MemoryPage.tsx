import type { SettingsPageProps } from "./types";
import { SettingsGroup } from "./SettingsGroup";
import { MemorySections } from "../sections/memory";

/**
 * Settings › Textus AI › Memory & Skills: what the AI knows of the project
 * and of the writer; the skills it has - each mode's built-in ones, then
 * one's own (import at the section's end); then the catalog's to install.
 */
export function MemoryPage(props: SettingsPageProps) {
  return <MemorySections {...props} Group={SettingsGroup} />;
}

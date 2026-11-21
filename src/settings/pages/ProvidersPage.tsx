import type { SettingsPageProps } from "./types";
import { SettingsGroup } from "./SettingsGroup";
import { ProvidersSections } from "../sections/providers";
import "./providers-page.css";

/**
 * Settings › Textus AI › Providers: every provider in a list - its logo,
 * a dot once it is set up - and beside it the one picked: how to sign in
 * or its key, its address, and its models. Which provider each use takes
 * is chosen on Writing assist; picking one here changes none of that.
 */
export function ProvidersPage({ t, settings }: SettingsPageProps) {
  return <ProvidersSections t={t} settings={settings} Group={SettingsGroup} />;
}

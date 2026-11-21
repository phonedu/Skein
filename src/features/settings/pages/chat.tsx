import type { Strings } from "../../../i18n/strings";
import { useSettings } from "../../../prefs/SettingsContext";
import { ChatSections } from "../../../settings/sections/chat";
import { PageGroup } from "../page-group";

/**
 * Writing assist, in the new group shells: the chat, writing assistance,
 * research writing, then the web search service and the network. The
 * sections are shared with the iPad sheet - only the shell differs.
 */
export function ChatPage({
  t,
  marginAvailable,
}: {
  t: Strings;
  marginAvailable: boolean;
}) {
  const { settings, setSettings } = useSettings();
  return (
    <ChatSections
      t={t}
      settings={settings}
      setSettings={setSettings}
      phone={false}
      marginAvailable={marginAvailable}
      Group={PageGroup}
    />
  );
}

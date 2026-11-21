import type { SettingsPageProps } from "./types";
import { SettingsGroup } from "./SettingsGroup";
import { ChatSections } from "../sections/chat";

/**
 * Settings › Textus AI › Writing assist, from what is used most to what is
 * set once: the chat, writing assistance, research writing, then the web
 * search service and the network.
 */
export function ChatWritingPage(props: SettingsPageProps) {
  return <ChatSections {...props} Group={SettingsGroup} />;
}

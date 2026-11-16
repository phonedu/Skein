import type { Strings } from "../../../i18n/strings";
import { McpSection } from "../../../settings/sections/mcp";
import { AcpAgentsSection } from "../../../settings/sections/acp-agents";

/**
 * External tools, without the legacy wrapper: the MCP servers that give
 * the AI more tools, and the ACP agents plugins bring. The sections keep
 * their own groups for now - the transition rule; they are shared with the
 * iPad's sheet, so their shells move when that one does.
 */
export function McpPage({ t }: { t: Strings }) {
  return <McpSection t={t} after={<AcpAgentsSection t={t} />} />;
}

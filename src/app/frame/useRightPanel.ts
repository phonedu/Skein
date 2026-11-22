import { useCallback, useEffect, useRef, useState } from "react";
import type { RightPanelMode } from "./RightPanel";
import {
  rightPanelRequest,
  subscribeRightPanelView,
} from "../../plugins/views/right-panel-view";
import { useSyncExternalStore } from "react";
import { usePresence } from "../../engine/motion/usePresence";

/**
 * The H0 shell's right column: where it exists (`wide`: a desktop window or
 * a tablet), its page (Agent or a plugin's), and the AI button's way in.
 * A plugin asking for its page opens the column on it; each request is
 * taken once, so choosing Agent afterwards stays chosen.
 */
export function useRightPanel(
  agentPanel: { open: boolean; setOpen: (open: boolean) => void },
  dockToggle: () => void,
  wide: boolean,
) {
  const [mode, setMode] = useState<RightPanelMode>("agent");
  const open = agentPanel.open && wide;
  // The column keeps its width while it plays out; the grid follows
  // `mounted`, not `open`, so the document takes the room once it is gone.
  const presence = usePresence(open);
  const request = useSyncExternalStore(
    subscribeRightPanelView,
    rightPanelRequest,
  );
  const takenRequest = useRef(0);
  const setAgentOpen = agentPanel.setOpen;
  useEffect(() => {
    if (!wide || !request.request || !request.view) return;
    if (takenRequest.current === request.request) return;
    takenRequest.current = request.request;
    setMode("plugin");
    setAgentOpen(true);
  }, [wide, request, setAgentOpen]);

  // The AI button: its page comes to the front, or the column closes. A
  // phone and a fold keep the dock's own behavior (a page tab).
  const toggleAgentPanel = useCallback(() => {
    if (!wide) {
      dockToggle();
      return;
    }
    if (agentPanel.open && mode === "agent") {
      agentPanel.setOpen(false);
      return;
    }
    setMode("agent");
    if (!agentPanel.open) agentPanel.setOpen(true);
  }, [wide, mode, agentPanel, dockToggle]);

  return {
    toggleAgentPanel,
    rightPanel: {
      /** The column shows, still while it plays its exit. */
      mounted: presence.mounted,
      presence,
      mode,
      setMode,
      close: () => agentPanel.setOpen(false),
    },
  };
}

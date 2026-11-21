// The window's edge reports and AI open state: one hook so App stays a
// wiring component, not a pile of effects.
import { usePanelsReport } from "../plugins/panels-state";
import { useTabsInBar } from "./islands/tabs-in-bar";
import { useWindowAi } from "./islands/useWindowAi";
import type { useWindowShell } from "./useWindowShell";

export function useAppChrome({
  shell,
  settings,
  showTabBar,
  zenMode,
}: {
  shell: ReturnType<typeof useWindowShell>;
  settings: Parameters<typeof useWindowAi>[0]["settings"];
  showTabBar: boolean;
  zenMode: boolean;
}) {
  const { panelOpen, panelMode, agentPanel } = shell.panels;
  usePanelsReport({
    sidebarOpen: panelOpen,
    sidebarTab: panelMode,
    aiOpen: agentPanel.open,
    zen: zenMode,
  });
  useWindowAi({
    tabs: shell.tabState,
    settings,
    shown: agentPanel.open,
    setShown: agentPanel.setOpen,
  });
  return useTabsInBar(zenMode, showTabBar);
}

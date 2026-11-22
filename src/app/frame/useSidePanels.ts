import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction,
} from "react";
import { usePhoneLayout } from "../../engine/controls/usePhoneLayout";
import { isPhoneLayout } from "../../platform/phone-layout";
import { usePresence } from "../../engine/motion/usePresence";
import { CLOSE_FIND_REPLACE_EVENT, sendAppEvent } from "../../utils/events";
import { useAgentDock } from "./useAgentDock";
import { usePushedSidebar } from "../../mobile/usePushedSidebar";
import { storeSidebarTab, storedSidebarTab } from "./sidebar-tab";
import { getUiState, setUiState } from "../../storage/ui-state";
import { useNarrowSidebar } from "./useNarrowSidebar";
import { useNarrowIslands } from "./useNarrowIslands";
import { useSidebarWidth } from "./sidebar-width";
import { useLayoutMode } from "../../engine/controls/useLayoutMode";
import { useRightPanel } from "./useRightPanel";

/** A sidebar tab's id. */
export type SidebarTabId = string;

/** The view column's two views: today's work, or the library. */
export type SidebarView = "today" | "files";

function subscribeWindowResize(onChange: () => void) {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

type SetOpen = Dispatch<SetStateAction<boolean>>;

/** Whether the sidebar is open. The H0 shell opens on two columns: it is
 *  open unless the user closed it (remembered). A phone's starts put away
 *  (the phone shell has its own home). */
function useSidebarOpen() {
  const [open, setOpen] = useState(
    () => !isPhoneLayout() && getUiState("sidebarOpen") !== false,
  );
  const toggleSidebar = useCallback(() => setOpen((v) => !v), []);
  return { open, setOpen, toggleSidebar };
}

/** Remembered as it opens and closes, but not on a phone, whose sidebar
 *  pushes the page aside (the find bar goes with it); back from a phone's
 *  layout (a fold opened out), the wide layout's own, as remembered. */
function useSidebarRemembered(phone: boolean, open: boolean, setOpen: SetOpen) {
  const wasPhone = useRef(phone);
  useEffect(() => {
    if (wasPhone.current && !phone)
      setOpen(getUiState("sidebarOpen") !== false);
    wasPhone.current = phone;
  }, [phone, setOpen]);
  useEffect(() => {
    if (!isPhoneLayout()) setUiState("sidebarOpen", open);
    else if (open) sendAppEvent(CLOSE_FIND_REPLACE_EVENT);
  }, [open]);
}

/** The sidebar steps aside when a desktop window is too narrow for it and
 *  the islands at their least; a phone's, pushed in by hand, is never put
 *  away for want of room. */
function useSidebarFit(phone: boolean, open: boolean, setOpen: SetOpen) {
  const windowWidth = useSyncExternalStore(subscribeWindowResize, () =>
    typeof window === "undefined" ? 0 : window.innerWidth,
  );
  const sidebarWidth = useSidebarWidth(windowWidth);
  const panelsFolded = useNarrowIslands(
    phone ? Infinity : windowWidth,
    sidebarWidth.width,
    open,
  );
  useNarrowSidebar(
    open,
    setOpen,
    phone ? Infinity : windowWidth,
    sidebarWidth.width,
    panelsFolded,
  );
  return { windowWidth, sidebarWidth };
}

/** The sidebar's tabs, and its way out: it plays out before its contents
 *  go, on the islands' clock (sidebar-frame.css). A tab's key brings that
 *  tab to the front, or puts the sidebar away when it already is. */
function useSidebarTabs(open: boolean) {
  const sidebarPresence = usePresence(open);
  const sidebarClosing = sidebarPresence.state === "closing";
  const [panelMode, setPanelMode] = useSidebarTab();
  return {
    sidebarPresence,
    sidebarClosing,
    panelMode,
    setPanelMode,
  };
}

/** Which of the column's two views, and the Files view's tab, both
 *  remembered; plus the column's exit, on the islands' clock. */
function useViewColumn(open: boolean) {
  const [sidebarView, setSidebarView] = useSidebarView();
  const { sidebarPresence, sidebarClosing, panelMode, setPanelMode } =
    useSidebarTabs(open);
  return {
    sidebarView,
    setSidebarView,
    sidebarPresence,
    sidebarClosing,
    panelMode,
    setPanelMode,
  };
}

/** A phone's push-in gestures, the wide layout's remembered state, and the
 *  width the column takes at this window. */
function useSidebarPlacement(
  phone: boolean,
  open: boolean,
  setOpen: SetOpen,
  activeTabId: string,
) {
  usePushedSidebar(phone, open, setOpen, activeTabId);
  useSidebarRemembered(phone, open, setOpen);
  return useSidebarFit(phone, open, setOpen);
}

/**
 * Layout state of the sidebar and the docked Agent panel. `aiOn` is Textus
 * AI's switch: off, the AI panel closes and its toggles do nothing. A new
 * tab in front pushes a phone's sidebar back.
 */
export function useSidePanels(aiOn: boolean, activeTabId: string) {
  const phone = usePhoneLayout();
  // Where the right column exists: a desktop's window, and a tablet's wide
  // layout. A phone and a fold show the AI and a plugin's pages full-screen.
  const layout = useLayoutMode();
  const wide = layout === "desktop" || layout === "tablet";
  const { open, setOpen, toggleSidebar } = useSidebarOpen();
  const { windowWidth, sidebarWidth } = useSidebarPlacement(
    phone,
    open,
    setOpen,
    activeTabId,
  );
  const {
    agentPanel,
    toggleAgentPanel: dockToggle,
    agentPresence,
    agentClosing,
  } = useAgentDock(aiOn, windowWidth, open ? sidebarWidth.width : 0);
  const {
    sidebarView,
    setSidebarView,
    sidebarPresence,
    sidebarClosing,
    panelMode,
    setPanelMode,
  } = useViewColumn(open);
  // The right column's page: the AI at the edge, or a plugin's list.
  const { toggleAgentPanel, rightPanel } = useRightPanel(
    agentPanel,
    dockToggle,
    wide,
  );

  // Short of a document: the edge lies over the page instead of taking a
  // column, so the document never narrows past what it can be read at.
  // 340 is the edge's width (right-panel.css); 480 the least a document
  // takes. A phone never gets the column at all.
  const rightOverlay =
    !phone &&
    rightPanel.mounted &&
    windowWidth -
      (open || sidebarPresence.mounted ? sidebarWidth.width : 0) -
      340 <
      480;

  // A menu's or a shortcut's way into the view column: a Files tab opens
  // the Files view at it; anything else (a plugin's old sidebar request)
  // lands on Files, where the plugin pages no longer live.
  const showSidebarTab = useCallback(
    (id: SidebarTabId) => {
      const fileIds = ["tree", "outline", "search"];
      const target = fileIds.includes(id) ? id : "tree";
      const shown = open && sidebarView === "files" && panelMode === target;
      setOpen(!shown);
      if (!shown) {
        setSidebarView("files");
        setPanelMode(target);
      }
    },
    [open, sidebarView, panelMode, setOpen, setPanelMode, setSidebarView],
  );

  return {
    showSidebarTab,
    sidebarView,
    setSidebarView,
    panelOpen: open,
    setPanelOpen: setOpen,
    toggleSidebar,
    sidebarWidth,
    agentPanel,
    rightPanel,
    rightOverlay,
    toggleAgentPanel,
    sidebarPresence,
    sidebarClosing,
    agentPresence,
    agentClosing,
    panelMode,
    setPanelMode,
  };
}

/** The view column's view, remembered; it opens on Today. */
function useSidebarView() {
  const [view, setView] = useState<SidebarView>(() =>
    getUiState("sidebarView") === "files" ? "files" : "today",
  );
  useEffect(() => {
    setUiState("sidebarView", view);
  }, [view]);
  return [view, setView] as const;
}

/** The sidebar's tab, remembered like its open state. */
function useSidebarTab() {
  const [panelMode, setPanelMode] = useState<SidebarTabId>(storedSidebarTab);
  useEffect(() => {
    storeSidebarTab(panelMode);
  }, [panelMode]);

  return [panelMode, setPanelMode] as const;
}

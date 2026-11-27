// Android's Back steps through the phone's pages instead of leaving the
// app: the AI page back to the document (the AI stays behind it for the
// button), a page back to the page it was opened from (a card's detail to
// the list, the list to the document it was opened over), the document to
// the library, and from the library on it is the system's. Registered
// once, so Settings - mounted over these while it is up - answers first.
import { useCallback, useEffect, useRef } from "react";
import { onBack } from "../mobile/back";
import type { PhoneSurface } from "./usePhoneSurfaces";

/** The window's one step back, shared by the bar's chevron and Android's
 *  Back; it answers true when it went back a page. */
export function useBackStep({
  phone,
  agentOpen,
  surface,
  openedFrom,
  tabExists,
  closeAgent,
  activateTab,
  toHome,
}: {
  phone: boolean;
  /** The AI page is in front, not merely open behind a document. */
  agentOpen: boolean;
  surface: PhoneSurface;
  /** The tab the page in front was opened from, when it has one. */
  openedFrom?: string | null;
  tabExists: (id: string) => boolean;
  closeAgent: () => void;
  activateTab: (id: string) => void;
  toHome: () => void;
}): () => boolean {
  const latest = useRef({
    agentOpen,
    surface,
    openedFrom,
    tabExists,
    closeAgent,
    activateTab,
    toHome,
  });
  latest.current = {
    agentOpen,
    surface,
    openedFrom,
    tabExists,
    closeAgent,
    activateTab,
    toHome,
  };
  const step = useCallback(() => {
    const now = latest.current;
    if (now.agentOpen) {
      now.closeAgent();
      return true;
    }
    if (now.surface === "today") return false;
    if (
      now.surface === "doc" &&
      now.openedFrom &&
      now.tabExists(now.openedFrom)
    ) {
      now.activateTab(now.openedFrom);
      return true;
    }
    now.toHome();
    return true;
  }, []);
  useEffect(() => {
    if (!phone) return;
    return onBack(step);
  }, [phone, step]);
  return step;
}

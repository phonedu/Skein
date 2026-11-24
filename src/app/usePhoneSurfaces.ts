import { useEffect, useRef, useState } from "react";
import { usePhoneLayout } from "../engine/controls/usePhoneLayout";
import { afterStartupRestore } from "../document/reload-tabs";

/** The phone's three surfaces: Today, the library, and the document (or a
 *  plugin page) in front. A desktop has none of them - its surfaces are
 *  the window's panels - and a phone has no tab strip, so this, not the
 *  tabs, is its navigation. */
export type PhoneSurface = "today" | "library" | "doc";

export function usePhoneSurfaces(
  activeView: unknown,
  activePath?: string | null,
) {
  const phone = usePhoneLayout();
  const [surface, setSurface] = useState<PhoneSurface>("today");
  // The launch brings its last documents back in front. On a phone that is
  // not a page the user opened: the app still starts on Today, with them
  // behind it. Only what comes to the front once the launch's restore has
  // finished (a plugin's capture, say) shows itself.
  const [launched, setLaunched] = useState(false);
  useEffect(() => {
    if (launched) return;
    return afterStartupRestore(() => setLaunched(true));
  }, [launched]);
  // The document and page in front, as last seen: a new one is a new page,
  // while the same one stays behind when the user goes back to Today.
  const lastPath = useRef<string | null>(activePath ?? null);
  const lastView = useRef<unknown>(activeView);
  useEffect(() => {
    if (!phone) {
      lastPath.current = activePath ?? null;
      lastView.current = activeView;
      return;
    }
    const pageChanged = !!activeView && activeView !== lastView.current;
    const docChanged =
      !activeView && !!activePath && activePath !== lastPath.current;
    if (launched && (pageChanged || docChanged)) setSurface("doc");
    lastPath.current = activePath ?? null;
    lastView.current = activeView;
  }, [phone, activeView, activePath, launched]);
  return {
    phone,
    surface,
    setSurface,
    today: phone && surface === "today",
    library: phone && surface === "library",
  };
}

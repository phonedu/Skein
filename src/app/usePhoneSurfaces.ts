import { useEffect, useRef, useState } from "react";
import { usePhoneLayout } from "../engine/controls/usePhoneLayout";

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
  // The document in front, as last seen: a new one is a new page, while the
  // same one stays behind when the user goes back to Today.
  const lastPath = useRef<string | null>(activePath ?? null);
  // A plugin page (or any page tab) opened from Today's More or the plugin
  // launcher becomes the surface in front. So does a document a plugin
  // opens for the user (a capture's new note) while Today is showing.
  useEffect(() => {
    if (!phone) {
      lastPath.current = activePath ?? null;
      return;
    }
    if (activeView) setSurface("doc");
    else if (activePath && activePath !== lastPath.current) setSurface("doc");
    lastPath.current = activePath ?? null;
  }, [phone, activeView, activePath]);
  return {
    phone,
    surface,
    setSurface,
    today: phone && surface === "today",
    library: phone && surface === "library",
  };
}

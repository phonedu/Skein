import { useEffect, useState } from "react";
import { usePhoneLayout } from "../engine/controls/usePhoneLayout";

/** The phone's three surfaces: Today, the library, and the document (or a
 *  plugin page) in front. A desktop has none of them - its surfaces are
 *  the window's panels - and a phone has no tab strip, so this, not the
 *  tabs, is its navigation. */
export type PhoneSurface = "today" | "library" | "doc";

export function usePhoneSurfaces(activeView: unknown) {
  const phone = usePhoneLayout();
  const [surface, setSurface] = useState<PhoneSurface>("today");
  // A plugin page (or any page tab) opened from Today's More or the plugin
  // launcher becomes the surface in front.
  useEffect(() => {
    if (phone && activeView) setSurface("doc");
  }, [phone, activeView]);
  return {
    phone,
    surface,
    setSurface,
    today: phone && surface === "today",
    library: phone && surface === "library",
  };
}

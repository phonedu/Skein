import { useEffect, useRef, useState } from "react";
import { usePhoneLayout } from "../engine/controls/usePhoneLayout";
import { afterStartupRestore } from "../document/reload-tabs";
import { takeWindowSession } from "../document/launch-window";

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
  // A file handed to the app as it starts (Open in Textus) is what the
  // launch is for: it shows, even though the launch's own restore does not.
  const [launchFile, setLaunchFile] = useState(false);
  useEffect(() => {
    let live = true;
    void takeWindowSession().then((taken) => {
      if (live && taken && taken.paths.length > 0) setLaunchFile(true);
    });
    return () => {
      live = false;
    };
  }, []);
  // The document and page in front, as last seen: a new one is a new page,
  // while the same one stays behind when the user goes back to Today.
  const lastPath = useRef<string | null>(activePath ?? null);
  const lastView = useRef<unknown>(activeView);
  // What the launch's restore put in front: shown if it turns out to be a
  // handed file, kept behind otherwise.
  const hidden = useRef(false);
  useEffect(() => {
    if (!phone) {
      lastPath.current = activePath ?? null;
      lastView.current = activeView;
      return;
    }
    const pageChanged = !!activeView && activeView !== lastView.current;
    const docChanged =
      !activeView && !!activePath && activePath !== lastPath.current;
    if (pageChanged || docChanged) {
      if (launched || launchFile) setSurface("doc");
      else hidden.current = true;
    }
    lastPath.current = activePath ?? null;
    lastView.current = activeView;
  }, [phone, activeView, activePath, launched, launchFile]);
  useEffect(() => {
    // Handed files arrive before the restore has finished learning what
    // they are: once known, the page the launch hid shows after all.
    if (!launchFile || !hidden.current) return;
    hidden.current = false;
    setSurface("doc");
  }, [launchFile]);
  return {
    phone,
    surface,
    setSurface,
    today: phone && surface === "today",
    library: phone && surface === "library",
  };
}

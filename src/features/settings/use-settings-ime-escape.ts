// The engine's Escape rule wins over the dialog's: an Escape that ends a
// compose belongs to the input method, never to the settings dialog.
import { useEffect } from "react";
import { isImeKeydown } from "../../utils/ime";

export function useSettingsImeEscape() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isImeKeydown(e)) e.stopPropagation();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, []);
}

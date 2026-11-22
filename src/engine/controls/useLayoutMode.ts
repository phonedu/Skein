import { useSyncExternalStore } from "react";
import {
  layoutMode,
  onLayoutMode,
  type LayoutMode,
} from "../../platform/layout-mode";

/** The shell the window takes now (platform/layout-mode.ts). */
export function useLayoutMode(): LayoutMode {
  return useSyncExternalStore(onLayoutMode, layoutMode, () => "desktop");
}

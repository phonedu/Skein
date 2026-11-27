import type { PhoneSurface } from "../app/usePhoneSurfaces";
import { isPhoneLayout } from "../platform/phone-layout";

/**
 * The phone's surface as it stands, for code outside React: a plugin page
 * opened from Today has no page to come back to, one opened from a page in
 * front comes back to it (ruling 68). Kept in step by usePhoneSurfaces.
 */
let surface: PhoneSurface = "today";

export function setPhoneSurfaceNow(next: PhoneSurface): void {
  surface = next;
}

/** Whether a page is in front: on a desktop the active tab always is; on a
 *  phone only in the doc surface - Today leaves its tab behind. */
export function pageInFrontNow(): boolean {
  return !isPhoneLayout() || surface === "doc";
}

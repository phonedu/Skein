// A plugin's status, under the phone library's search: the same text the
// window bar shows on a desktop, kept to one quiet row that opens Plugins.
import { useSyncExternalStore } from "react";
import {
  statusItemsSnapshot,
  subscribeStatusItems,
} from "../plugins/contributions/status-items";
import { openExtensionsTab } from "../settings/pages/extensions-tab";
import { openSettingsPage } from "../settings/settings-nav";

/** Settings › Extensions, on its Plugins tab, from the phone's home. */
export function openPhonePlugins() {
  openExtensionsTab("plugins");
  openSettingsPage("extensions");
}

export function PhonePluginStatus() {
  const items = useSyncExternalStore(subscribeStatusItems, statusItemsSnapshot);
  if (!items.length) return null;
  return (
    <button
      type="button"
      className="ph-sync"
      aria-label={items[0].text}
      onClick={openPhonePlugins}
    >
      <span className="ph-sync-dot" aria-hidden />
      <span className="ph-sync-text">{items[0].text}</span>
      <svg
        className="ph-sync-chev"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="m9 6 6 6-6 6" />
      </svg>
    </button>
  );
}

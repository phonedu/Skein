import { useEffect } from "react";
import { useAppDocumentsFolder } from "../platform/native-files";
import { rememberIOSDocument } from "../document/ios-recents";
import { PAUSE_FEATURES_THRESHOLD } from "../editor/large-doc";
import {
  makeBlankTab,
  tabIsDirty,
  tabTitle,
  type DocTab,
} from "../document/doc-tabs";
import type { Strings } from "../i18n/strings";

// A phone's library home has no document in front; the document plumbing
// (title, counts, saves) still wants one to read. A phantom blank answers
// them without entering the tab list, so App.tsx keeps rendering PhoneHome.
const NO_TAB = makeBlankTab();

/**
 * What the window shows about the document in front: the active tab, the
 * tree's folder with no document saved, and the window bar's readouts.
 */
export function useActiveDocument(
  tabs: DocTab[],
  activeTabId: string,
  t: Strings,
) {
  const activeTab =
    tabs.find((tab) => tab.id === activeTabId) ?? tabs[0] ?? NO_TAB;
  // With no file open the tree is empty, except on a phone/tablet, where
  // the app's Documents folder is home.
  const documentsFolder = useAppDocumentsFolder();
  useEffect(() => {
    void rememberIOSDocument(activeTab.path);
  }, [activeTab.path]);
  // A markdown-length proxy for the size the plugins check: close enough
  // for a status indicator.
  const featuresPaused = activeTab.content.length > PAUSE_FEATURES_THRESHOLD;
  const activeDirty = tabIsDirty(activeTab);
  const activeTitle = tabTitle(activeTab, t);

  return {
    activeTab,
    documentsFolder,
    featuresPaused,
    activeDirty,
    activeTitle,
  };
}

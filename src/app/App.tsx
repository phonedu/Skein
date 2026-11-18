import { provideAiFileMarks } from "../ai/revision/file-marks";
import { useTabsInBar } from "./islands/tabs-in-bar";
import { tabTitle } from "../document/doc-tabs";
import { useWindowAi } from "./islands/useWindowAi";
import { conversationIn } from "./islands/ai-tabs";
import { ConventionsCard } from "./ConventionsCard";
import { CornerStacks } from "../engine/controls/CornerToast";
import { Suspense, useState } from "react";
import { AppDialogHost } from "../engine/controls/app-dialog";
import { WindowBar } from "./frame/WindowBar";
import { hasDocumentsList } from "../platform/capabilities";
import {
  CreateTabPage,
  PluginTabPage,
  SettingsDialogLayer,
  SettingsLayer,
} from "./SettingsLayer";
import {
  PageTabProvider,
  type AppPage,
  type PageRequest,
} from "./tabs/page-tabs";
import { usePhoneLayout } from "../engine/controls/usePhoneLayout";
import { useSettings } from "../prefs/SettingsContext";
import { formatCombo } from "../utils/shortcuts";
import { fixedShortcutGroups } from "../registry/fixed-shortcuts";
import { commands } from "../registry/commands";
import { platformName } from "../platform/window-chrome";
import { Presence } from "../engine/motion/usePresence";
import { AgentPanelProvider } from "../ai/chat/panel/agent-panel";
import { aiFeatures } from "../prefs/ai-features";
import { useWindowShell } from "./useWindowShell";
import { useWindowDocuments } from "./useWindowDocuments";
import { useWindowWiring } from "./useWindowWiring";
import { Sidebar } from "./frame/Sidebar";
import { DocumentIslands } from "./islands/DocumentIslands";
import { ClosePrompt } from "./ClosePrompt";
import { DraftRestoredToast, WordImportNotice, ZenExit } from "./AppNotices";
import { OnboardingLayers } from "./OnboardingLayers";
import { QuickPickSlot } from "../engine/controls/QuickPickSlot";
import { PluginFormSlot } from "../plugins/views/PluginFormSlot";
import { FloatingViewsHost } from "../plugins/views/floating-views-host";
import { NoticeHost } from "../engine/controls/notices";
import "../plugins/plugins.css";
import "./App.css";
import { ReportProblemHost } from "./report/report-open";
import { lazyModule } from "../lazy/lazy-module";
import { lazyComponent } from "../lazy/lazy-component";
import { usePanelsReport } from "../plugins/panels-state";

// The folder's rows show what Textus AI changed in their files.
provideAiFileMarks();

// The phone's own parts load on the phone, not with every desktop window.
// An AI tab and the plugin suggestion card: drawn later than the window's
// first frame, loaded while it is idle.
const AiTab = lazyComponent(
  lazyModule("ai-tab", () => import("./islands/AiTab"), { warm: true }),
  (m) => m.AiTab,
);
const SuggestCard = lazyComponent(
  lazyModule("suggest-card", () => import("./SuggestCard"), { warm: true }),
  (m) => m.SuggestCard,
);

const phoneParts = lazyModule(
  "phone-parts",
  () => import("../mobile/phone-parts"),
);
const DocumentList = lazyComponent(phoneParts, (m) => m.DocumentList);
const PhoneHome = lazyComponent(phoneParts, (m) => m.PhoneHome);
const PhoneEditorBar = lazyComponent(phoneParts, (m) => m.PhoneEditorBar);

/**
 * One window: its tabs, the panels around them, and the prompts and notices
 * over them. The hooks run in a fixed order so their effects keep theirs.
 */
function App() {
  const { t, settings, setSettings } = useSettings();
  const shell = useWindowShell({ settings, setSettings });
  const docs = useWindowDocuments({ shell, settings, t });
  const wiring = useWindowWiring({ shell, docs, settings, setSettings, t });
  const phone = usePhoneLayout();
  // The phone's two surfaces: the library home and the document in front.
  // A desktop has no such state - its surfaces are the window's panels -
  // and a phone has no tab strip, so this, not the tabs, is its navigation.
  const [phoneView, setPhoneView] = useState<"home" | "doc">("home");
  const phoneHome = phone && phoneView === "home";

  const { tutorial, settingsOpening, pendingClose } = shell;
  const { draftsRestoredCount, setDraftsRestoredCount, wordImported } = shell;
  const { tabs, activeTabId, setActiveTabId, addBlankTab } = shell.tabState;
  const { panelOpen, setPanelOpen, toggleSidebar, sidebarWidth } = shell.panels;
  const { agentPanel, toggleAgentPanel } = shell.panels;
  const { sidebarPresence, sidebarClosing, agentPresence } = shell.panels;
  const { panelMode, setPanelMode } = shell.panels;
  const { activeTab, activeTitle, activeDirty } = docs;
  const { openFolder, openFile, openFileDialog, handleChange } = docs;
  const { searchFiles } = docs;
  const { searchFocusRequest, clearSearchFocusRequest } = docs;
  const { showTabBar, requestCloseTab, handleTabDetach, dragHoverPreview } =
    docs;
  const { moveTabToNewWindow, toggleReadOnly } = docs;
  const { zenMode, setZenMode } = docs;
  // Zen puts the sidebar away as a close does, on the window's clock.
  const sidebarShown = panelOpen && !zenMode;
  const { menuChecks, entryMoved, skillFilesDeleted } = wiring;
  const { documentsOpen, setDocumentsOpen, openFromDocuments } = wiring;
  const { documentRenamed, documentDeleted } = wiring;
  const { closeSaving, closeDiscarding, cancelClose, closePrompt } =
    wiring.close;
  usePanelsReport({
    sidebarOpen: panelOpen,
    sidebarTab: panelMode,
    aiOpen: agentPanel.open,
    zen: zenMode,
  });

  useWindowAi({
    tabs: shell.tabState,
    settings,
    shown: agentPanel.open,
    setShown: agentPanel.setOpen,
  });

  // Whether the documents lie on islands: their tabs in the window bar's
  // row (or the row under a bar of its own), or one sheet alone under the
  // title's row - else a clean sheet (Zen), or the phone's own bar.
  const tabsInBar = useTabsInBar(zenMode, showTabBar);
  const tabRow = tabsInBar || !zenMode ? "bar" : undefined;

  // What Settings needs, as the desktop's dialog or the iPad's sheet.
  const settingsProps = {
    onOpenFile: (path: string) => void openFile(path),
    onFilesDeleted: skillFilesDeleted,
    docPath: activeTab.path,
    fixedShortcuts: fixedShortcutGroups(t, platformName()),
    pluginCommands: commands()
      // Textus's own (Save, Close Tab) have their keys under File.
      .filter((c) => !c.id.startsWith("textus."))
      .map((c) => ({ id: c.id, title: c.title(t), shortcut: c.shortcut })),
  };
  // Settings is the dialog since the Base UI pass; a tab restored from before
  // it (the layout saves paths) has nothing to draw.
  const renderPage = (page: AppPage, request: PageRequest | null) =>
    page === "ai" ? (
      <AiTab conversation={conversationIn(request)} />
    ) : page === "settings" ? null : page === "create" ? (
      <CreateTabPage t={t} />
    ) : (
      <PluginTabPage request={request} t={t} />
    );

  return (
    <PageTabProvider render={renderPage}>
      <AgentPanelProvider
        // The conversation stays in the panel while it plays its exit.
        open={agentPresence.mounted}
        setOpen={agentPanel.setOpen}
        tab={agentPanel.tab}
        setTab={agentPanel.setTab}
      >
        <div
          className="app-shell"
          // The layout's switches for the styles (layout/layout*.css): floating islands or classic, and the tabs in the
          // window bar's row, in a row of their own under the menu bar, or
          // none.
          data-tabs={tabRow}
          // Its column open: the grid and the rail's edge follow the model.
          data-sidebar={sidebarShown ? "open" : undefined}
          // A format bar down the right edge: the page's readouts clear it.
          data-format-bar={
            settings.formatBar && settings.formatBarSide === "right" && !phone
              ? "right"
              : undefined
          }
          // The sidebar's dragged width; a phone's is its stylesheet's.
          style={
            phone
              ? undefined
              : ({
                  "--sidebar-width": `${sidebarWidth.width}px`,
                } as React.CSSProperties)
          }
        >
          {/* The phone's pages carry their own top rows - the home's
             (PhoneHome's) and the document page's (PhoneEditorBar) - so the
             window bar, whose menu and tabs belong to the desktop, stays
             out of a phone entirely. */}
          {phone ? (
            !phoneHome && (
              <PhoneEditorBar
                t={t}
                title={activeTitle}
                showAgent={aiFeatures(settings, tutorial.active).chat}
                agentOpen={agentPanel.open}
                agentShortcut={formatCombo(settings.shortcuts.toggleAgentPanel)}
                onBack={() => setPhoneView("home")}
                onToggleAgent={toggleAgentPanel}
              />
            )
          ) : (
            <WindowBar
              menuChecks={menuChecks}
              title={activeTitle}
              dirty={activeDirty}
              sidebarOpen={panelOpen}
              sidebarShortcut={formatCombo(settings.shortcuts.toggleSidebar)}
              onToggleSidebar={toggleSidebar}
              showAgentToggle={aiFeatures(settings, tutorial.active).chat}
              agentOpen={agentPanel.open}
              agentShortcut={formatCombo(settings.shortcuts.toggleAgentPanel)}
              onToggleAgent={toggleAgentPanel}
              onToggleReadOnly={() => toggleReadOnly()}
            />
          )}
          {/* No sidebar on a phone: the library home is the navigation, and
             a panel beside the document is the desktop's shape. */}
          {!phone && (
            <Sidebar
              open={sidebarShown}
              presence={sidebarPresence}
              closing={sidebarClosing}
              mode={panelMode}
              onModeChange={(id) =>
                id === "search" ? searchFiles() : setPanelMode(id)
              }
              width={sidebarWidth}
              openFolder={openFolder}
              activePath={activeTab.path}
              activeContent={activeTab.content}
              activeTabId={activeTab.id}
              onToggle={toggleSidebar}
              onClose={() => setPanelOpen(false)}
              onOpenFile={(path, how, line) => {
                void openFile(path, {
                  ...(how === "beside"
                    ? { where: "beside" }
                    : { preview: how === "preview" }),
                  ...(line !== undefined ? { place: { line } } : {}),
                });
              }}
              onEntryMoved={entryMoved}
              searchFocusRequest={searchFocusRequest}
              onSearchFocusHandled={clearSearchFocusRequest}
              t={t}
            />
          )}

          {phoneHome ? (
            <PhoneHome
              t={t}
              openFolder={openFolder}
              activePath={activeTab.path}
              onOpenFile={(path) => {
                void openFile(path);
                setPhoneView("doc");
              }}
              onNewFile={() => {
                addBlankTab();
                setPhoneView("doc");
              }}
              onEntryMoved={entryMoved}
            />
          ) : (
            <DocumentIslands
              tabs={tabs}
              activeTabId={activeTabId}
              showTabBar={phone ? false : showTabBar}
              onActivate={setActiveTabId}
              onClose={requestCloseTab}
              onAdd={addBlankTab}
              onDetach={handleTabDetach}
              onMoveToNewWindow={moveTabToNewWindow}
              onToggleReadOnly={toggleReadOnly}
              onKeep={(id) => shell.tabState.updateTab(id, { preview: false })}
              previewTab={dragHoverPreview}
              onChange={handleChange}
              typewriter={settings.typewriterMode}
              formatBar={settings.formatBar ? settings.formatBarSide : null}
              tour={
                tutorial.active && tutorial.tabId
                  ? {
                      tabId: tutorial.tabId,
                      ai: tutorial.practiceAi,
                      mode: tutorial.agentMode,
                    }
                  : null
              }
              zen={zenMode}
              lang={settings.language}
              t={t}
            />
          )}

          <SettingsLayer opening={settingsOpening} {...settingsProps} />
          <SettingsDialogLayer opening={settingsOpening} {...settingsProps} />

          <ClosePrompt
            open={!!pendingClose}
            phone={phone}
            dialogProps={closePrompt}
            onSave={() => void closeSaving()}
            onDiscard={() => void closeDiscarding()}
            onCancel={cancelClose}
            name={
              pendingClose?.kind === "tab"
                ? tabTitle(
                    tabs.find((tab) => tab.id === pendingClose.tabId) ??
                      tabs[0],
                    t,
                  )
                : null
            }
            t={t}
          />

          <Presence show={hasDocumentsList && documentsOpen}>
            {hasDocumentsList && documentsOpen && (
              <Suspense fallback={null}>
                <DocumentList
                  activePath={activeTab.path}
                  onClose={() => setDocumentsOpen(false)}
                  onOpen={openFromDocuments}
                  onRenamed={documentRenamed}
                  onDeleted={documentDeleted}
                  onOpenOther={() => {
                    setDocumentsOpen(false);
                    void openFileDialog();
                  }}
                />
              </Suspense>
            )}
          </Presence>
          <AppDialogHost okLabel={t.dialogOk} />
          <ReportProblemHost t={t} settings={settings} />
          <QuickPickSlot
            emptyLabel={t.pluginQuickPickEmpty}
            okLabel={t.pluginOk}
          />
          <PluginFormSlot />
          <FloatingViewsHost />
          <NoticeHost />

          {zenMode && <ZenExit onExit={() => setZenMode(false)} t={t} />}

          <CornerStacks
            start={
              <>
                <WordImportNotice
                  path={wordImported.path}
                  onDismiss={wordImported.dismiss}
                  t={t}
                />
                <DraftRestoredToast
                  count={draftsRestoredCount}
                  onDismiss={() => setDraftsRestoredCount(0)}
                  t={t}
                />
              </>
            }
            end={
              <>
                <SuggestCard t={t} />
                <ConventionsCard
                  path={activeTab.path}
                  settings={settings}
                  t={t}
                />
              </>
            }
          />

          <OnboardingLayers
            tutorial={tutorial}
            settings={settings}
            setSettings={setSettings}
            t={t}
          />
        </div>
      </AgentPanelProvider>
    </PageTabProvider>
  );
}

export default App;

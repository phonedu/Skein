import { provideAiFileMarks } from "../ai/revision/file-marks";
import { setPaletteChecks } from "./command-palette-checks";
import { isPlainDraft, tabTitle } from "../document/doc-tabs";
import { conversationIn } from "./islands/ai-tabs";
import { ConventionsCard } from "./ConventionsCard";
import { CornerStacks } from "../engine/controls/CornerToast";
import { Suspense, useCallback, useEffect } from "react";
import { AppDialogHost } from "../engine/controls/app-dialog";
import { WindowBar } from "./frame/WindowBar";
import { hasDocumentsList } from "../platform/capabilities";
import { parentDir, relativePath } from "../utils/path";
import {
  CreateTabPage,
  PluginTabPage,
  SettingsDialogLayer,
  SettingsLayer,
} from "./SettingsLayer";
import {
  PageTabProvider,
  pageOf,
  type AppPage,
  type PageRequest,
} from "./tabs/page-tabs";
import { usePhoneSurfaces } from "./usePhoneSurfaces";
import { useSettings } from "../prefs/SettingsContext";
import { formatCombo } from "../utils/shortcuts";
import { fixedShortcutGroups } from "../registry/fixed-shortcuts";
import { commands, runCommand } from "../registry/commands";
import { platformName } from "../platform/window-chrome";
import { Presence } from "../engine/motion/usePresence";
import { AgentPanelProvider } from "../ai/chat/panel/agent-panel";
import { aiFeatures } from "../prefs/ai-features";
import { useWindowShell } from "./useWindowShell";
import { useWindowDocuments } from "./useWindowDocuments";
import { useWindowWiring } from "./useWindowWiring";
import { useAppChrome } from "./useAppChrome";
import { useBackStep } from "./useBackStep";
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
const PhoneToday = lazyComponent(phoneParts, (m) => m.PhoneToday);
const PhonePager = lazyComponent(phoneParts, (m) => m.PhonePager);
const PhoneEditorBar = lazyComponent(phoneParts, (m) => m.PhoneEditorBar);
// The right column's pages: the AI at the edge and a plugin's list, shown
// when the shell first opens the column.
const RightPanel = lazyComponent(
  lazyModule("right-panel", () => import("./frame/RightPanel")),
  (m) => m.RightPanel,
);

/**
 * One window: its tabs, the panels around them, and the prompts and notices
 * over them. The hooks run in a fixed order so their effects keep theirs.
 */
function App() {
  const { t, settings, setSettings } = useSettings();
  const shell = useWindowShell({ settings, setSettings });
  const docs = useWindowDocuments({ shell, settings, t });
  const wiring = useWindowWiring({ shell, docs, settings, setSettings, t });
  const { activeTab, activeTitle, activeDirty } = docs;
  // The phone's three surfaces (Today, the library, the page in front); a
  // desktop has none, its surfaces are the window's panels.
  const {
    phone,
    surface: phoneView,
    setSurface: setPhoneView,
  } = usePhoneSurfaces(activeTab.view, activeTab.path);

  const { tutorial, settingsOpening, pendingClose } = shell;
  const { draftsRestoredCount, setDraftsRestoredCount, wordImported } = shell;
  const {
    tabs,
    activeTabId,
    setActiveTabId,
    liveTabs,
    addBlankTab,
    addStartTab,
  } = shell.tabState;
  // A tab brought to the front takes the editors' latest text into the
  // model first: what was typed a moment ago is not lost with the view.
  const activateDocument = useCallback(
    (id: string) => {
      liveTabs();
      // The switch comes after the render that carries the flushed text:
      // the editor the tab mounts with must read its latest content.
      requestAnimationFrame(() => setActiveTabId(id));
    },
    [liveTabs, setActiveTabId],
  );
  // The one action every surface keeps in reach: a note to write now. The
  // asset plugin's collect form when it is there; where it is not, each
  // surface falls back to its own ordinary new document. True while the
  // plugin took the action (its form shows where it is).
  const captureNote = (): boolean => runCommand("skein.collect.capture");
  // A phone's capture with no plugin: a note to type in straight away, and
  // the page turns to it.
  const captureOrBlank = () => {
    if (!captureNote()) {
      addBlankTab();
      setPhoneView("doc");
    }
  };
  const { panelOpen, setPanelOpen, toggleSidebar, sidebarWidth } = shell.panels;
  const { agentPanel, toggleAgentPanel, rightPanel, rightOverlay } =
    shell.panels;
  const { sidebarPresence, sidebarClosing, agentPresence } = shell.panels;
  const { panelMode, setPanelMode, sidebarView, setSidebarView } = shell.panels;
  // Today's "current" is a document, not a page: a plugin's page (the
  // confirm center, an asset list) is what is in front, not what is being
  // delivered.
  const currentTitle = activeTab.view ? "" : activeTitle;
  const { openFolder, openFile, openFileDialog, handleChange } = docs;
  // A folder opening answers where the files are: the view column shows
  // its tree. Today stays a click away.
  useEffect(() => {
    if (openFolder.folder) setSidebarView("files");
  }, [openFolder.folder, setSidebarView]);
  // The phone document page's folder line ("交付"): where the file stands
  // in its library, when it isn't at the root. A draft has no file yet, so
  // it says that instead - the page is still the one in front.
  const phoneSub = (() => {
    if (!activeTab.path)
      return isPlainDraft(activeTab) ? t.todayDraftUnsaved : null;
    const rootDir = openFolder.folder ?? openFolder.treeRoot;
    const parent = parentDir(activeTab.path);
    if (!rootDir || !parent) return null;
    const rel = relativePath(rootDir, parent);
    return rel && rel !== "." && !rel.startsWith("..") ? rel : null;
  })();

  useBackStep({
    phone,
    // The AI page in front, not merely open behind a document: its tab
    // keeps the AI for the button (useAiTabs), and Back from it is that
    // tab's step back to the document; after that the way out is Today.
    agentOpen: agentPanel.open && pageOf(activeTab) === "ai",
    inDoc: phoneView !== "today",
    closeAgent: () => agentPanel.setOpen(false),
    toHome: () => setPhoneView("today"),
  });

  const { searchFiles } = docs;
  const { searchFocusRequest, clearSearchFocusRequest } = docs;
  const { showTabBar, requestCloseTab, handleTabDetach, dragHoverPreview } =
    docs;
  const { moveTabToNewWindow, toggleReadOnly } = docs;
  const { zenMode, setZenMode } = docs;
  // Zen puts the sidebar away as a close does, on the window's clock.
  const sidebarShown = panelOpen && !zenMode;
  const { menuChecks, entryMoved, skillFilesDeleted } = wiring;
  // The command palette's check marks follow the window's states: the mode
  // it just set, the sidebar, the format bar.
  useEffect(() => setPaletteChecks(menuChecks), [menuChecks]);
  const { documentsOpen, setDocumentsOpen, openFromDocuments } = wiring;
  const { documentRenamed, documentDeleted } = wiring;
  const { closeSaving, closeDiscarding, cancelClose, closePrompt } =
    wiring.close;
  // Whether the documents lie on islands: their tabs in the window bar's
  // row (or the row under a bar of its own), or one sheet alone under the
  // title's row - else a clean sheet (Zen), or the phone's own bar.
  const tabsInBar = useAppChrome({ shell, settings, showTabBar, zenMode });
  const tabRow = tabsInBar || !zenMode ? "bar" : undefined;

  // What Settings needs, as the desktop's dialog or the iPad's sheet.
  const settingsProps = {
    // A file opened from Settings shows in the editor, not behind the sheet.
    onOpenFile: (path: string) => {
      settingsOpening.close();
      void openFile(path);
    },
    onFilesDeleted: skillFilesDeleted,
    docPath: activeTab.path,
    folderRoot:
      openFolder.folder || openFolder.treeRoot || docs.documentsFolder || null,
    // A sync never writes over a document the editor has open.
    openPaths: shell.tabState.tabs.flatMap((tab) =>
      tab.path ? [tab.path] : [],
    ),
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
          // The page's edge open: the grid gives it its column.
          data-right-panel={rightPanel.mounted ? "open" : undefined}
          // Not enough room for a column beside the document: the edge
          // lies over the page instead (app-shell.css).
          data-right-panel-overlay={rightOverlay ? "on" : undefined}
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
          {/* The phone's pages carry their own top rows - Today's
             (PhoneToday's), the library's (PhoneHome's) and the document
             page's (PhoneEditorBar) - so the window bar, whose menu and tabs
             belong to the desktop, stays out of a phone entirely. */}
          {phone ? (
            phoneView === "doc" && (
              <PhoneEditorBar
                t={t}
                title={activeTitle}
                sub={phoneSub}
                path={activeTab.path}
                content={activeTab.content}
                tabId={activeTab.id}
                showAgent={aiFeatures(settings, tutorial.active).chat}
                agentOpen={agentPanel.open}
                agentShortcut={formatCombo(settings.shortcuts.toggleAgentPanel)}
                onBack={() => {
                  // A step, not a jump: from the AI page back to the
                  // document, and from the document back to Today.
                  if (agentPanel.open) return toggleAgentPanel();
                  setPhoneView("today");
                }}
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
              onOpenPlugins={() => {
                void import("../plugins/views/plugin-launcher").then((m) =>
                  m.openPluginCatalog(),
                );
              }}
              showAgentToggle={aiFeatures(settings, tutorial.active).chat}
              agentOpen={agentPanel.open && rightPanel.mode === "agent"}
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
              view={sidebarView}
              onViewChange={setSidebarView}
              onCapture={() => {
                if (!captureNote()) addBlankTab();
              }}
              mode={panelMode}
              onModeChange={(id) =>
                id === "search" ? searchFiles() : setPanelMode(id)
              }
              width={sidebarWidth}
              openFolder={openFolder}
              activeTitle={currentTitle}
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
          {/* The page's edge: the AI, or a plugin's page, on demand. A
             phone and a fold have no room for a column beside the document
             and open those pages full-screen instead. */}
          {rightPanel.mounted && (
            <RightPanel
              presence={rightPanel.presence}
              mode={rightPanel.mode}
              onClose={rightPanel.close}
              t={t}
            />
          )}

          {phone && phoneView !== "doc" ? (
            <PhonePager
              page={phoneView === "library" ? "files" : "today"}
              onChange={(view) =>
                setPhoneView(view === "files" ? "library" : "today")
              }
              today={
                <PhoneToday
                  t={t}
                  activeTitle={currentTitle}
                  activePath={activeTab.path}
                  openFolder={openFolder}
                  onOpenFile={(path) => {
                    void openFile(path);
                    setPhoneView("doc");
                  }}
                  onOpenLibrary={() => setPhoneView("library")}
                  onOpenCurrent={() => setPhoneView("doc")}
                  onCapture={captureOrBlank}
                />
              }
              files={
                <PhoneHome
                  t={t}
                  openFolder={openFolder}
                  activePath={activeTab.path}
                  onBack={() => setPhoneView("today")}
                  onOpenFile={(path) => {
                    void openFile(path);
                    setPhoneView("doc");
                  }}
                  onNewFile={() => {
                    addBlankTab();
                    setPhoneView("doc");
                  }}
                  onCapture={captureOrBlank}
                  onEntryMoved={entryMoved}
                />
              }
            />
          ) : (
            <DocumentIslands
              tabs={tabs}
              activeTabId={activeTabId}
              showTabBar={phone ? false : showTabBar}
              onActivate={activateDocument}
              onClose={requestCloseTab}
              onAdd={settings.addTabShowsStartPage ? addStartTab : addBlankTab}
              onDetach={handleTabDetach}
              onMoveToNewWindow={moveTabToNewWindow}
              onToggleReadOnly={toggleReadOnly}
              onKeep={(id) => shell.tabState.updateTab(id, { preview: false })}
              onPin={(id, pinned) => shell.tabState.updateTab(id, { pinned })}
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

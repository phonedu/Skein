// Settings › Sync: one folder's connection, its saved status, and the
// actions that save, run or disconnect it. Secrets are written once and
// never read back into the page; an empty field keeps the saved one.
//
// One page, no second level (S6a v5): switching, a new or edited connection
// and this device's service open in place, under the current connection. A
// Cancel closes the panel; Esc and the system Back do the same. Any saved
// change ends in a preview.

import { useCallback, useEffect, useState } from "react";
import { isMobileApp } from "../../platform/capabilities";
import { onBack } from "../../mobile/back";
import { resolvedDocumentPath } from "../../platform/documents-path";
import { useAppDocumentsFolder } from "../../platform/native-files";
import { localeOf } from "../../i18n/langs";
import { getUiState } from "../../storage/ui-state";
import { SHOW_SIDEBAR_TAB_EVENT, sendAppEvent } from "../../utils/events";
import { SettingsGroup } from "./SettingsGroup";
import { SyncConnectionSummary } from "./SyncConnectionSummary";
import { SyncConnectView } from "./SyncConnectView";
import { SyncHeadline } from "./SyncHeadline";
import { SyncHub } from "./SyncHub";
import { SyncMaintenance, SyncVaults } from "./SyncMaintenance";
import { SyncSwitchView } from "./SyncSwitchView";
import type { SettingsPageProps } from "./types";
import {
  EMPTY_CONFIG,
  EMPTY_CREDENTIALS,
  syncStatusText,
  type SyncConnectionType,
} from "./sync-page-model";
import { useSyncActions } from "./useSyncActions";
import { useSyncPageData } from "./useSyncPageData";
import "./SyncPage.css";

/** What is open under the current connection: one panel at a time. */
type SyncPanel =
  | { kind: "none" }
  | { kind: "switch"; selected: string | null }
  | { kind: "new"; type: SyncConnectionType }
  | { kind: "edit" }
  | { kind: "service" };

export function SyncPage({
  t,
  settings,
  folderRoot: givenFolderRoot,
  openPaths,
  indexing,
  onOpenFile,
  onClose,
  openPage,
}: SettingsPageProps) {
  // The phone's home shows its own Documents when no folder was picked; the
  // page it opens from there gets no folder prop, so it syncs that folder.
  const appDocuments = useAppDocumentsFolder();
  // The settings sheet's own copy of the folder can lag behind the phone's
  // home; the stored open folder is the one the tree is showing.
  const storedFolder = isMobileApp ? getUiState("openFolder") : null;
  const phoneFolder =
    typeof storedFolder === "string" && storedFolder
      ? resolvedDocumentPath(storedFolder, appDocuments ?? "")
      : appDocuments;
  const folderRoot = isMobileApp
    ? (phoneFolder ?? givenFolderRoot)
    : givenFolderRoot;
  // A picked folder the app reads through a content:// grant can't be read
  // by the sync engine's plain paths. A plain path (the app's Documents, or
  // a folder the user gave the app access to) works.
  const unsupportedRoot =
    isMobileApp && !!folderRoot && folderRoot.startsWith("content://");
  const language = settings?.language ?? "en";
  const formatTime = (value: string | number) =>
    new Date(value).toLocaleString(localeOf(language));
  const data = useSyncPageData(folderRoot, !!indexing);
  const {
    config,
    setConfig,
    credentials,
    setCredentials,
    connections,
    vaults,
    vaultStatuses,
    savedConfig,
    saved,
    savedPassword,
    status,
    setStatus,
    editShared,
    setEditShared,
    busy,
    setBusy,
    checking,
    setChecking,
    note,
    setNote,
    preview,
    setPreview,
    lock,
    conflicts,
    history,
    reload,
  } = data;
  const [panel, setPanel] = useState<SyncPanel>({ kind: "none" });

  // The draft decides what a save would do; the summary keeps showing the
  // vault's actual binding while a new one is being written.
  const currentConnection =
    connections.find((connection) => connection.id === config.connectionId) ??
    null;
  const savedConnection =
    connections.find(
      (connection) => connection.id === savedConfig?.connectionId,
    ) ?? null;
  const shared = !!currentConnection && currentConnection.usedBy > 1;
  const configured = !!status?.configured;

  const actions = useSyncActions({
    t,
    folderRoot: folderRoot ?? "",
    formatTime,
    config,
    credentials,
    savedConfig,
    currentConnection,
    shared,
    editShared,
    status,
    lock,
    openPaths,
    onOpenFile,
    reload,
    setConfig,
    setCredentials,
    setStatus,
    setSaved: data.setSaved,
    setEditShared,
    setBusy,
    setChecking,
    setNote,
    setPreview,
  });

  // Opening a panel drops what the page had noted; closing one puts the
  // saved draft back, so a cancelled form leaves nothing behind.
  const openPanel = (next: SyncPanel) => {
    setNote(null);
    setPreview(null);
    setPanel(next);
  };

  const closePanel = useCallback(() => {
    setConfig(savedConfig ?? EMPTY_CONFIG);
    setCredentials(EMPTY_CREDENTIALS);
    setEditShared(false);
    setNote(null);
    setPreview(null);
    setPanel({ kind: "none" });
  }, [
    savedConfig,
    setConfig,
    setCredentials,
    setEditShared,
    setNote,
    setPreview,
  ]);

  // Android's Back closes the panel first; with none open it leaves Settings.
  useEffect(() => {
    if (!isMobileApp || panel.kind === "none") return;
    return onBack(() => {
      closePanel();
      return true;
    });
  }, [panel.kind, closePanel]);

  // The desktop's Escape closes the panel too: the dialog's own would close
  // Settings altogether.
  useEffect(() => {
    if (panel.kind === "none") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      closePanel();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [panel.kind, closePanel]);

  if (!folderRoot) {
    return (
      <>
        <SettingsGroup className="sync-page">
          <p className="tx-list-note">{t.syncNoFolder}</p>
        </SettingsGroup>
        <SyncVaults t={t} vaults={vaults} formatTime={formatTime} />
      </>
    );
  }

  const chooseConnection = (id: string) => {
    setEditShared(false);
    if (!id) {
      setConfig({
        ...EMPTY_CONFIG,
        keepDays: config.keepDays,
        keepChosen: config.keepChosen,
      });
      setCredentials(EMPTY_CREDENTIALS);
      return;
    }
    const connection = connections.find((candidate) => candidate.id === id);
    if (!connection) return;
    if (savedConfig?.connectionId === id) {
      setConfig(savedConfig);
    } else {
      setConfig({
        connectionId: id,
        provider: connection.provider,
        endpoint: connection.endpoint,
        bucket: connection.bucket,
        prefix: "",
        region: connection.region,
        pathStyle: connection.pathStyle,
        s3Flavor: connection.s3Flavor ?? "standard",
        keepDays: config.keepDays,
        keepChosen: config.keepChosen,
        encrypted: config.encrypted,
      });
    }
    setCredentials(EMPTY_CREDENTIALS);
  };

  // A method's "new" starts the form on that type; the segmented control in
  // the form calls the same, so the fields swap in place (Hub replaces them
  // with the join; its scan is the phone's own camera).
  const openNew = (type: SyncConnectionType = "webdav") => {
    setEditShared(false);
    setCredentials(EMPTY_CREDENTIALS);
    setConfig({
      ...EMPTY_CONFIG,
      connectionId: "new",
      ...(type === "hub" ? {} : { provider: type }),
      keepDays: config.keepDays,
      keepChosen: config.keepChosen,
    });
    openPanel({ kind: "new", type });
  };

  const openEdit = () => {
    // Editing a shared connection changes it for every vault using it: the
    // warning shows, and save() updates the connection itself.
    setEditShared(shared);
    openPanel({ kind: "edit" });
  };

  const openSwitch = () => {
    openPanel({ kind: "switch", selected: config.connectionId || null });
  };

  const saveAndPreview = async () => {
    if (!(await actions.save())) return;
    setPanel({ kind: "none" });
    await actions.previewRun();
  };

  // A paired Hub saved its own binding: reload, then show the summary.
  // Restoring the draft here would put the pre-pairing connection back.
  const finishPairing = async () => {
    await reload();
    setEditShared(false);
    setPanel({ kind: "none" });
    await actions.previewRun();
  };

  const importAndPreview = async () => {
    if (!(await actions.importPlugin())) return;
    setPanel({ kind: "none" });
    await actions.previewRun();
  };

  const disconnect = async () => {
    if (await actions.forget()) setPanel({ kind: "none" });
  };

  const openPlugins = () => {
    if (isMobileApp) {
      openPage("extensions");
      return;
    }
    sendAppEvent(SHOW_SIDEBAR_TAB_EVENT, "plugins");
    onClose?.();
  };

  const fullPath = (relative: string) =>
    `${folderRoot.replace(/[\\/]$/, "")}/${relative}`;

  const last = status?.last;
  const dirty =
    !!savedConfig &&
    (JSON.stringify(savedConfig) !== JSON.stringify(config) ||
      credentials.username !== "" ||
      credentials.password !== "" ||
      credentials.accessKey !== "" ||
      credentials.secretKey !== "" ||
      (credentials.syncPassword ?? "") !== "");
  const statusText = syncStatusText(t, status, last);
  const historyRows = history
    ? Object.entries(history.versions)
        .flatMap(([path, versions]) =>
          versions.slice(0, 3).map((version) => ({ path, ...version })),
        )
        .slice(0, 40)
    : [];

  return (
    <>
      <SyncHeadline
        t={t}
        folderRoot={folderRoot}
        unsupportedRoot={unsupportedRoot}
        note={note}
        dirty={dirty}
        statusText={statusText}
        last={last ?? null}
        status={status}
        lock={lock}
        busy={busy}
        checking={checking}
        preview={preview}
        configured={configured}
        formatTime={formatTime}
        onNew={() => openNew()}
        onRun={() => void actions.run()}
        onUnlock={() => void actions.unlock()}
        onOpenPlugins={openPlugins}
      />
      {configured && savedConnection && (
        <SyncConnectionSummary
          t={t}
          connection={savedConnection}
          prefix={savedConfig?.prefix ?? ""}
          encrypted={!!savedConfig?.encrypted}
          onSwitch={openSwitch}
          onEdit={openEdit}
        />
      )}
      {panel.kind === "switch" && (
        <SyncSwitchView
          t={t}
          connections={connections}
          currentId={savedConfig?.connectionId ?? null}
          selectedId={panel.selected}
          mobile={isMobileApp}
          busy={busy}
          onSelect={(id) => {
            setPanel({ kind: "switch", selected: id });
            chooseConnection(id);
          }}
          onNew={openNew}
          onService={() => openPanel({ kind: "service" })}
          onCancel={closePanel}
          onConfirm={() => void saveAndPreview()}
        />
      )}
      {(panel.kind === "new" || panel.kind === "edit") && (
        <SyncConnectView
          t={t}
          mode={panel.kind}
          type={panel.kind === "new" ? panel.type : config.provider}
          mobile={isMobileApp}
          root={folderRoot}
          configured={configured}
          busy={busy}
          unsupportedRoot={unsupportedRoot}
          onTypeChange={openNew}
          onCancel={closePanel}
          onSave={() => void saveAndPreview()}
          onImport={() => void importAndPreview()}
          onPaired={() => void finishPairing()}
          fields={{
            t,
            config,
            setConfig,
            credentials,
            setCredentials,
            // A new connection starts clean: the vault's saved secrets and
            // encryption lock belong to the connection being left behind.
            savedConfig: panel.kind === "edit" ? savedConfig : null,
            saved: panel.kind === "edit" ? saved : false,
            savedPassword: panel.kind === "edit" ? savedPassword : false,
            locked: false,
            sharedCount:
              panel.kind === "edit" ? (currentConnection?.usedBy ?? 0) : 0,
          }}
        />
      )}
      {panel.kind === "service" && (
        <SyncHub
          t={t}
          root={folderRoot}
          formatTime={formatTime}
          reload={reload}
          onBound={() => setPanel({ kind: "none" })}
          onBack={closePanel}
        />
      )}
      {vaults.length > 0 && (
        <SyncVaults
          t={t}
          vaults={vaults}
          currentRoot={folderRoot}
          statuses={vaultStatuses}
          currentStatus={status}
          formatTime={formatTime}
        />
      )}
      <SyncMaintenance
        t={t}
        configured={configured}
        conflicts={conflicts}
        historyRows={historyRows}
        vaults={vaults}
        busy={busy}
        checking={checking}
        formatTime={formatTime}
        onPreview={() => void actions.previewRun()}
        onOpen={(path) => onOpenFile?.(fullPath(path))}
        restore={(path, hash) => void actions.restore(path, hash)}
        onDisconnect={() => void disconnect()}
      />
    </>
  );
}

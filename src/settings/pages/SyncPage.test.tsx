// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SyncPage } from "./SyncPage";
import { resolveStrings } from "../../i18n/strings";
import { pageProps } from "./types";
import type { SyncConfig, SyncConnection } from "../../platform/ipc-sync";

vi.mock("../../platform/ipc-sync", () => ({
  syncSettingsGet: vi.fn(),
  syncSettingsSave: vi.fn(),
  syncStatus: vi.fn(),
  syncRunSaved: vi.fn(),
  syncLock: vi.fn(),
  syncConflicts: vi.fn(),
  syncHistory: vi.fn(),
  syncVaults: vi.fn(),
  syncPreview: vi.fn(),
  syncPluginImport: vi.fn(),
  syncConnectionUpdate: vi.fn(),
  syncForkVault: vi.fn(),
}));

vi.mock("../../engine/controls/app-dialog", () => ({
  showConfirm: vi.fn(),
}));

vi.mock("../../platform/native-files", () => ({
  useAppDocumentsFolder: vi.fn(() => null),
}));

const flags = vi.hoisted(() => ({ mobile: false }));

vi.mock("../../platform/capabilities", () => ({
  get isMobileApp() {
    return flags.mobile;
  },
}));

import {
  syncSettingsGet,
  syncSettingsSave,
  syncStatus,
  syncRunSaved,
  syncVaults,
  syncConnectionUpdate,
  syncForkVault,
  syncPreview,
  syncPluginImport,
} from "../../platform/ipc-sync";
import { showConfirm } from "../../engine/controls/app-dialog";
import { useAppDocumentsFolder } from "../../platform/native-files";

vi.mocked(syncVaults).mockResolvedValue([]);
vi.mocked(syncConnectionUpdate).mockResolvedValue({
  changed: false,
  vaults: 2,
});
vi.mocked(syncForkVault).mockResolvedValue();

const t = resolveStrings("en");

const config: SyncConfig = {
  connectionId: "c1",
  provider: "webdav",
  endpoint: "https://dav.example.com",
  bucket: "",
  prefix: "work",
  region: "",
  pathStyle: false,
  s3Flavor: "standard",
  keepDays: 90,
};

const shared: SyncConnection = {
  id: "c1",
  provider: "webdav",
  endpoint: "https://dav.example.com",
  bucket: "",
  region: "",
  pathStyle: false,
  s3Flavor: "standard",
  prefix: "work",
  usedBy: 2,
  hasCredentials: true,
  current: true,
};

afterEach(cleanup);

function page() {
  return (
    <SyncPage
      {...pageProps({
        t,
        settings: {} as never,
        setSettings: (() => {}) as never,
        folderRoot: "/vault",
      })}
    />
  );
}

it("binds a shared connection without offering its address or credentials", async () => {
  vi.mocked(syncSettingsGet).mockResolvedValue({
    configured: true,
    config,
    hasCredentials: true,
    connections: [shared],
  });
  vi.mocked(syncSettingsSave).mockResolvedValue();
  vi.mocked(syncVaults).mockResolvedValue([]);
  vi.mocked(syncConnectionUpdate).mockResolvedValue({
    changed: false,
    vaults: 2,
  });
  const { syncStatus } = await import("../../platform/ipc-sync");
  vi.mocked(syncStatus).mockResolvedValue({ configured: true, last: null });
  const { syncLock, syncConflicts, syncHistory } =
    await import("../../platform/ipc-sync");
  vi.mocked(syncLock).mockResolvedValue({ locked: false });
  vi.mocked(syncConflicts).mockResolvedValue([]);
  vi.mocked(syncHistory).mockResolvedValue(null);

  render(page());
  await screen.findByText(t.syncConnectionShared.replace("{count}", "2"));
  const connection = screen.getByLabelText(t.syncConnectionLabel);
  expect(connection.textContent).toContain("dav.example.com");
  const endpoint = screen.getByLabelText(
    t.syncEndpointLabel,
  ) as HTMLInputElement;
  expect(endpoint.disabled).toBe(true);
  expect(screen.queryByLabelText(t.syncAccountLabel)).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: t.syncSave }));
  await waitFor(() => expect(syncSettingsSave).toHaveBeenCalledOnce());
  const saved = vi.mocked(syncSettingsSave).mock.calls[0][1];
  expect(saved.connectionId).toBe("c1");
});

it("switching to a new connection brings the fields back", async () => {
  vi.mocked(syncSettingsGet).mockResolvedValue({
    configured: true,
    config,
    hasCredentials: true,
    connections: [shared],
  });
  const { syncStatus, syncLock, syncConflicts, syncHistory } =
    await import("../../platform/ipc-sync");
  vi.mocked(syncStatus).mockResolvedValue({ configured: true, last: null });
  vi.mocked(syncLock).mockResolvedValue({ locked: false });
  vi.mocked(syncConflicts).mockResolvedValue([]);
  vi.mocked(syncHistory).mockResolvedValue(null);

  render(page());
  await screen.findByText(t.syncConnectionShared.replace("{count}", "2"));
  const connection = screen.getByLabelText(t.syncConnectionLabel);
  fireEvent.click(connection);
  fireEvent.click(screen.getByText(t.syncConnectionNew));
  const endpoint = screen.getByLabelText(
    t.syncEndpointLabel,
  ) as HTMLInputElement;
  expect(endpoint.disabled).toBe(false);
  expect(screen.getByLabelText(t.syncAccountLabel)).toBeTruthy();
});

it("names the remote folder of every synced vault", async () => {
  vi.mocked(syncSettingsGet).mockResolvedValue({
    configured: false,
    connections: [],
  });
  vi.mocked(syncVaults).mockResolvedValue([
    {
      root: "/vault",
      name: "Work",
      connectionId: "c1",
      provider: "webdav",
      endpoint: "https://dav.example.com",
      bucket: "",
      prefix: "notes/work-1a2b3c4d",
    },
  ]);
  const { syncStatus, syncLock, syncConflicts, syncHistory } =
    await import("../../platform/ipc-sync");
  vi.mocked(syncStatus).mockResolvedValue({ configured: false, last: null });
  vi.mocked(syncLock).mockResolvedValue({ locked: false });
  vi.mocked(syncConflicts).mockResolvedValue([]);
  vi.mocked(syncHistory).mockResolvedValue(null);

  render(page());
  expect(await screen.findByText("Work")).toBeTruthy();
  expect(screen.getByText(/notes\/work-1a2b3c4d/)).toBeTruthy();
  expect(screen.getByText(/dav\.example\.com/)).toBeTruthy();
});

it("lets a shared connection be edited on purpose", async () => {
  vi.mocked(syncSettingsGet).mockResolvedValue({
    configured: true,
    config,
    hasCredentials: true,
    connections: [shared],
  });
  const { syncStatus, syncLock, syncConflicts, syncHistory } =
    await import("../../platform/ipc-sync");
  vi.mocked(syncStatus).mockResolvedValue({ configured: true, last: null });
  vi.mocked(syncLock).mockResolvedValue({ locked: false });
  vi.mocked(syncConflicts).mockResolvedValue([]);
  vi.mocked(syncHistory).mockResolvedValue(null);

  render(page());
  await screen.findByText(t.syncConnectionShared.replace("{count}", "2"));
  fireEvent.click(screen.getByRole("button", { name: t.syncConnectionEdit }));
  const endpoint = screen.getByLabelText(
    t.syncEndpointLabel,
  ) as HTMLInputElement;
  expect(endpoint.disabled).toBe(false);
  expect(screen.getByLabelText(t.syncAccountLabel)).toBeTruthy();
  const prefix = screen.getByLabelText(
    t.syncConnectionPrefixLabel,
  ) as HTMLInputElement;
  expect(prefix.value).toBe("work");
  fireEvent.change(endpoint, { target: { value: "https://new.example.com" } });
  fireEvent.change(prefix, { target: { value: "team" } });
  fireEvent.click(screen.getByRole("button", { name: t.syncSave }));
  await waitFor(() => expect(syncConnectionUpdate).toHaveBeenCalledOnce());
  const [id, updated, , defaultPrefix] =
    vi.mocked(syncConnectionUpdate).mock.calls[0];
  expect(id).toBe("c1");
  expect(updated.endpoint).toBe("https://new.example.com");
  expect(defaultPrefix).toBe("team");
});

it("offers to fork a copied vault and saves it again", async () => {
  vi.mocked(syncSettingsGet).mockResolvedValue({
    configured: false,
    connections: [],
  });
  vi.mocked(syncSettingsSave).mockClear();
  vi.mocked(syncForkVault).mockClear();
  vi.mocked(syncSettingsSave)
    .mockRejectedValueOnce(new Error("vaultCopied"))
    .mockResolvedValueOnce();
  vi.mocked(showConfirm).mockResolvedValue(true);
  const { syncStatus, syncLock, syncConflicts, syncHistory } =
    await import("../../platform/ipc-sync");
  vi.mocked(syncStatus).mockResolvedValue({ configured: false, last: null });
  vi.mocked(syncLock).mockResolvedValue({ locked: false });
  vi.mocked(syncConflicts).mockResolvedValue([]);
  vi.mocked(syncHistory).mockResolvedValue(null);

  render(page());
  fireEvent.click(screen.getByRole("button", { name: t.syncSave }));
  await waitFor(() => expect(syncForkVault).toHaveBeenCalledOnce());
  expect(syncSettingsSave).toHaveBeenCalledTimes(2);
});

it("defaults a new repository to encryption and saves its password", async () => {
  vi.mocked(syncSettingsGet).mockResolvedValue({
    configured: false,
    connections: [],
  });
  vi.mocked(syncSettingsSave).mockClear();
  vi.mocked(syncSettingsSave).mockResolvedValue();
  const { syncStatus, syncLock, syncConflicts, syncHistory } =
    await import("../../platform/ipc-sync");
  vi.mocked(syncStatus).mockResolvedValue({ configured: false, last: null });
  vi.mocked(syncLock).mockResolvedValue({ locked: false });
  vi.mocked(syncConflicts).mockResolvedValue([]);
  vi.mocked(syncHistory).mockResolvedValue(null);

  render(page());
  const encrypt = screen.getByLabelText(
    t.syncEncryptionLabel,
  ) as HTMLInputElement;
  expect(encrypt.checked).toBe(true);
  fireEvent.change(screen.getByLabelText(t.syncEncryptionPasswordLabel), {
    target: { value: "correct horse battery" },
  });
  fireEvent.click(screen.getByRole("button", { name: t.syncSave }));
  await waitFor(() => expect(syncSettingsSave).toHaveBeenCalledOnce());
  const [, config, credentials] = vi.mocked(syncSettingsSave).mock.calls[0];
  expect(config.encrypted).toBe(true);
  expect(credentials.syncPassword).toBe("correct horse battery");
});

it("shows what a first sync would do", async () => {
  vi.mocked(syncSettingsGet).mockResolvedValue({
    configured: true,
    config,
    hasCredentials: true,
    connections: [shared],
  });
  vi.mocked(syncPreview).mockResolvedValue({
    uploaded: 3,
    downloaded: 1,
    removedRemote: 0,
    removedLocal: 0,
    conflicts: 0,
    moved: 0,
    unchanged: 2,
    uploadBytes: 30,
    downloadBytes: 10,
    emptyScan: false,
    bulkDelete: false,
  });
  const { syncStatus, syncLock, syncConflicts, syncHistory } =
    await import("../../platform/ipc-sync");
  vi.mocked(syncStatus).mockResolvedValue({ configured: true, last: null });
  vi.mocked(syncLock).mockResolvedValue({ locked: false });
  vi.mocked(syncConflicts).mockResolvedValue([]);
  vi.mocked(syncHistory).mockResolvedValue(null);

  render(page());
  const button = screen.getByRole("button", { name: t.syncPreview });
  await waitFor(() =>
    expect((button as HTMLButtonElement).disabled).toBe(false),
  );
  fireEvent.click(button);
  const summary = await screen.findByText(/Would upload 3/);
  expect(summary.textContent).not.toContain("{");
});

it("imports a Cloud Sync connection after confirmation", async () => {
  vi.mocked(syncSettingsGet).mockResolvedValue({
    configured: false,
    connections: [],
  });
  vi.mocked(syncPluginImport).mockResolvedValue({
    provider: "webdav",
    prefix: "notes/work",
    encrypted: true,
    files: 4,
  });
  vi.mocked(showConfirm).mockResolvedValue(true);
  const { syncStatus, syncLock, syncConflicts, syncHistory } =
    await import("../../platform/ipc-sync");
  vi.mocked(syncStatus).mockResolvedValue({ configured: false, last: null });
  vi.mocked(syncLock).mockResolvedValue({ locked: false });
  vi.mocked(syncConflicts).mockResolvedValue([]);
  vi.mocked(syncHistory).mockResolvedValue(null);

  render(page());
  fireEvent.click(screen.getByRole("button", { name: t.syncImportPlugin }));
  await waitFor(() => expect(syncPluginImport).toHaveBeenCalledOnce());
});

it("falls back to the phone's own Documents when no folder is passed", async () => {
  flags.mobile = true;
  vi.mocked(useAppDocumentsFolder).mockReturnValue("/app/Documents");
  vi.mocked(syncSettingsGet).mockResolvedValue({
    configured: false,
    connections: [],
  });
  const { syncStatus, syncLock, syncConflicts, syncHistory } =
    await import("../../platform/ipc-sync");
  vi.mocked(syncStatus).mockResolvedValue({ configured: false, last: null });
  vi.mocked(syncLock).mockResolvedValue({ locked: false });
  vi.mocked(syncConflicts).mockResolvedValue([]);
  vi.mocked(syncHistory).mockResolvedValue(null);

  render(
    <SyncPage
      {...pageProps({
        t,
        settings: {} as never,
        setSettings: (() => {}) as never,
        folderRoot: null,
      })}
    />,
  );
  await waitFor(() =>
    expect(syncSettingsGet).toHaveBeenCalledWith("/app/Documents"),
  );
  vi.mocked(useAppDocumentsFolder).mockReturnValue(null);
  flags.mobile = false;
});

it("refuses a folder the app only reads through a content grant", async () => {
  flags.mobile = true;
  vi.mocked(syncSettingsGet).mockResolvedValue({
    configured: false,
    connections: [],
  });
  const { syncStatus, syncLock, syncConflicts, syncHistory } =
    await import("../../platform/ipc-sync");
  vi.mocked(syncStatus).mockResolvedValue({ configured: false, last: null });
  vi.mocked(syncLock).mockResolvedValue({ locked: false });
  vi.mocked(syncConflicts).mockResolvedValue([]);
  vi.mocked(syncHistory).mockResolvedValue(null);

  render(
    <SyncPage
      {...pageProps({
        t,
        settings: {} as never,
        setSettings: (() => {}) as never,
        folderRoot: "content://com.android.externalstorage.documents/tree/x",
      })}
    />,
  );
  await screen.findByText(t.syncMobileContentOnly);
  expect(
    (
      screen.getByRole("button", {
        name: t.syncSave,
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  flags.mobile = false;
});

it("does not warn before built-in sync is configured", async () => {
  vi.mocked(syncSettingsGet).mockResolvedValue({
    configured: false,
    connections: [],
  });
  const { syncLock, syncConflicts, syncHistory } =
    await import("../../platform/ipc-sync");
  vi.mocked(syncStatus).mockResolvedValue({
    configured: false,
    last: null,
    pluginConfigured: true,
    pluginRunning: true,
  });
  vi.mocked(syncLock).mockResolvedValue({ locked: false });
  vi.mocked(syncConflicts).mockResolvedValue([]);
  vi.mocked(syncHistory).mockResolvedValue(null);

  render(page());
  await screen.findByText(t.syncNotConfigured);
  expect(screen.queryByText(t.syncPluginStillRunning)).toBeNull();
});

it("warns while the Cloud Sync plugin still runs for the folder", async () => {
  vi.mocked(syncSettingsGet).mockResolvedValue({
    configured: true,
    config,
    hasCredentials: true,
    connections: [shared],
  });
  const { syncLock, syncConflicts, syncHistory } =
    await import("../../platform/ipc-sync");
  vi.mocked(syncStatus).mockResolvedValue({
    configured: true,
    last: null,
    pluginConfigured: true,
    pluginRunning: true,
  });
  vi.mocked(syncLock).mockResolvedValue({ locked: false });
  vi.mocked(syncConflicts).mockResolvedValue([]);
  vi.mocked(syncHistory).mockResolvedValue(null);

  const onClose = vi.fn();
  render(
    <SyncPage
      {...pageProps({
        t,
        settings: {} as never,
        setSettings: (() => {}) as never,
        folderRoot: "/vault",
        onClose,
      })}
    />,
  );
  await screen.findByText(t.syncPluginStillRunning);
  expect(screen.getByText(t.syncPluginRollback)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: t.syncPluginOpen }));
  expect(onClose).toHaveBeenCalledOnce();
});

it("asks before syncing while the plugin is still on", async () => {
  vi.mocked(syncSettingsGet).mockResolvedValue({
    configured: true,
    config,
    hasCredentials: true,
    connections: [shared],
  });
  const { syncLock, syncConflicts, syncHistory } =
    await import("../../platform/ipc-sync");
  vi.mocked(syncStatus).mockResolvedValue({
    configured: true,
    last: null,
    pluginConfigured: true,
    pluginRunning: true,
  });
  vi.mocked(syncLock).mockResolvedValue({ locked: false });
  vi.mocked(syncConflicts).mockResolvedValue([]);
  vi.mocked(syncHistory).mockResolvedValue(null);
  vi.mocked(showConfirm).mockResolvedValue(false);

  render(page());
  const button = screen.getByRole("button", { name: t.syncNow });
  await waitFor(() =>
    expect((button as HTMLButtonElement).disabled).toBe(false),
  );
  fireEvent.click(button);
  await waitFor(() =>
    expect(showConfirm).toHaveBeenCalledWith(t.syncPluginRunAsk, {
      okLabel: t.syncContinue,
      cancelLabel: t.cancel,
    }),
  );
  expect(syncRunSaved).not.toHaveBeenCalled();
});

// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
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
  syncLock,
  syncConflicts,
  syncHistory,
} from "../../platform/ipc-sync";
import { showConfirm } from "../../engine/controls/app-dialog";
import { useAppDocumentsFolder } from "../../platform/native-files";

vi.mocked(syncVaults).mockResolvedValue([]);
vi.mocked(syncConnectionUpdate).mockResolvedValue({
  changed: false,
  vaults: 2,
});
vi.mocked(syncForkVault).mockResolvedValue();
vi.mocked(syncLock).mockResolvedValue({ locked: false });
vi.mocked(syncConflicts).mockResolvedValue([]);
vi.mocked(syncHistory).mockResolvedValue(null);

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

const home: SyncConnection = {
  id: "c2",
  provider: "webdav",
  endpoint: "https://home.example.com",
  bucket: "",
  region: "",
  pathStyle: false,
  s3Flavor: "standard",
  prefix: "notes",
  usedBy: 1,
  hasCredentials: true,
  current: false,
};

const sharedNote = () => t.syncConnectionShared.replace("{count}", "2");

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

/** The heading names its card; a type card is a button with its label and
 *  its one-line description. */
const typeButton = (name: string) =>
  screen.getByRole("button", { name: new RegExp(`^${name}`) });

afterEach(cleanup);

it("shows the binding in the overview and keeps the fields in Edit", async () => {
  vi.mocked(syncSettingsGet).mockResolvedValue({
    configured: true,
    config,
    hasCredentials: true,
    connections: [shared],
  });
  vi.mocked(syncSettingsSave).mockClear();
  vi.mocked(syncConnectionUpdate).mockClear();
  vi.mocked(syncStatus).mockResolvedValue({ configured: true, last: null });

  render(page());
  await screen.findByText(sharedNote());
  expect(screen.getByText(t.syncCurrentConnection)).toBeTruthy();
  expect(screen.queryByLabelText(t.syncEndpointLabel)).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: t.syncEdit }));
  const endpoint = (await screen.findByLabelText(
    t.syncEndpointLabel,
  )) as HTMLInputElement;
  expect(endpoint.disabled).toBe(false);
  expect(screen.getByLabelText(t.syncAccountLabel)).toBeTruthy();
  expect(screen.queryByLabelText(t.syncPrefixLabel)).toBeNull();
  fireEvent.change(endpoint, { target: { value: "https://new.example.com" } });
  fireEvent.click(screen.getByRole("button", { name: t.syncSavePreview }));
  await waitFor(() => expect(syncConnectionUpdate).toHaveBeenCalledOnce());
  const [id, updated, , defaultPrefix] =
    vi.mocked(syncConnectionUpdate).mock.calls[0];
  expect(id).toBe("c1");
  expect(updated.endpoint).toBe("https://new.example.com");
  expect(defaultPrefix).toBeNull();
});

it("switches the vault to another saved connection", async () => {
  vi.mocked(syncSettingsGet).mockResolvedValue({
    configured: true,
    config,
    hasCredentials: true,
    connections: [shared, home],
  });
  vi.mocked(syncSettingsSave).mockClear();
  vi.mocked(syncSettingsSave).mockResolvedValue();
  vi.mocked(syncStatus).mockResolvedValue({ configured: true, last: null });

  render(page());
  await screen.findByText(sharedNote());
  fireEvent.click(screen.getByRole("button", { name: t.syncSwitch }));
  expect(await screen.findByText(t.syncSwitchTitle)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /home\.example\.com/ }));
  fireEvent.click(screen.getByRole("button", { name: t.syncSwitchTo }));
  await waitFor(() => expect(syncSettingsSave).toHaveBeenCalledOnce());
  const saved = vi.mocked(syncSettingsSave).mock.calls[0][1];
  expect(saved.connectionId).toBe("c2");
});

it("opens a new connection in place, with WebDAV's fields already there", async () => {
  vi.mocked(syncSettingsGet).mockResolvedValue({
    configured: true,
    config,
    hasCredentials: true,
    connections: [shared],
  });
  vi.mocked(syncStatus).mockResolvedValue({ configured: true, last: null });

  render(page());
  await screen.findByText(sharedNote());
  fireEvent.click(screen.getByRole("button", { name: t.syncSwitch }));
  fireEvent.click(
    within(screen.getByRole("group", { name: "WebDAV" })).getByRole("button", {
      name: new RegExp(t.syncNewShort),
    }),
  );
  // The page did not change: the current connection is still above the form.
  expect(screen.getByText(t.syncCurrentConnection)).toBeTruthy();
  const endpoint = (await screen.findByLabelText(
    t.syncEndpointLabel,
  )) as HTMLInputElement;
  expect(endpoint.disabled).toBe(false);
  expect(screen.getByLabelText(t.syncAccountLabel)).toBeTruthy();
  fireEvent.click(typeButton("S3"));
  expect(await screen.findByLabelText(t.syncBucketLabel)).toBeTruthy();
  expect(screen.getByText(t.syncCurrentConnection)).toBeTruthy();
});

it("switches the fields under one type control, and a Hub joins in place", async () => {
  vi.mocked(syncSettingsGet).mockResolvedValue({
    configured: false,
    connections: [],
  });
  vi.mocked(syncStatus).mockResolvedValue({ configured: false, last: null });

  render(page());
  fireEvent.click(
    await screen.findByRole("button", { name: t.syncConnectionNew }),
  );
  expect(typeButton("WebDAV")).toBeTruthy();
  expect(typeButton("S3")).toBeTruthy();
  expect(typeButton(t.syncHubTitle)).toBeTruthy();
  expect(await screen.findByLabelText(t.syncEndpointLabel)).toBeTruthy();

  fireEvent.click(typeButton(t.syncHubTitle));
  expect(await screen.findByLabelText(t.syncHubCode)).toBeTruthy();
  expect(screen.queryByLabelText(t.syncHubDeviceName)).toBeNull();
  expect(screen.queryByRole("button", { name: t.syncSavePreview })).toBeNull();
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
  vi.mocked(syncStatus).mockResolvedValue({ configured: false, last: null });

  render(page());
  expect(await screen.findByText("Work")).toBeTruthy();
  expect(screen.getByText(/notes\/work-1a2b3c4d/)).toBeTruthy();
  expect(screen.getAllByText(/dav\.example\.com/).length).toBeGreaterThan(0);
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
  vi.mocked(syncStatus).mockResolvedValue({ configured: false, last: null });

  render(page());
  fireEvent.click(
    await screen.findByRole("button", { name: t.syncConnectionNew }),
  );
  fireEvent.click(typeButton("WebDAV"));
  fireEvent.click(
    await screen.findByRole("button", { name: t.syncSavePreview }),
  );
  await waitFor(() => expect(syncForkVault).toHaveBeenCalledOnce());
  expect(syncSettingsSave).toHaveBeenCalledTimes(2);
});

it("starts a new repository unencrypted and offers it under Advanced", async () => {
  vi.mocked(syncSettingsGet).mockResolvedValue({
    configured: false,
    connections: [],
  });
  vi.mocked(syncSettingsSave).mockClear();
  vi.mocked(syncSettingsSave).mockResolvedValue();
  vi.mocked(syncStatus).mockResolvedValue({ configured: false, last: null });

  render(page());
  fireEvent.click(
    await screen.findByRole("button", { name: t.syncConnectionNew }),
  );
  fireEvent.click(typeButton("WebDAV"));
  expect(
    document.querySelector("details.sync-advanced")?.hasAttribute("open"),
  ).toBe(false);
  fireEvent.click(screen.getByText(t.syncAdvanced));
  const encrypt = (await screen.findByLabelText(
    t.syncEncryptionLabel,
  )) as HTMLInputElement;
  expect(encrypt.checked).toBe(false);
  fireEvent.click(encrypt);
  fireEvent.change(screen.getByLabelText(t.syncEncryptionPasswordLabel), {
    target: { value: "correct horse battery" },
  });
  fireEvent.click(screen.getByRole("button", { name: t.syncSavePreview }));
  await waitFor(() => expect(syncSettingsSave).toHaveBeenCalledOnce());
  const [, config, credentials] = vi.mocked(syncSettingsSave).mock.calls[0];
  expect(config.encrypted).toBe(true);
  expect(config.connectionId).toBe("new");
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
  vi.mocked(syncStatus).mockResolvedValue({ configured: true, last: null });

  render(page());
  await screen.findByText(sharedNote());
  fireEvent.click(screen.getByText(t.syncMaintenance));
  const button = await screen.findByRole("button", { name: t.syncPreview });
  await waitFor(() =>
    expect((button as HTMLButtonElement).disabled).toBe(false),
  );
  fireEvent.click(button);
  const summary = await screen.findByText(/Upload 3/);
  expect(summary.textContent).not.toContain("{");
});

it("imports a Cloud Sync connection from the type step after confirmation", async () => {
  vi.mocked(syncSettingsGet).mockResolvedValue({
    configured: false,
    connections: [],
  });
  vi.mocked(syncPluginImport).mockClear();
  vi.mocked(syncPluginImport).mockResolvedValue({
    provider: "webdav",
    prefix: "notes/work",
    encrypted: true,
    files: 4,
  });
  vi.mocked(showConfirm).mockResolvedValue(true);
  vi.mocked(syncStatus).mockResolvedValue({ configured: false, last: null });

  render(page());
  fireEvent.click(
    await screen.findByRole("button", { name: t.syncConnectionNew }),
  );
  fireEvent.click(screen.getByRole("button", { name: t.syncImportPlugin }));
  await waitFor(() => expect(syncPluginImport).toHaveBeenCalledOnce());
});

it("folds maintenance away, and opens it when conflicts appear", async () => {
  vi.mocked(syncSettingsGet).mockResolvedValue({
    configured: true,
    config,
    hasCredentials: true,
    connections: [shared],
  });
  vi.mocked(syncConflicts).mockResolvedValueOnce([]);
  vi.mocked(syncStatus).mockResolvedValue({ configured: true, last: null });

  const { unmount } = render(page());
  await screen.findByText(sharedNote());
  const fold = document.querySelector("details.sync-maintenance");
  expect(fold?.hasAttribute("open")).toBe(false);
  unmount();

  vi.mocked(syncConflicts).mockResolvedValueOnce([
    { path: "notes/a (conflict).md", name: "a (conflict).md", size: 12 },
  ]);
  render(page());
  await screen.findByText("notes/a (conflict).md");
  await waitFor(() =>
    expect(
      document.querySelector("details.sync-maintenance")?.hasAttribute("open"),
    ).toBe(true),
  );
});

it("falls back to the phone's own Documents when no folder is passed", async () => {
  flags.mobile = true;
  vi.mocked(useAppDocumentsFolder).mockReturnValue("/app/Documents");
  vi.mocked(syncSettingsGet).mockResolvedValue({
    configured: false,
    connections: [],
  });
  vi.mocked(syncStatus).mockResolvedValue({ configured: false, last: null });

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
  vi.mocked(syncStatus).mockResolvedValue({ configured: false, last: null });

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
        name: t.syncConnectionNew,
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  flags.mobile = false;
});

it("shows each vault's own last run", async () => {
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
      prefix: "notes",
    },
    {
      root: "/other",
      name: "Other",
      connectionId: "c2",
      provider: "webdav",
      endpoint: "https://other.example.com",
      bucket: "",
      prefix: "other",
    },
  ]);
  vi.mocked(syncStatus).mockImplementation(async (root) =>
    root === "/other"
      ? {
          configured: true,
          last: {
            at: "2026-11-24T10:00:00Z",
            result: {
              revision: "1",
              uploaded: 1,
              downloaded: 0,
              removed: 0,
              moved: 0,
              conflicts: [],
              deferred: [],
              unchanged: 0,
            },
          },
        }
      : { configured: true, last: null },
  );

  render(page());
  expect(await screen.findByText("Work")).toBeTruthy();
  expect(screen.getByText("Other")).toBeTruthy();
  const states = [...document.querySelectorAll(".sync-vault-status")].map(
    (node) => node.textContent ?? "",
  );
  expect(states.some((text) => text.includes("Last synced "))).toBe(true);
  expect(states.some((text) => text.includes(t.syncNever))).toBe(true);
});

it("keeps the plugin notice away while the plugin is off", async () => {
  vi.mocked(syncSettingsGet).mockResolvedValue({
    configured: true,
    config,
    hasCredentials: true,
    connections: [shared],
  });
  vi.mocked(syncStatus).mockResolvedValue({
    configured: true,
    last: null,
    pluginConfigured: true,
    pluginRunning: false,
  });

  render(page());
  await screen.findByText(sharedNote());
  expect(screen.queryByText(t.syncPluginStillRunning)).toBeNull();
  expect(screen.queryByRole("button", { name: t.syncPluginOpen })).toBeNull();
});

it("does not warn before built-in sync is configured", async () => {
  vi.mocked(syncSettingsGet).mockResolvedValue({
    configured: false,
    connections: [],
  });
  vi.mocked(syncStatus).mockResolvedValue({
    configured: false,
    last: null,
    pluginConfigured: true,
    pluginRunning: true,
  });

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
  vi.mocked(syncStatus).mockResolvedValue({
    configured: true,
    last: null,
    pluginConfigured: true,
    pluginRunning: true,
  });

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

it("keeps sync disabled while the plugin still syncs the folder", async () => {
  vi.mocked(syncSettingsGet).mockResolvedValue({
    configured: true,
    config,
    hasCredentials: true,
    connections: [shared],
  });
  vi.mocked(syncStatus).mockResolvedValue({
    configured: true,
    last: null,
    pluginConfigured: true,
    pluginRunning: true,
  });
  vi.mocked(showConfirm).mockClear();
  vi.mocked(syncRunSaved).mockClear();

  render(page());
  const button = (await screen.findByRole("button", {
    name: t.syncNow,
  })) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  fireEvent.click(button);
  expect(syncRunSaved).not.toHaveBeenCalled();
  expect(showConfirm).not.toHaveBeenCalled();
});

it("reads Qiniu's native mode and region from the address", async () => {
  vi.mocked(syncSettingsGet).mockResolvedValue({
    configured: false,
    connections: [],
  });
  vi.mocked(syncSettingsSave).mockClear();
  vi.mocked(syncSettingsSave).mockResolvedValue();
  vi.mocked(syncStatus).mockResolvedValue({ configured: false, last: null });

  render(page());
  fireEvent.click(
    await screen.findByRole("button", { name: t.syncConnectionNew }),
  );
  fireEvent.click(typeButton("S3"));
  const endpoint = await screen.findByLabelText(t.syncEndpointLabel);
  fireEvent.change(endpoint, {
    target: { value: "https://s3.cn-south-1.qiniucs.com" },
  });
  const region = (await screen.findByLabelText(
    t.syncRegionLabel,
  )) as HTMLSelectElement;
  expect(region.value).toBe("cn-south-1");
  expect(
    (screen.getByLabelText(t.syncS3FlavorLabel) as HTMLSelectElement).value,
  ).toBe("kodo");
  expect(screen.queryByLabelText(t.syncEndpointLabel)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: t.syncSavePreview }));
  await waitFor(() => expect(syncSettingsSave).toHaveBeenCalledOnce());
  const saved = vi.mocked(syncSettingsSave).mock.calls[0][1];
  expect(saved.provider).toBe("s3");
  expect(saved.s3Flavor).toBe("kodo");
  expect(saved.region).toBe("cn-south-1");
  expect(saved.endpoint).toBe("https://s3.cn-south-1.qiniucs.com");
  expect(saved.pathStyle).toBe(true);
});

it("fills Bitiful's address and region when its service is chosen", async () => {
  vi.mocked(syncSettingsGet).mockResolvedValue({
    configured: false,
    connections: [],
  });
  vi.mocked(syncSettingsSave).mockClear();
  vi.mocked(syncSettingsSave).mockResolvedValue();
  vi.mocked(syncStatus).mockResolvedValue({ configured: false, last: null });

  render(page());
  fireEvent.click(
    await screen.findByRole("button", { name: t.syncConnectionNew }),
  );
  fireEvent.click(typeButton("S3"));
  fireEvent.change(await screen.findByLabelText(t.syncS3FlavorLabel), {
    target: { value: "bitiful" },
  });
  const endpoint = (await screen.findByLabelText(
    t.syncEndpointLabel,
  )) as HTMLInputElement;
  expect(endpoint.value).toBe("https://s3.bitiful.net");
  expect(endpoint.disabled).toBe(true);
  const region = (await screen.findByLabelText(
    t.syncRegionLabel,
  )) as HTMLInputElement;
  expect(region.value).toBe("cn-east-1");
  expect(region.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText(t.syncBucketLabel), {
    target: { value: "textus" },
  });
  fireEvent.click(screen.getByRole("button", { name: t.syncSavePreview }));
  await waitFor(() => expect(syncSettingsSave).toHaveBeenCalledOnce());
  const saved = vi.mocked(syncSettingsSave).mock.calls[0][1];
  expect(saved.s3Flavor).toBe("standard");
  expect(saved.endpoint).toBe("https://s3.bitiful.net");
  expect(saved.region).toBe("cn-east-1");
  expect(saved.pathStyle).toBe(true);
});

it("picks Qiniu Kodo first and asks for one of its regions", async () => {
  vi.mocked(syncSettingsGet).mockResolvedValue({
    configured: false,
    connections: [],
  });
  vi.mocked(syncSettingsSave).mockClear();
  vi.mocked(syncSettingsSave).mockResolvedValue();
  vi.mocked(syncStatus).mockResolvedValue({ configured: false, last: null });

  render(page());
  fireEvent.click(
    await screen.findByRole("button", { name: t.syncConnectionNew }),
  );
  fireEvent.click(typeButton("S3"));
  fireEvent.change(await screen.findByLabelText(t.syncS3FlavorLabel), {
    target: { value: "kodo" },
  });
  expect(screen.queryByLabelText(t.syncEndpointLabel)).toBeNull();
  const region = screen.getByLabelText(t.syncRegionLabel) as HTMLSelectElement;
  expect(region.value).toBe("");
  const save = screen.getByRole("button", {
    name: t.syncSavePreview,
  }) as HTMLButtonElement;
  expect(save.disabled).toBe(true);
  fireEvent.change(region, { target: { value: "ap-southeast-1" } });
  expect(save.disabled).toBe(false);
  fireEvent.change(screen.getByLabelText(t.syncBucketLabel), {
    target: { value: "textus" },
  });
  fireEvent.click(save);
  await waitFor(() => expect(syncSettingsSave).toHaveBeenCalledOnce());
  const saved = vi.mocked(syncSettingsSave).mock.calls[0][1];
  expect(saved.s3Flavor).toBe("kodo");
  expect(saved.region).toBe("ap-southeast-1");
  expect(saved.endpoint).toBe("https://s3.ap-southeast-1.qiniucs.com");
  expect(saved.pathStyle).toBe(true);
});

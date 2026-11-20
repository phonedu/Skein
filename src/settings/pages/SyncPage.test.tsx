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
  syncLock: vi.fn(),
  syncConflicts: vi.fn(),
  syncHistory: vi.fn(),
  syncVaults: vi.fn(),
  syncConnectionUpdate: vi.fn(),
  syncForkVault: vi.fn(),
}));

vi.mock("../../engine/controls/app-dialog", () => ({
  showConfirm: vi.fn(),
}));

import {
  syncSettingsGet,
  syncSettingsSave,
  syncVaults,
  syncConnectionUpdate,
  syncForkVault,
} from "../../platform/ipc-sync";
import { showConfirm } from "../../engine/controls/app-dialog";

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
  fireEvent.change(endpoint, { target: { value: "https://new.example.com" } });
  fireEvent.click(screen.getByRole("button", { name: t.syncSave }));
  await waitFor(() => expect(syncConnectionUpdate).toHaveBeenCalledOnce());
  const [id, updated] = vi.mocked(syncConnectionUpdate).mock.calls[0];
  expect(id).toBe("c1");
  expect(updated.endpoint).toBe("https://new.example.com");
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

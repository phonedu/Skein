// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import en from "../i18n/locales/en";
import type { Strings } from "../i18n/strings";
import { syncStatus } from "../platform/ipc-sync";
import { showNotice } from "../engine/controls/notices";
import { PhoneSyncStatus } from "./PhoneSyncStatus";

vi.mock("../platform/ipc-sync", () => ({ syncStatus: vi.fn() }));
vi.mock("../engine/controls/notices", () => ({ showNotice: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.mocked(syncStatus).mockReset();
  vi.mocked(showNotice).mockReset();
});

const result = {
  revision: "r",
  uploaded: 1,
  downloaded: 0,
  removed: 0,
  moved: 0,
  conflicts: [],
  deferred: [],
  unchanged: 0,
};

it("says a fresh sync finished, then leaves no box on the page", async () => {
  vi.mocked(syncStatus).mockResolvedValue({
    configured: true,
    last: { at: new Date().toISOString(), result },
  });
  const { container } = render(
    <PhoneSyncStatus folder={`/vault-fresh-${Date.now()}`} t={en as Strings} />,
  );
  await waitFor(() =>
    expect(showNotice).toHaveBeenCalledWith(
      `${en.navSync} · ${en.syncDone}`,
      { tone: "info" },
    ),
  );
  expect(container.firstChild).toBeNull();
});

it("stays quiet for an old result or a folder with no sync", async () => {
  vi.mocked(syncStatus).mockResolvedValueOnce({
    configured: true,
    last: { at: "2026-11-20T13:10:09.000Z", result },
  });
  const old = render(
    <PhoneSyncStatus folder={`/vault-old-${Date.now()}`} t={en as Strings} />,
  );
  vi.mocked(syncStatus).mockResolvedValueOnce({ configured: false, last: null });
  const none = render(
    <PhoneSyncStatus folder={`/vault-none-${Date.now()}`} t={en as Strings} />,
  );
  await Promise.resolve();
  expect(showNotice).not.toHaveBeenCalled();
  expect(old.container.firstChild).toBeNull();
  expect(none.container.firstChild).toBeNull();
});

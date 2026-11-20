// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import en from "../i18n/locales/en";
import type { Strings } from "../i18n/strings";
import { openSettingsPage } from "../settings/settings-nav";
import { syncStatus } from "../platform/ipc-sync";
import { PhoneSyncStatus } from "./PhoneSyncStatus";

vi.mock("../platform/ipc-sync", () => ({ syncStatus: vi.fn() }));
vi.mock("../settings/settings-nav", () => ({ openSettingsPage: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.mocked(syncStatus).mockReset();
  vi.mocked(openSettingsPage).mockClear();
});

it("shows the last built-in sync and opens the sync settings", async () => {
  vi.mocked(syncStatus).mockResolvedValue({
    configured: true,
    last: {
      at: "2026-11-20T13:10:09.000Z",
      result: {
        revision: "r",
        uploaded: 1,
        downloaded: 0,
        removed: 0,
        moved: 0,
        conflicts: [],
        deferred: [],
        unchanged: 0,
      },
    },
  });
  render(<PhoneSyncStatus folder="/vault" t={en as Strings} />);

  const row = await screen.findByRole("button", {
    name: `${en.navSync}: ${en.syncDone}`,
  });
  fireEvent.click(row);
  expect(openSettingsPage).toHaveBeenCalledWith("sync");
});

it("says nothing while this folder has no built-in sync", async () => {
  vi.mocked(syncStatus).mockResolvedValue({ configured: false, last: null });
  const { container } = render(
    <PhoneSyncStatus folder="/vault" t={en as Strings} />,
  );
  await Promise.resolve();
  expect(container.firstChild).toBeNull();
});

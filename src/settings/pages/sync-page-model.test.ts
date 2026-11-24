import { describe, expect, it } from "vitest";
import { resolveStrings } from "../../i18n/strings";
import { fill } from "../../i18n/fill";
import {
  errorText,
  parseHubPairPayload,
  syncStatusText,
} from "./sync-page-model";

const t = resolveStrings("en");

describe("sync page text", () => {
  it("names the two identity stops", () => {
    expect(errorText(t, "identityFork: a.md")).toBe(t.syncErrorIdentityFork);
    expect(errorText(t, "identityConflict: a.md")).toBe(
      t.syncErrorIdentityConflict,
    );
  });

  it("says how many documents got a new identity", () => {
    const last = {
      at: "2026-11-21T00:00:00.000Z",
      result: {
        revision: "r",
        uploaded: 1,
        downloaded: 0,
        removed: 0,
        moved: 0,
        conflicts: [],
        deferred: [],
        unchanged: 0,
        identityReassigned: ["copy.md"],
      },
    };
    expect(syncStatusText(t, { configured: true }, last)).toContain(
      fill(t.syncReassigned, { count: 1 }),
    );
  });
});

describe("Hub pairing QR payload", () => {
  const payload = {
    address: "http://192.168.1.5:7419",
    code: "123456",
    repoId: "a".repeat(32),
  };
  const text = `TEXTUS-HUB-PAIR/1
${JSON.stringify(payload)}`;

  it("reads the desktop's one-time payload", () => {
    expect(parseHubPairPayload(text)).toEqual(payload);
  });

  it("refuses another QR code or an incomplete one", () => {
    expect(parseHubPairPayload("https://example.com")).toBeNull();
    expect(
      parseHubPairPayload(
        text.replace('"code":"123456"', '"code":"12345"'),
      ),
    ).toBeNull();
  });
});

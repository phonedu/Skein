import { describe, expect, it } from "vitest";
import { resolveStrings } from "../../i18n/strings";
import { fill } from "../../i18n/fill";
import {
  KODO_REGIONS,
  errorText,
  isKodoRegion,
  kodoEndpoint,
  parseHubPairPayload,
  s3DefaultsFromEndpoint,
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

describe("S3 defaults from an address", () => {
  it("reads Qiniu's native mode and region", () => {
    expect(s3DefaultsFromEndpoint("https://s3.cn-south-1.qiniucs.com")).toEqual(
      { region: "cn-south-1", s3Flavor: "kodo" },
    );
  });

  it("offers exactly Qiniu's eight upload regions", () => {
    expect(KODO_REGIONS).toHaveLength(8);
    expect(isKodoRegion("cn-south-1")).toBe(true);
    expect(isKodoRegion("eu-west-1")).toBe(false);
    expect(kodoEndpoint("cn-south-1")).toBe(
      "https://s3.cn-south-1.qiniucs.com",
    );
    expect(errorText(t, "regionRequired")).toBe(t.syncErrorRegion);
  });

  it("reads Alibaba OSS's flavour and region", () => {
    expect(
      s3DefaultsFromEndpoint("https://oss-cn-hangzhou.aliyuncs.com"),
    ).toEqual({ region: "cn-hangzhou", s3Flavor: "oss" });
  });

  it("reads an AWS region and leaves the flavour standard", () => {
    expect(
      s3DefaultsFromEndpoint("https://s3.eu-west-1.amazonaws.com"),
    ).toEqual({ region: "eu-west-1", pathStyle: false });
  });

  it("leaves an unknown or unreadable address to the fields", () => {
    expect(s3DefaultsFromEndpoint("https://s3.example.com")).toEqual({});
    expect(s3DefaultsFromEndpoint("not a url")).toEqual({});
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
      parseHubPairPayload(text.replace('"code":"123456"', '"code":"12345"')),
    ).toBeNull();
  });
});

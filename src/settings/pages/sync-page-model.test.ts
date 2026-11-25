import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveStrings } from "../../i18n/strings";
import { fill } from "../../i18n/fill";
import {
  KODO_REGIONS,
  connectionTypeLabel,
  errorText,
  isKodoRegion,
  kodoEndpoint,
  parseHubPairPayload,
  s3DefaultsFromEndpoint,
  s3ProviderName,
  s3ProviderOf,
  syncStatusText,
  vaultTypeLabel,
} from "./sync-page-model";

const t = resolveStrings("en");

describe("sync page text", () => {
  it("names the two identity stops", () => {
    expect(errorText(t, "identityFork: a.md")).toBe(t.syncErrorIdentityFork);
    expect(errorText(t, "identityConflict: a.md")).toBe(
      t.syncErrorIdentityConflict,
    );
  });

  it("explains busy, quota and permission refusals", () => {
    expect(errorText(t, "rateLimited")).toBe(t.syncErrorRateLimited);
    expect(errorText(t, "quotaError")).toBe(t.syncErrorQuota);
    expect(errorText(t, "permissionError")).toBe(t.syncErrorPermission);
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

  it("keeps the Rust and TypeScript region tables equal", () => {
    const source = readFileSync(
      join(process.cwd(), "src-tauri/crates/textus-sync/src/kodo.rs"),
      "utf8",
    );
    const table = source.match(
      /pub const REGIONS: \[\(&str, &str\); 8\] = \[([\s\S]*?)\];/,
    );
    expect(table).not.toBeNull();
    const rust = [...table![1].matchAll(/\("([^"]+)", "([^"]+)"\)/g)].map(
      (pair) => [pair[1], pair[2]],
    );
    expect(rust).toEqual(KODO_REGIONS.map(({ id, host }) => [id, host]));
  });

  it("reads Alibaba OSS's flavour and region", () => {
    expect(
      s3DefaultsFromEndpoint("https://oss-cn-hangzhou.aliyuncs.com"),
    ).toEqual({ region: "cn-hangzhou", s3Flavor: "oss" });
  });

  it("reads Bitiful's fixed region and path-style address", () => {
    expect(s3DefaultsFromEndpoint("https://s3.bitiful.net")).toEqual({
      region: "cn-east-1",
      pathStyle: true,
    });
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

describe("S3 providers", () => {
  const bitiful = {
    provider: "s3" as const,
    endpoint: "https://s3.bitiful.net",
    s3Flavor: "standard" as const,
  };
  const kodo = {
    provider: "s3" as const,
    endpoint: "https://s3.cn-south-1.qiniucs.com",
    s3Flavor: "kodo" as const,
  };
  const oss = {
    provider: "s3" as const,
    endpoint: "https://oss-cn-hangzhou.aliyuncs.com",
    s3Flavor: "oss" as const,
  };
  const plain = {
    provider: "s3" as const,
    endpoint: "https://s3.example.com",
    s3Flavor: "standard" as const,
  };

  it("names the service from the flavour and the address", () => {
    expect(s3ProviderOf(bitiful)).toBe("bitiful");
    expect(s3ProviderOf(kodo)).toBe("kodo");
    expect(s3ProviderOf(oss)).toBe("oss");
    expect(s3ProviderOf(plain)).toBe("standard");
    expect(
      s3ProviderOf({
        provider: "webdav",
        endpoint: "https://dav",
        s3Flavor: "standard",
      }),
    ).toBeNull();
  });

  it("gives the provider its own word", () => {
    expect(s3ProviderName(t, "bitiful")).toBe(t.syncS3Bitiful);
    expect(s3ProviderName(t, "kodo")).toBe(t.syncS3KodoName);
    expect(s3ProviderName(t, "oss")).toBe(t.syncS3Oss);
    expect(s3ProviderName(t, "standard")).toBe(t.syncS3Standard);
  });

  it("uses it in the connection and vault badges", () => {
    expect(connectionTypeLabel(t, { id: "c1", ...bitiful })).toBe(
      t.syncS3Bitiful,
    );
    expect(connectionTypeLabel(t, { id: "c2", ...kodo })).toBe(
      t.syncS3KodoName,
    );
    expect(vaultTypeLabel(t, { connectionId: "c1", ...bitiful })).toBe(
      t.syncS3Bitiful,
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
      parseHubPairPayload(text.replace('"code":"123456"', '"code":"12345"')),
    ).toBeNull();
  });
});

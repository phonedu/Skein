import { describe, expect, it } from "vitest";
import { vaultName, vaultRows } from "./vault-model";

const SAF =
  "content://com.android.externalstorage.documents/tree/primary%3ANotes";

describe("a library's name", () => {
  it("is the last piece of a path, however it is separated", () => {
    expect(vaultName("/home/me/Notes")).toBe("Notes");
    expect(vaultName("/home/me/Notes/")).toBe("Notes");
    expect(vaultName("C:\\Users\\me\\Vault")).toBe("Vault");
  });

  it("is the folder's name inside a phone's SAF URL", () => {
    // The document id's volume prefix is not the name.
    expect(vaultName(SAF)).toBe("Notes");
    expect(vaultName("primary:Notes")).toBe("Notes");
  });

  it("keeps a segment that is not a name", () => {
    expect(vaultName("/notes/100%")).toBe("100%");
    expect(vaultName("C:")).toBe("C:");
  });
});

describe("the switcher's rows", () => {
  it("puts the open library first", () => {
    expect(vaultRows("/b", ["/a", "/c"]).map((row) => row.name)).toEqual([
      "b",
      "a",
      "c",
    ]);
    expect(vaultRows("/b", ["/a"])[0].current).toBe(true);
  });

  it("shows the open library once, not again from the recent list", () => {
    const rows = vaultRows("/a", ["/a/", "/b"]);
    expect(rows.map((row) => row.path)).toEqual(["/a", "/b"]);
    expect(rows.some((row) => row.current && row.path === "/b")).toBe(false);
  });

  it("has only the recent libraries when none is open", () => {
    expect(vaultRows(null, ["/a", "/b"]).map((row) => row.current)).toEqual([
      false,
      false,
    ]);
    expect(vaultRows(null, [])).toEqual([]);
  });

  it("keeps the URL a phone stored as the path to open", () => {
    expect(vaultRows(null, [SAF])[0]).toEqual({
      path: SAF,
      name: "Notes",
      current: false,
    });
  });
});

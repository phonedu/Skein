import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** The chat page's proxy fields, read as source: a missing shared class is
 *  what left them as the browser's own inset box. */
const source = readFileSync("src/settings/sections/chat.tsx", "utf8");

describe("the chat page's proxy fields", () => {
  it("uses the shared text field, not the browser's own box", () => {
    const fields = [
      ...source.matchAll(
        /className="([^"]*settings-proxy-(?:host|port)[^"]*)"/g,
      ),
    ].map((match) => match[1]);
    expect(fields).toHaveLength(4);
    for (const field of fields) {
      expect(field.split(/\s+/)).toContain("tx-input");
      expect(field.split(/\s+/)).toContain("settings-text-input");
    }
  });
});

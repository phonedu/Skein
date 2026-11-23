// @vitest-environment jsdom
// The asset library's tool calls as the chat's timeline (D1t): the call
// and its result pair by the backend's call id, the envelope parses into
// a summary a row can hold, and the transcript shows one card per call —
// the result turn itself nothing. Other tools keep their lines.
import { describe, expect, it } from "vitest";
import {
  assetCallsOf,
  assetParamsSummary,
  assetResultOf,
  ASSET_TOOLS,
} from "./asset-calls";
import { itemOf, readTranscript } from "./chat-transcript";
import type { AgentTurn } from "../types";

const call = (
  id: string,
  name: string,
  args: Record<string, unknown>,
): AgentTurn => ({
  kind: "ToolCall",
  call_id: id,
  name,
  arguments: JSON.stringify(args),
});
const result = (id: string, out: unknown): AgentTurn => ({
  kind: "ToolResult",
  call_id: id,
  output: JSON.stringify(out),
});

describe("asset calls", () => {
  it("knows the seven tools", () => {
    expect([...ASSET_TOOLS].sort()).toEqual(
      [
        "search_notes",
        "read_note",
        "resolve_assets_for_trigger",
        "create_draft",
        "propose_patch",
        "request_confirm",
        "record_use",
      ].sort(),
    );
  });

  it("pairs a call with its result, and a streamed one runs without", () => {
    const turns = [
      call("c1", "search_notes", { query: "家电" }),
      result("c1", { ok: true, data: { items: [], total: 2 } }),
      call("c2", "create_draft", { type: "task", title: "新任务" }),
    ];
    const calls = assetCallsOf(turns);
    expect(calls.get("c1")).toMatchObject({ output: expect.any(String) });
    expect(calls.get("c2")?.output).toBeNull();
    expect(calls.size).toBe(2);
  });

  it("summarizes each tool's argument", () => {
    expect(assetParamsSummary("search_notes", '{"query":"家电清洗"}')).toBe(
      "家电清洗",
    );
    expect(assetParamsSummary("read_note", '{"id":"A-1"}')).toBe("A-1");
    expect(
      assetParamsSummary("create_draft", '{"type":"task","title":"调研"}'),
    ).toBe("调研");
    expect(
      assetParamsSummary(
        "propose_patch",
        '{"id":"T-1","patches":[{"field":"title","after":"x"},{"field":"body","after":"y"}]}',
      ),
    ).toBe("T-1 · title · body");
    expect(
      assetParamsSummary("request_confirm", '{"id":"T-1","target":"blocked"}'),
    ).toBe("T-1 → blocked");
    // Partial arguments: the tool's line stands without them.
    expect(assetParamsSummary("propose_patch", "not json")).toBe("");
  });

  it("parses the envelope: counts, ids, pending, use totals", () => {
    expect(
      assetResultOf("search_notes", '{"ok":true,"data":{"total":5}}'),
    ).toEqual({
      ok: true,
      pending: false,
      count: 5,
      id: "",
      useCount: null,
      error: "",
    });
    const confirm = assetResultOf(
      "request_confirm",
      '{"ok":true,"data":{"requestId":"REQ-1","id":"T-1","target":"blocked","status":"pending"}}',
    )!;
    expect(confirm.pending).toBe(true);
    expect(confirm.id).toBe("REQ-1");
    const patch = assetResultOf(
      "propose_patch",
      '{"ok":true,"data":{"proposalId":"REQ-2","requiresConfirmation":true}}',
    )!;
    expect(patch.pending).toBe(true);
    const use = assetResultOf(
      "record_use",
      '{"ok":true,"data":{"assetId":"A-1","useCount":3,"verifiedCount":1}}',
    )!;
    expect(use.useCount).toBe(3);
    expect(use.pending).toBe(false);
    const read = assetResultOf(
      "read_note",
      '{"ok":true,"data":{"card":{"id":"A-1","title":"报价前检查清单"}}}',
    )!;
    expect(read.id).toBe("报价前检查清单");
  });

  it("reads a failure out of the envelope, and plain text as no envelope", () => {
    const failed = assetResultOf(
      "propose_patch",
      '{"ok":false,"error":"a card changed"}',
    )!;
    expect(failed.ok).toBe(false);
    expect(failed.error).toBe("a card changed");
    expect(assetResultOf("read_note", "the model said something")).toBeNull();
  });

  it("shows one card per call and hides the result turn", () => {
    const turns: AgentTurn[] = [
      { kind: "User", text: "hi" },
      call("c1", "search_notes", { query: "家电" }),
      result("c1", { ok: true, data: { total: 2 } }),
      call("other", "search_document", { query: "家电" }),
      result("other", "some text"),
    ];
    const t = readTranscript(turns);
    const kinds = turns.map((turn) => itemOf(turn, t).kind);
    expect(kinds).toEqual([
      "turn",
      "asset",
      "none",
      // Other tools keep their plain line.
      "turn",
      "turn",
    ]);
    const card = itemOf(turns[1], t) as {
      kind: "asset";
      call: { output: string | null };
    };
    expect(card.call.output).toContain('"total":2');
  });
});

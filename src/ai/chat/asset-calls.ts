import type { AgentTurn } from "../types";

/**
 * The asset library's D1c tools as the chat's timeline (D1t): each call
 * draws a card — the tool, its argument, its result and, for the writes
 * that ask, the pending badge into the confirm center. The envelope the
 * plugin answers with (`{ok, data|error}`, the toolchain stringifies) is
 * parsed here; nothing about the tools' contract changes.
 */

export const ASSET_TOOLS = new Set([
  "search_notes",
  "read_note",
  "resolve_assets_for_trigger",
  "create_draft",
  "propose_patch",
  "request_confirm",
  "record_use",
]);

export interface AssetCall {
  callId: string;
  name: string;
  arguments: string;
  /** The paired result's output, null while the call still runs. */
  output: string | null;
}

/** Each asset call with its result, by call id: results pair by the id
 *  the backend gave the call, so a streamed one fills in when it lands. */
export function assetCallsOf(turns: AgentTurn[]): Map<string, AssetCall> {
  const calls = new Map<string, AssetCall>();
  for (const turn of turns) {
    if (turn.kind === "ToolCall" && ASSET_TOOLS.has(turn.name)) {
      calls.set(turn.call_id, {
        callId: turn.call_id,
        name: turn.name,
        arguments: turn.arguments,
        output: null,
      });
    } else if (turn.kind === "ToolResult" && calls.has(turn.call_id)) {
      calls.get(turn.call_id)!.output = turn.output;
    }
  }
  return calls;
}

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** The call's own argument, in words a row can hold: the query, the card
 *  it touched, the fields a patch would change. Content, not labels — a
 *  title reads the same in every language. */
export function assetParamsSummary(name: string, argsJson: string): string {
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(argsJson) ?? {};
  } catch {
    // Partial or malformed arguments: the card shows the tool alone.
  }
  switch (name) {
    case "search_notes":
      return text(args.query);
    case "read_note":
      return text(args.id);
    case "resolve_assets_for_trigger":
      return text(args.stage);
    case "create_draft":
      return text(args.title);
    case "propose_patch":
      return [text(args.id), ...fieldsOf(args.patches)]
        .filter(Boolean)
        .join(" · ");
    case "request_confirm":
      return [text(args.id), text(args.target)].filter(Boolean).join(" → ");
    case "record_use":
      return [text(args.id), text(args.result)].filter(Boolean).join(" · ");
    default:
      return "";
  }
}

function fieldsOf(patches: unknown): string[] {
  return Array.isArray(patches)
    ? patches
        .map((p) => text((p as { field?: unknown })?.field))
        .filter(Boolean)
    : [];
}

/** A result's summary, in pieces the card words: the count a search found,
 *  the card a write touched, the pending mark of one that asks. */
export interface AssetResult {
  ok: boolean;
  /** Waiting in the confirm queue (propose_patch, request_confirm). */
  pending: boolean;
  /** Matches found (search_notes, resolve_assets_for_trigger). */
  count: number | null;
  /** The card or request the call is about; a read's title. */
  id: string;
  /** A use's running total (record_use). */
  useCount: number | null;
  /** The failure's own words (ok: false). */
  error: string;
}

/** The result parsed out of the plugin's envelope; null when the output
 *  isn't one (an old chat's raw text) — the card then shows the plain
 *  line, as any other tool's does. */
export function assetResultOf(
  name: string,
  output: string,
): AssetResult | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const envelope = parsed as { ok?: unknown; data?: unknown; error?: unknown };
  if (typeof envelope.ok !== "boolean") return null;
  if (!envelope.ok) {
    return {
      ok: false,
      pending: false,
      count: null,
      id: "",
      useCount: null,
      error:
        typeof envelope.error === "string"
          ? envelope.error
          : JSON.stringify(envelope.error ?? ""),
    };
  }
  const data = (envelope.data ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" ? v : null);
  const card = data.card as { id?: unknown; title?: unknown } | undefined;
  return {
    ok: true,
    pending: data.status === "pending" || data.requiresConfirmation === true,
    count:
      name === "search_notes" || name === "resolve_assets_for_trigger"
        ? (num(data.total) ?? 0)
        : null,
    id:
      text(data.proposalId) ||
      text(data.requestId) ||
      text(data.id) ||
      text(data.assetId) ||
      (name === "read_note" ? text(card?.title) || text(card?.id) : "") ||
      text(data.path),
    useCount: name === "record_use" ? (num(data.useCount) ?? 0) : null,
    error: "",
  };
}

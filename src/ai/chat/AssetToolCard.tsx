import { SearchIcon } from "../../engine/controls/icons";
import { emitToThisWindow } from "../../platform/menu-events";
import {
  assetParamsSummary,
  assetResultOf,
  type AssetCall,
} from "./asset-calls";
import "./AssetToolCard.css";

/** The asset timeline's card labels: the seven tools' names, the pending
 *  badge and where it goes, the result lines' words. */
export interface AssetCardLabels {
  /** A tool's name, by tool name; "*" falls back to the raw name. */
  titles: Record<string, string>;
  /** The badge of a change waiting in the confirm queue. */
  pending: string;
  /** The badge's way in: the confirm center. */
  openConfirm: string;
  /** A call that didn't finish. */
  failed: string;
  /** "{n} matches", a search's or a resolve's find. */
  matches: (n: number) => string;
  /** A use recorded, "{n}" the running total. */
  used: (n: number) => string;
  /** Nothing else to say (a read, a draft): "Done". */
  done: string;
  /** The call still running: what it is doing, the working line's words. */
  working: (call: AssetCall) => string;
}

/**
 * One asset tool call, a card: the tool and its argument on the head row,
 * the result (a count, the card it touched, the failure) under, and for a
 * change that asks, the pending badge that opens the confirm center — the
 * queue is the truth, the badge only the way in.
 */
export function AssetToolCard({
  call,
  labels,
}: {
  call: AssetCall;
  labels: AssetCardLabels;
}) {
  const title = labels.titles[call.name] ?? call.name;
  const params = assetParamsSummary(call.name, call.arguments);
  const result =
    call.output === null ? null : assetResultOf(call.name, call.output);
  return (
    <div
      className="agent-asset-card"
      data-pending={result?.pending || undefined}
    >
      <div className="agent-asset-card-head">
        <SearchIcon className="agent-asset-card-icon" />
        <span className="agent-asset-card-name">{title}</span>
        {params && (
          <span className="tx-truncate agent-asset-card-params" title={params}>
            {params}
          </span>
        )}
        {result?.pending && (
          <button
            type="button"
            className="agent-asset-card-badge"
            title={labels.openConfirm}
            onClick={() =>
              emitToThisWindow("menu-plugin-command", "skein.collect.confirm")
            }
          >
            {labels.pending}
          </button>
        )}
      </div>
      {result === null ? (
        <div className="agent-asset-card-result is-live">
          {labels.working(call)}
        </div>
      ) : !result.ok ? (
        <div className="agent-asset-card-result is-failed">
          {labels.failed}
          {result.error && (
            <span className="tx-truncate agent-asset-card-error">
              {" · "}
              {result.error}
            </span>
          )}
        </div>
      ) : (
        <div className="agent-asset-card-result">
          {result.pending && result.id
            ? result.id
            : result.count !== null
              ? labels.matches(result.count)
              : result.useCount !== null
                ? labels.used(result.useCount)
                : result.id || labels.done}
        </div>
      )}
    </div>
  );
}

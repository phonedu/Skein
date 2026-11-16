import type { ReactNode } from "react";
import "./view-foot.css";

/**
 * A view's foot (interface redesign, the notes board's bottom strip): one
 * line of what the view is on the left, one line of fact on the right. Two
 * slots only - a view fills them with its own words.
 */
export function ViewFoot({
  left,
  right,
}: {
  left: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="view-foot">
      <span className="view-foot-note">{left}</span>
      {right !== undefined && right !== "" && (
        <span className="view-foot-count">{right}</span>
      )}
    </div>
  );
}

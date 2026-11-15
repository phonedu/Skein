import type { ReactNode } from "react";
import "./settings-row.css";

/**
 * A settings row (design board ui-d-settings): the label with a small
 * description under it, the value control at the row's end, hairline
 * between rows.
 */
export function SettingsRow(props: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="settings-row">
      <div className="settings-row-label">
        <span className="settings-row-name">{props.label}</span>
        {props.description ? (
          <span className="settings-row-desc">{props.description}</span>
        ) : null}
      </div>
      <div className="settings-row-value">{props.children}</div>
    </div>
  );
}

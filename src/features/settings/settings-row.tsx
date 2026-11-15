import { createContext, useContext, useId, type ReactNode } from "react";
import "./settings-row.css";

/** The row a control sits in: its label names the control, so a screen
 *  reader hears "自动保存, switch" rather than a nameless switch. */
const RowLabel = createContext<string | undefined>(undefined);

export function useSettingsRowLabel(): string | undefined {
  return useContext(RowLabel);
}

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
  const labelId = useId();
  return (
    <div className="settings-row">
      <div className="settings-row-label">
        <span id={labelId} className="settings-row-name">
          {props.label}
        </span>
        {props.description ? (
          <span className="settings-row-desc">{props.description}</span>
        ) : null}
      </div>
      <div className="settings-row-value">
        <RowLabel.Provider value={labelId}>{props.children}</RowLabel.Provider>
      </div>
    </div>
  );
}

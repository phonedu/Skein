import type { ReactNode } from "react";

/** A page section: the board's group heading over its rows; the heading
 *  row may carry what acts on the whole group (import, add). The title is
 *  none for a headless group that only holds a panel. */
export function PageGroup(props: {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="settings-page-group" aria-label={props.title}>
      {(props.title || props.actions) && (
        <div className="settings-page-group-head">
          {props.title && (
            <h3 className="settings-page-group-title tx-section-label">
              {props.title}
            </h3>
          )}
          {props.actions && (
            <div className="settings-page-group-actions">{props.actions}</div>
          )}
        </div>
      )}
      <div className="settings-page-group-body">{props.children}</div>
    </section>
  );
}

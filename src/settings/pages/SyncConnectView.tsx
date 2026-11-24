// New or edit a connection, in place: one type switch (WebDAV, S3, a
// local-network Hub), then only the fields that service asks for. Cancel
// closes the panel; the page under it never moves.
import type { ComponentProps } from "react";
import type { Strings } from "../../i18n/strings";
import { SyncConnectionFields } from "./SyncConnectionFields";
import { SettingsGroup } from "./SettingsGroup";
import { SyncHubJoin } from "./SyncHubJoin";
import type { SyncConnectionType } from "./sync-page-model";

export interface SyncConnectViewProps {
  t: Strings;
  mode: "new" | "edit";
  /** The type shown; a new form starts at WebDAV and the segmented switch
   *  changes it in place. */
  type: SyncConnectionType;
  mobile: boolean;
  root: string;
  configured: boolean;
  busy: boolean;
  unsupportedRoot: boolean;
  onTypeChange: (type: SyncConnectionType) => void;
  onCancel: () => void;
  onSave: () => void;
  onImport: () => void;
  onPaired: () => void;
  fields: ComponentProps<typeof SyncConnectionFields>;
}

/** "WebDAV · New connection": the type the form belongs to. */
function typeName(t: Strings, type: SyncConnectionType): string {
  return type === "s3" ? "S3" : type === "hub" ? t.syncHubTitle : "WebDAV";
}

export function SyncConnectView(props: SyncConnectViewProps) {
  const {
    t,
    mode,
    type,
    mobile,
    root,
    configured,
    busy,
    unsupportedRoot,
    onTypeChange,
    onCancel,
    onSave,
    onImport,
    onPaired,
    fields,
  } = props;
  const title =
    mode === "new"
      ? t.syncConnectionNew
      : `${typeName(t, type)} · ${t.syncConnectionEdit}`;
  const cancel = (
    <button
      type="button"
      className="text-button settings-inline-button"
      disabled={busy}
      onClick={onCancel}
    >
      {t.cancel}
    </button>
  );

  return (
    <SettingsGroup title={title} className="sync-page" actions={cancel}>
      {mode === "new" && (
        <div
          className="sync-segmented"
          role="group"
          aria-label={t.syncConnectionLabel}
        >
          {(["webdav", "s3", "hub"] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={option === type ? "is-on" : ""}
              aria-pressed={option === type}
              disabled={busy}
              onClick={() => onTypeChange(option)}
            >
              {typeName(t, option)}
            </button>
          ))}
        </div>
      )}
      {type === "hub" ? (
        <SyncHubJoin
          t={t}
          root={root}
          mobile={mobile}
          disabled={unsupportedRoot}
          onPaired={onPaired}
        />
      ) : (
        <SyncConnectionFields {...fields} />
      )}
      <div className="sync-actions sync-form-actions">
        {mode === "new" && !configured && type !== "hub" && (
          <button
            type="button"
            className="text-button settings-inline-button"
            disabled={busy || unsupportedRoot}
            onClick={onImport}
          >
            {t.syncImportPlugin}
          </button>
        )}
        <span className="sync-actions-end">
          <button
            type="button"
            className="tx-button"
            disabled={busy}
            onClick={onCancel}
          >
            {t.cancel}
          </button>
          {type !== "hub" && (
            <button
              type="button"
              className="tx-button primary"
              disabled={busy || unsupportedRoot}
              onClick={onSave}
            >
              {t.syncSavePreview}
            </button>
          )}
        </span>
      </div>
    </SettingsGroup>
  );
}

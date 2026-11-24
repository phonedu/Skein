import { useEffect, useState } from "react";
import { usePhoneLayout } from "../engine/controls/usePhoneLayout";
import { usePlacement } from "../engine/controls/usePlacement";
import { Sheet } from "../engine/controls/Sheet";
import {
  CheckIcon,
  FolderIcon,
  PlusIcon,
  TrashIcon,
} from "../engine/controls/icons";
import { usePresenceProps } from "../engine/motion/usePresence";
import type { Strings } from "../i18n/strings";
import { recents } from "../platform/ipc-files";
import { useCloseOnOutsideClick } from "../utils/hooks/useCloseOnOutsideClick";
import { vaultRows, type VaultEntry } from "./vault-model";
import "./VaultPanel.css";

/**
 * The libraries this app has opened: the one in front, the ones chosen
 * before, and the way to add another. A desktop hangs it under the library's
 * name; a phone raises it from the bottom, as the phone's sheets do. A
 * library's trash takes it off this list - never off the disk.
 */
export function VaultPanel({
  t,
  current,
  onOpen,
  onAdd,
  onClose,
  anchor,
}: {
  t: Strings;
  /** The folder in front: its name and path, marked, not switchable. */
  current: string | null;
  onOpen: (path: string) => void;
  onAdd: () => void;
  onClose: () => void;
  /** The button it hangs from, on a desktop. */
  anchor?: HTMLElement | null;
}) {
  const phone = usePhoneLayout();
  const [recent, setRecent] = useState<string[] | null>(null);
  useEffect(() => {
    let live = true;
    void recents
      .listFolders()
      .then((list) => {
        if (live) setRecent(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (live) setRecent([]);
      });
    return () => {
      live = false;
    };
  }, []);
  const rows = vaultRows(current, recent ?? []);
  const remove = (path: string) => {
    setRecent((now) =>
      (now ?? []).filter(
        (kept) => kept.replace(/[\\/]+$/, "") !== path.replace(/[\\/]+$/, ""),
      ),
    );
    // The list only: the folder and its documents stay.
    void recents.remove(path).catch(() => {});
  };
  const panel = useCloseOnOutsideClick<HTMLDivElement>(
    onClose,
    true,
    !phone,
    anchor ?? null,
  );
  const presence = usePresenceProps<HTMLDivElement>(panel);
  const box = anchor?.getBoundingClientRect();
  const pos = usePlacement(panel, box?.left ?? 16, box ? box.bottom + 6 : 16, {
    anchor: () => anchor,
  });
  // A desktop opens it from the keyboard: its first row takes the focus, and
  // the name it came from takes it back.
  useEffect(() => {
    if (phone || !anchor) return;
    panel.current
      ?.querySelector<HTMLElement>("button.vault-row-main, .vault-add")
      ?.focus({ preventScroll: true });
    return () => anchor.focus({ preventScroll: true });
  }, [phone, anchor, panel]);

  const body = (
    <VaultBody
      t={t}
      rows={rows}
      onOpen={(path) => {
        onOpen(path);
        onClose();
      }}
      onRemove={remove}
      onAdd={() => {
        onAdd();
        onClose();
      }}
    />
  );
  if (phone)
    return (
      <Sheet
        role="dialog"
        label={t.phoneVaultSwitcherTitle}
        className="vault-sheet"
        onClose={onClose}
      >
        <div className="action-sheet-grab" aria-hidden />
        {body}
        <button
          type="button"
          className="action-sheet-item action-sheet-cancel"
          onClick={onClose}
        >
          {t.cancel}
        </button>
      </Sheet>
    );
  return (
    <div
      {...presence}
      className="vault-panel floating-surface"
      style={pos}
      role="dialog"
      aria-label={t.phoneVaultSwitcherTitle}
    >
      {body}
    </div>
  );
}

function VaultBody({
  t,
  rows,
  onOpen,
  onRemove,
  onAdd,
}: {
  t: Strings;
  rows: readonly VaultEntry[];
  onOpen: (path: string) => void;
  onRemove: (path: string) => void;
  onAdd: () => void;
}) {
  const removable = rows.some((row) => !row.current);
  return (
    <>
      <div className="vault-head tx-section-label">
        {t.phoneVaultSwitcherTitle}
      </div>
      <div className="vault-group">
        {rows.length === 0 ? (
          <p className="vault-empty">{t.phoneVaultNone}</p>
        ) : (
          rows.map((row) => (
            <VaultRow
              key={row.path}
              t={t}
              row={row}
              onOpen={onOpen}
              onRemove={onRemove}
            />
          ))
        )}
        <button type="button" className="vault-add" onClick={onAdd}>
          <span className="vault-row-ic" aria-hidden>
            <PlusIcon />
          </span>
          <span className="vault-add-label">{t.vaultAdd}</span>
        </button>
      </div>
      {removable ? <p className="vault-hint">{t.vaultRemoveHint}</p> : null}
    </>
  );
}

function VaultRow({
  t,
  row,
  onOpen,
  onRemove,
}: {
  t: Strings;
  row: VaultEntry;
  onOpen: (path: string) => void;
  onRemove: (path: string) => void;
}) {
  const text = (
    <>
      <span className="vault-row-ic" aria-hidden>
        <FolderIcon />
      </span>
      <span className="vault-row-text">
        <span className="vault-row-name">{row.name}</span>
        <span className="vault-row-path">{row.path}</span>
      </span>
    </>
  );
  return (
    <div className="vault-row" data-current={row.current || undefined}>
      {row.current ? (
        <div className="vault-row-main" aria-current="true">
          {text}
          <CheckIcon className="vault-row-check" />
        </div>
      ) : (
        <>
          <button
            type="button"
            className="vault-row-main"
            onClick={() => onOpen(row.path)}
          >
            {text}
          </button>
          <button
            type="button"
            className="vault-row-remove"
            title={t.vaultRemove}
            aria-label={`${t.vaultRemove}: ${row.name}`}
            onClick={() => onRemove(row.path)}
          >
            <TrashIcon />
          </button>
        </>
      )}
    </div>
  );
}

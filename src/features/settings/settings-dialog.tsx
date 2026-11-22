import { Dialog } from "@base-ui/react/dialog";
import { CloseIcon } from "../../engine/controls/icons";
import type { Strings } from "../../i18n/strings";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import "./settings-dialog.css";

/**
 * The settings page's shell (design board, 2026-11-22): an opaque panel
 * floating over the window - 1040 × 720 base units at the interface's
 * scale, the board's radius 18 and the dialog shadow on the nearest
 * tokens (--shape-m, --shadow-dialog). The background stays mounted: Base UI
 * provides the focus trap and Escape; the engine's Escape rules (the
 * innermost surface, the composing input method first) wrap it in Task 7's
 * wiring. Slots: the nav column and the page's content.
 */
export function SettingsDialog(props: {
  t: Strings;
  open: boolean;
  /** The layer keeps this mounted through the exit and keeps it open to
   *  Base UI; the panel itself plays the way out. */
  closing?: boolean;
  onClose: () => void;
  nav: ReactNode;
  children: ReactNode;
}) {
  const t = props.t;
  const closing = props.closing === true;
  const popup = useRef<HTMLDivElement>(null);
  // A modal the app knows about: the window bar rests while it is open, as
  // it does for the engine's own dialogs (useModalDialog's mark).
  useEffect(() => {
    if (!props.open) return;
    const root = document.documentElement;
    const had = root.hasAttribute("data-modal-open");
    if (!had) root.setAttribute("data-modal-open", "");
    return () => {
      // Only the one that set the mark takes it away.
      if (!had) root.removeAttribute("data-modal-open");
    };
  }, [props.open]);
  return (
    <Dialog.Root
      open={props.open}
      onOpenChange={(open) => {
        if (!open && !closing) props.onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop
          className={"settings-dim" + (closing ? " settings-dim-closing" : "")}
        />
        <Dialog.Popup
          ref={popup}
          className="settings-dialog"
          aria-modal="true"
          data-state={closing ? "closing" : "open"}
          inert={closing || undefined}
          // The search is where a settings dialog is used from; the close
          // button's ring on open read as an error, not as focus.
          initialFocus={() =>
            popup.current?.querySelector<HTMLElement>(
              ".settings-search .tx-search-input",
            ) ?? true
          }
        >
          <div className="settings-dialog-top">
            <Dialog.Title className="settings-dialog-title">
              {t.settingsTitle}
            </Dialog.Title>
            <Dialog.Close
              className="settings-dialog-close"
              aria-label={t.close}
            >
              <CloseIcon />
            </Dialog.Close>
          </div>
          <div className="settings-dialog-body">
            <div className="settings-dialog-nav">{props.nav}</div>
            <div className="settings-dialog-content">{props.children}</div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

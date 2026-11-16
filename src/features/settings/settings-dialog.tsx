import { Dialog } from "@base-ui/react/dialog";
import { CloseIcon } from "../../engine/controls/icons";
import type { Strings } from "../../i18n/strings";
import type { ReactNode } from "react";
import "./settings-dialog.css";

/**
 * The settings page's shell (design board ui-d-settings): an opaque panel
 * floating over the window - 880 × 556 base units at the interface's scale,
 * the board's radius 18 and 0 34px 80px shadow on the nearest tokens
 * (--shape-m, --shadow-dialog). The background stays mounted: Base UI
 * provides the focus trap and Escape; the engine's Escape rules (the
 * innermost surface, the composing input method first) wrap it in Task 7's
 * wiring. Slots: the nav column and the page's content.
 */
export function SettingsDialog(props: {
  t: Strings;
  open: boolean;
  onClose: () => void;
  nav: ReactNode;
  children: ReactNode;
}) {
  const t = props.t;
  return (
    <Dialog.Root
      open={props.open}
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="settings-dim" />
        <Dialog.Popup className="settings-dialog">
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

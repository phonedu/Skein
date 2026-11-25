// The phone home's fixed top: the library chip, its actions, and the
// Today | Files segment. The pages below it slide; this row does not.
import type { OpenFolder } from "../app/useOpenFolder";
import type { Strings } from "../i18n/strings";
import { MoreIcon, SettingsIcon } from "../engine/controls/icons";
import { emitToThisWindow } from "../platform/menu-events";
import { PHONE_PAGE_MORE_EVENT } from "../utils/events";
import { VaultButton } from "../vaults/VaultButton";
import { PhoneViewSeg } from "./PhoneViewSeg";
import { vaultName } from "../vaults/vault-model";

export function PhonePageHeader({
  t,
  page,
  openFolder,
  onChange,
  onCapture,
}: {
  t: Strings;
  page: "today" | "files";
  openFolder: OpenFolder;
  onChange: (page: "today" | "files") => void;
  onCapture: () => void;
}) {
  const place = openFolder.folder ?? openFolder.treeRoot ?? "";
  return (
    <>
      <div className="ptop">
        <VaultButton
          t={t}
          openFolder={openFolder}
          variant="today"
          current={place || null}
          name={place ? vaultName(place) : t.menuOpenFolder}
        />
        <span className="ptop-spacer" />
        <button
          type="button"
          className="ptop-ic"
          aria-label={t.phoneMoreActions}
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent(PHONE_PAGE_MORE_EVENT, { detail: page }),
            )
          }
        >
          <MoreIcon />
        </button>
        <button
          type="button"
          className="ptop-ic"
          aria-label={t.settingsTitle}
          onClick={() => emitToThisWindow("menu-settings")}
        >
          <SettingsIcon />
        </button>
      </div>
      <PhoneViewSeg
        t={t}
        value={page}
        onChange={(view) => view !== page && onChange(view)}
        onCapture={onCapture}
      />
    </>
  );
}

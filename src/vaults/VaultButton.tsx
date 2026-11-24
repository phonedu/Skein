import { useRef, useState } from "react";
import type { OpenFolder } from "../app/useOpenFolder";
import { ChevronDownIcon, FolderIcon } from "../engine/controls/icons";
import { Presence } from "../engine/motion/usePresence";
import type { Strings } from "../i18n/strings";
import { VaultPanel } from "./VaultPanel";

/** Each shell names the chip's parts its own way; the markup is one. */
const CHIP = {
  sidebar: {
    button: "sidebar-vault",
    icon: "sidebar-vault-icon",
    name: "sidebar-vault-name",
    chevron: "sidebar-vault-chev",
  },
  today: {
    button: "ptop-vault",
    icon: "ptop-vault-icon",
    name: "ptop-vault-name",
    chevron: "ptop-vault-chev",
  },
  files: {
    button: "ph-vault",
    icon: "vic",
    name: "vname",
    chevron: "vchev",
  },
} as const;

/**
 * The library in front, by name: the sidebar's, Today's or the library page's
 * chip. A press opens the switcher under it - the libraries chosen before,
 * the way to add one - and pressing it again puts it away.
 */
export function VaultButton({
  t,
  openFolder,
  variant,
  current,
  name,
}: {
  t: Strings;
  openFolder: OpenFolder;
  variant: keyof typeof CHIP;
  /** The folder in front, opened in full: null when none is. */
  current: string | null;
  /** What the chip reads: the library's name, or the way in. */
  name: string;
}) {
  const [open, setOpen] = useState(false);
  const chip = useRef<HTMLButtonElement>(null);
  const classes = CHIP[variant];
  return (
    <>
      <button
        ref={chip}
        type="button"
        className={classes.button}
        aria-haspopup="menu"
        aria-expanded={open}
        title={current ? t.phoneVaultSwitcherTitle : t.menuOpenFolder}
        onClick={() => setOpen((was) => !was)}
      >
        <span className={classes.icon}>
          <FolderIcon />
        </span>
        <span className={classes.name}>{name}</span>
        <ChevronDownIcon className={classes.chevron} />
      </button>
      <Presence show={open}>
        {open && (
          <VaultPanel
            t={t}
            current={current}
            anchor={chip.current}
            onOpen={(path) => {
              if (
                !current ||
                path.replace(/[\\/]+$/, "") !== current.replace(/[\\/]+$/, "")
              )
                openFolder.openFolder(path);
            }}
            onAdd={() => void openFolder.openFolderDialog()}
            onClose={() => setOpen(false)}
          />
        )}
      </Presence>
    </>
  );
}

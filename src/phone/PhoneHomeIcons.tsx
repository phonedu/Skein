// Icons for the phone home's library-switcher sheet. The vault icon echoes
// the chip in the top bar, so the sheet's current row and the chip read as
// one place.
import { iconSize } from "../engine/controls/icons";

function baseProps(className?: string) {
  return {
    viewBox: "0 0 24 24",
    width: "20",
    height: "20",
    style: iconSize(20, 20),
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
  };
}

/** A folder tab with the paper fold: the library's icon. */
export function VaultActionIcon({ className }: { className?: string }) {
  return (
    <svg {...baseProps(className)} aria-hidden>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
    </svg>
  );
}

/** A folder with a plus: open another one. */
export function OpenFolderActionIcon({ className }: { className?: string }) {
  return (
    <svg {...baseProps(className)} aria-hidden>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
      <path d="M12 11v6" />
      <path d="M9 14h6" />
    </svg>
  );
}

// Icons for the phone editor's action sheet. Stroke-based paper-and-ink,
// so they sit in the sheet's muted capsule and take the fire tint when a
// row is the one strong action.

function baseProps(className?: string) {
  return {
    viewBox: "0 0 24 24",
    width: "20",
    height: "20",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
  };
}

/** Three stacked lines of decreasing length: a document's headings. */
export function OutlineActionIcon({ className }: { className?: string }) {
  return (
    <svg {...baseProps(className)} aria-hidden>
      <path d="M5 7h14" />
      <path d="M8 12h11" />
      <path d="M11 17h8" />
    </svg>
  );
}

/** A magnifier over a page corner: find on this document. */
export function FindActionIcon({ className }: { className?: string }) {
  return (
    <svg {...baseProps(className)} aria-hidden>
      <circle cx="11" cy="11" r="6" />
      <path d="M20 20l-4.3-4.3" />
    </svg>
  );
}

/** A node branching outward: share. */
export function ShareActionIcon({ className }: { className?: string }) {
  return (
    <svg {...baseProps(className)} aria-hidden>
      <path d="M12 4v12" />
      <path d="M8 8l4-4 4 4" />
      <path d="M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
    </svg>
  );
}

/** A tray with a down arrow: send into the inbox. */
export function InboxActionIcon({ className }: { className?: string }) {
  return (
    <svg {...baseProps(className)} aria-hidden>
      <path d="M4 13h4l1.5 2.5h5L16 13h4" />
      <path d="M4 13V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6" />
      <path d="M4 13v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
    </svg>
  );
}

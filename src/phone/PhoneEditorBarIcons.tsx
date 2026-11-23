// Icons for the phone editor's action sheet. Stroke-based paper-and-ink,
// so they sit in the sheet's muted capsule and take the fire tint when a
// row is the one strong action.
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

/** Angle brackets: the document's own Markdown, source mode. */
export function SourceActionIcon({ className }: { className?: string }) {
  return (
    <svg {...baseProps(className)} aria-hidden>
      <path d="m9 8-4 4 4 4" />
      <path d="m15 8 4 4-4 4" />
    </svg>
  );
}

/** The other half of undo: the format bar's redo. */
export function RedoActionIcon({ className }: { className?: string }) {
  return (
    <svg {...baseProps(className)} aria-hidden>
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H14" />
    </svg>
  );
}

/** A checked square: a task list. */
export function TaskActionIcon({ className }: { className?: string }) {
  return (
    <svg {...baseProps(className)} aria-hidden>
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="m8 12 2.5 2.5L16 9" />
    </svg>
  );
}

/** A row moving in under the one above: indent a list item. */
export function IndentActionIcon({ className }: { className?: string }) {
  return (
    <svg {...baseProps(className)} aria-hidden>
      <path d="M4 6h16" />
      <path d="M4 12h8" />
      <path d="M4 18h16" />
      <path d="m16 9 3 3-3 3" />
    </svg>
  );
}

/** The same row moving back out: outdent a list item. */
export function OutdentActionIcon({ className }: { className?: string }) {
  return (
    <svg {...baseProps(className)} aria-hidden>
      <path d="M4 6h16" />
      <path d="M12 12h8" />
      <path d="M4 18h16" />
      <path d="m19 9-3 3 3 3" />
    </svg>
  );
}

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { isImeKeydown } from "../../utils/ime";
import { usePresenceProps } from "../motion/usePresence";
import "./sheet.css";

/**
 * A phone's sheet from the bottom edge: the dimming behind it, its spring in
 * and out, and the ways out - a tap outside or Escape (not while an input
 * method is composing). The menu (ActionSheet) and the card (BottomCard)
 * are its two bodies.
 */
export function Sheet({
  label,
  role = "dialog",
  className,
  onClose,
  children,
}: {
  /** What the sheet is, for assistive technology. */
  label?: string;
  role?: "menu" | "dialog";
  className: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const presence = usePresenceProps<HTMLDivElement>();
  const open = presence["data-state"] === "open";
  // Both in the commit that shows it: a key a moment later is already its.
  useLayoutEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isImeKeydown(e)) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, open]);
  // A menu takes the focus: the keyboard goes down, and nothing typed lands
  // in the document behind it.
  const sheet = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (role === "menu") sheet.current?.focus({ preventScroll: true });
  }, [role]);
  // The click a tap makes after the finger lifts can reach a sheet that the
  // same tap opened: only a press made on it counts (a key's click too).
  const pressed = useRef(false);
  // A finger on the grab handle pulls the sheet down: it follows, then
  // springs back or closes past a third of the screen.
  const grab = useRef<{ id: number; y: number } | null>(null);
  const [pull, setPull] = useState(0);
  const onGrabDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!(e.target as HTMLElement).closest(".action-sheet-grab")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    grab.current = { id: e.pointerId, y: e.clientY };
    e.preventDefault();
  };
  const onGrabMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const held = grab.current;
    if (!held || held.id !== e.pointerId) return;
    setPull(Math.max(0, e.clientY - held.y));
  };
  const onGrabUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const held = grab.current;
    if (!held || held.id !== e.pointerId) return;
    grab.current = null;
    if (e.clientY - held.y > 140) {
      setPull(0);
      onClose();
    } else setPull(0);
  };
  return createPortal(
    <div
      {...presence}
      className="sheet-scrim"
      onPointerDown={() => (pressed.current = true)}
      onClickCapture={(e) => {
        if (pressed.current || e.detail === 0) return;
        e.preventDefault();
        e.stopPropagation();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={sheet}
        tabIndex={-1}
        className={`sheet ${className}`}
        role={role}
        aria-label={label}
        style={
          pull
            ? { transform: `translateY(${pull}px)`, transition: "none" }
            : undefined
        }
        onPointerDown={onGrabDown}
        onPointerMove={onGrabMove}
        onPointerUp={onGrabUp}
        onPointerCancel={onGrabUp}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { isImeKeydown } from "../../utils/ime";
import { trackDrag } from "../drag/pointer-drag";
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
  // springs back or closes past two fifths of its own height. The pull is
  // written straight to the element - a state update would trail the finger
  // by a frame - and a release leaves the offset in place, so the closing
  // animation starts from where the finger let go instead of from the top.
  const onGrabDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!(e.target as HTMLElement).closest(".action-sheet-grab")) return;
    const el = sheet.current;
    if (!el) return;
    const down = e.clientY;
    const closeAt = Math.min(160, Math.max(72, el.offsetHeight * 0.4));
    let pulled = 0;
    trackDrag(e, {
      start: () => {
        // A finger owns the sheet now: its entrance spring (if still
        // running) must not hold the transform away from the finger.
        for (const animation of el.getAnimations?.() ?? []) animation.finish();
        el.classList.add("is-pulled");
      },
      move: (_x, y) => {
        pulled = Math.max(0, y - down);
        el.style.transform = `translateY(${pulled}px)`;
      },
      end: (_x, y, dropped) => {
        pulled = Math.max(pulled, Math.max(0, y - down));
        if (dropped && pulled > closeAt) {
          onClose();
          return;
        }
        // Under the threshold: spring back, then hand the transform back to
        // the stylesheet.
        el.classList.replace("is-pulled", "is-settling");
        el.style.transform = "translateY(0)";
        const settle = () => {
          el.classList.remove("is-settling");
          el.style.transform = "";
        };
        el.addEventListener("transitionend", settle, { once: true });
        window.setTimeout(settle, 400);
      },
    });
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
        onPointerDown={onGrabDown}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

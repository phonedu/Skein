import { useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { isImeKeydown } from "../../utils/ime";
import { swipeVelocity } from "../../utils/gesture";
import { trackDrag } from "../drag/pointer-drag";
import { motionAllowed } from "../motion/motion";
import { runSpring } from "../motion/spring";
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
  // springs back or closes past two fifths of its own height, or on a quick
  // flick down. The pull is written straight to the element - a state update
  // would trail the finger by a frame - and a release leaves the offset in
  // place, so the closing animation starts from where the finger let go
  // instead of from the top. The spring back starts with the finger's speed.
  const onGrabDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!(e.target as HTMLElement).closest(".action-sheet-grab")) return;
    const el = sheet.current;
    if (!el) return;
    const down = e.clientY;
    const closeAt = Math.min(160, Math.max(72, el.offsetHeight * 0.4));
    let pulled = 0;
    const samples: { value: number; t: number }[] = [];
    trackDrag(e, {
      start: () => {
        // A finger owns the sheet now: its entrance spring (if still
        // running) must not hold the transform away from the finger.
        for (const animation of el.getAnimations?.() ?? []) animation.finish();
        el.classList.add("is-pulled");
        samples.push({ value: down, t: performance.now() });
      },
      move: (_x, y) => {
        pulled = Math.max(0, y - down);
        el.style.transform = `translateY(${pulled}px)`;
        samples.push({ value: y, t: performance.now() });
        if (samples.length > 24) samples.shift();
      },
      end: (_x, y, dropped) => {
        pulled = Math.max(pulled, Math.max(0, y - down));
        samples.push({ value: y, t: performance.now() });
        const velocity = swipeVelocity(samples);
        if (dropped && (pulled > closeAt || velocity > 0.5)) {
          onClose();
          return;
        }
        // Under the threshold: back up on a spring that starts at the
        // finger's speed, then the stylesheet has the transform again.
        if (!motionAllowed()) {
          el.classList.remove("is-pulled");
          el.style.transform = "";
          return;
        }
        runSpring({
          from: pulled,
          to: 0,
          velocity: dropped ? velocity * 1000 : 0,
          draw: (value) => {
            // The sheet never lifts above its own edge.
            el.style.transform = `translateY(${Math.max(0, value)}px)`;
          },
          done: () => {
            el.classList.remove("is-pulled");
            el.style.transform = "";
          },
        });
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

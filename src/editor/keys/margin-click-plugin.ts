import { Plugin, TextSelection } from "@milkdown/kit/prose/state";
import { $prose } from "@milkdown/kit/utils";
import type { EditorView } from "@milkdown/kit/prose/view";
import { edgeScroll } from "../../engine/drag/edge-scroll";
import { gapCaret } from "../click-below-end";

/**
 * A click in the page's empty margins, beside the text column, puts the
 * caret in the nearest line at that height, as a click past a line's end
 * does; a shift-click extends the selection there. It used to do nothing: a formula or a block being edited stayed
 * open, however wide the window. A drag from the margin selects the lines
 * it passes, as a drag from the text does.
 */
function createMarginClickPlugin() {
  return new Plugin({
    view(view) {
      let endDrag = () => {};
      /** Puts the caret for a press at (x, y), when the press is the
       *  page's own: beside the text, or in a table's gap. True when it
       *  took the press. The scroller is looked up as the press comes:
       *  the editor may be built before it is put inside one. */
      const press = (x: number, y: number, shift: boolean): boolean => {
        const scroller = view.dom.closest<HTMLElement>(".editor-scroll");
        if (!scroller || onScrollbar(scroller, x, y)) return false;
        // The scroller's own scrollbar, or a gap beside a table.
        const pos = gapCaret(view, y) ?? nearestPos(view, x, y);
        if (pos === null) return false;
        const { doc, selection } = view.state;
        // With Shift it reaches there from where the selection began.
        const next = shift
          ? TextSelection.between(selection.$anchor, doc.resolve(pos))
          : TextSelection.near(doc.resolve(pos));
        view.dispatch(view.state.tr.setSelection(next).scrollIntoView());
        view.focus();
        // The press is kept from the web view, so it selects nothing as the
        // pointer moves on: the drag is followed here.
        endDrag();
        endDrag = followDrag(view, scroller, next.anchor);
        return true;
      };
      /** Whether the press is the page's own: only the page around the
       *  text, not anything drawn there (a margin card, a button) or the
       *  text column itself, where the editor places the caret. */
      const onPage = (target: EventTarget | null, x: number): boolean => {
        if (!view.editable || !(target instanceof Node)) return false;
        const scroller = view.dom.closest<HTMLElement>(".editor-scroll");
        // The page around the text is this editor's scroller: not the
        // window's frame, nor another pane's.
        if (!scroller || !scroller.contains(target)) return false;
        if (!target.contains(view.dom)) return false;
        if (target === view.dom && inColumn(view, x)) return false;
        return true;
      };
      // A mouse's or pen's press, on the pointer's own events: no mouse
      // events follow a touch's prevented pointerdown.
      const onDown = (event: PointerEvent) => {
        if (event.pointerType === "touch") return;
        if (event.button !== 0 || event.detail > 1) return;
        if (!onPage(event.target, event.clientX)) return;
        if (press(event.clientX, event.clientY, event.shiftKey))
          event.preventDefault();
      };
      // A finger's: touchstart is where its default - the caret moved and
      // the editor blurred after the press - is kept from the web view.
      const onTouch = (event: TouchEvent) => {
        const touch = event.touches[0] ?? event.changedTouches[0];
        if (!touch || !onPage(event.target, touch.clientX)) return;
        if (press(touch.clientX, touch.clientY, false)) event.preventDefault();
      };
      // Captured, so the editor's own handlers see the press is taken and
      // start no selection of their own.
      document.addEventListener("pointerdown", onDown, true);
      document.addEventListener("touchstart", onTouch, {
        capture: true,
        passive: false,
      });
      return {
        destroy() {
          endDrag();
          document.removeEventListener("pointerdown", onDown, true);
          document.removeEventListener("touchstart", onTouch, true);
        },
      };
    },
  });
}

/**
 * Selects from `anchor` to the text nearest the pointer until the button is
 * let go, scrolling on past the scroller's top or bottom (edgeScroll).
 * One update a frame, however fast the mouse moves. Returns its stop.
 */
function followDrag(
  view: EditorView,
  scroller: HTMLElement | null,
  anchor: number,
): () => void {
  let pointer = { x: 0, y: 0 };
  const follow = (rect?: DOMRect) => {
    const head = nearestPos(view, pointer.x, pointer.y, rect);
    const { doc, selection } = view.state;
    if (
      head === null ||
      (selection.anchor === anchor && selection.head === head)
    )
      return;
    const next = TextSelection.between(doc.resolve(anchor), doc.resolve(head));
    view.dispatch(view.state.tr.setSelection(next));
  };
  const edge = edgeScroll(() => scroller, follow);
  const move = (event: PointerEvent) => {
    if (!(event.buttons & 1)) return stop();
    pointer = { x: event.clientX, y: event.clientY };
    edge.at(pointer.y);
  };
  // The button can be let go before the last move's frame: it still counts.
  const up = () => {
    edge.flush();
    stop();
  };
  const stop = () => {
    edge.stop();
    window.removeEventListener("pointermove", move, true);
    window.removeEventListener("pointerup", up, true);
  };
  window.addEventListener("pointermove", move, true);
  window.addEventListener("pointerup", up, true);
  return stop;
}

function inColumn(view: EditorView, x: number): boolean {
  const box = view.dom.getBoundingClientRect();
  const style = getComputedStyle(view.dom);
  return (
    x >= box.left + parseFloat(style.paddingLeft) &&
    x <= box.right - parseFloat(style.paddingRight)
  );
}

function onScrollbar(scroller: HTMLElement, x: number, y: number): boolean {
  const box = scroller.getBoundingClientRect();
  return (
    x >= box.left + scroller.clientLeft + scroller.clientWidth ||
    y >= box.top + scroller.clientTop + scroller.clientHeight
  );
}

/** The document position nearest (x, y), with the point drawn into the
 *  text column, and into `shown` when given: off screen it hits nothing. */
function nearestPos(
  view: EditorView,
  x: number,
  y: number,
  shown?: DOMRect,
): number | null {
  const box = view.dom.getBoundingClientRect();
  const style = getComputedStyle(view.dom);
  const left = box.left + parseFloat(style.paddingLeft) + 1;
  const right = box.right - parseFloat(style.paddingRight) - 1;
  const top = Math.max(box.top, shown?.top ?? -Infinity) + 1;
  const bottom = Math.min(box.bottom, shown?.bottom ?? Infinity) - 1;
  const at = view.posAtCoords({
    left: Math.min(Math.max(x, left), right),
    top: Math.min(Math.max(y, top), bottom),
  });
  return at ? at.pos : null;
}

export const marginClickPlugin = $prose(createMarginClickPlugin);

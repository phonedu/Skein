import { useEffect, useState } from "react";
import {
  caretBlock,
  NO_BLOCK,
  sameCaretBlock,
  type CaretBlock,
} from "../editor/caret-block";
import { tabElement } from "../engine/layout/tab-element";
import { tabInUse } from "../engine/layout/store";

/** What is on at the caret of one document, kept current: nothing while
 *  the caret is in another. */
export function useCaretBlock(tabId: string): CaretBlock {
  const [block, setBlock] = useState<CaretBlock>(NO_BLOCK);
  useEffect(() => {
    let frame = 0;
    // The DOM settles after ProseMirror's update; read it a frame later.
    const read = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        setBlock((prev) => {
          const next = caretBlock(
            tabInUse() === tabId ? tabElement(tabId) : null,
          );
          return sameCaretBlock(prev, next) ? prev : next;
        }),
      );
    };
    read();
    document.addEventListener("selectionchange", read);
    document.addEventListener("input", read);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("selectionchange", read);
      document.removeEventListener("input", read);
    };
  }, [tabId]);
  return block;
}

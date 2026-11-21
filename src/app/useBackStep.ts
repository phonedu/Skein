// Android's Back steps through the phone's pages instead of leaving the
// app: the AI page back to the document, the document to the library, and
// from the library on it is the system's. Registered once, so Settings -
// mounted over these while it is up - keeps answering first.
import { useEffect, useRef } from "react";
import { onBack } from "../mobile/back";

export function useBackStep({
  phone,
  agentOpen,
  inDoc,
  closeAgent,
  toHome,
}: {
  phone: boolean;
  agentOpen: boolean;
  inDoc: boolean;
  closeAgent: () => void;
  toHome: () => void;
}) {
  const step = useRef({ agentOpen, inDoc, closeAgent, toHome });
  step.current = { agentOpen, inDoc, closeAgent, toHome };
  useEffect(() => {
    if (!phone) return;
    return onBack(() => {
      const now = step.current;
      if (now.agentOpen) {
        now.closeAgent();
        return true;
      }
      if (now.inDoc) {
        now.toHome();
        return true;
      }
      return false;
    });
  }, [phone]);
}

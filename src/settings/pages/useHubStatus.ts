// The local service's state: whether it runs, what it announces, and the
// pairing code's QR. Polled while it runs, so the device list stays true.
import { useEffect, useState } from "react";
import {
  hubPairingQr,
  hubStatus,
  type HubReply,
} from "../../platform/ipc-sync";

export function useHubStatus() {
  const [reply, setReply] = useState<HubReply>({
    running: false,
    lanAddresses: [],
  });
  const [qr, setQr] = useState<string | null>(null);
  const pairingCode = reply.running
    ? (reply.status.pairing?.code ?? null)
    : null;

  const load = async () => {
    try {
      const current = await hubStatus();
      if (current) setReply(current);
    } catch {
      // A host without the Hub commands (a preview) simply shows nothing.
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!reply.running) return;
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, [reply.running]);

  useEffect(() => {
    if (!pairingCode) {
      setQr(null);
      return;
    }
    let cancelled = false;
    void hubPairingQr().then(
      (image) => {
        if (!cancelled) setQr(image);
      },
      () => {
        if (!cancelled) setQr(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [pairingCode]);

  return { reply, setReply, qr, load };
}

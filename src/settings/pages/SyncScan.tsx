// The in-app QR scanner: the phone's camera in a <video>, decoded with
// jsQR, with a visible way out. The native barcode plugin is kept only for
// the camera permission its manifest adds; its own camera view is not used.
import jsQR from "jsqr";
import { useEffect, useRef, useState } from "react";
import type { Strings } from "../../i18n/strings";

export function SyncScan({
  t,
  onCode,
  onCancel,
  onError,
}: {
  t: Strings;
  onCode: (value: string) => void;
  onCancel: () => void;
  onError: (error: unknown) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const callbacks = useRef({ onCode, onCancel, onError });
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [dark, setDark] = useState(false);
  callbacks.current = { onCode, onCancel, onError };

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: number | null = null;
    let stopped = false;
    let darkFrames = 0;
    setDark(false);
    const finish = (code: string) => {
      if (stopped) return;
      stopped = true;
      if (timer !== null) window.clearInterval(timer);
      stream?.getTracks().forEach((track) => track.stop());
      callbacks.current.onCode(code);
    };

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
        if (stopped) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        const element = video.current;
        if (!element) return;
        element.srcObject = stream;
        await element.play();
        timer = window.setInterval(() => {
          const target = video.current;
          const canvasElement = canvas.current;
          if (!target || !canvasElement || target.readyState < 2) return;
          const width = target.videoWidth;
          const height = target.videoHeight;
          if (!width || !height) return;
          if (canvasElement.width !== width) canvasElement.width = width;
          if (canvasElement.height !== height) canvasElement.height = height;
          const context = canvasElement.getContext("2d", { willReadFrequently: true });
          if (!context) return;
          context.drawImage(target, 0, 0, width, height);
          const image = context.getImageData(0, 0, width, height);
          let brightest = 0;
          for (let index = 0; index < image.data.length; index += 4000) {
            brightest = Math.max(
              brightest,
              image.data[index],
              image.data[index + 1],
              image.data[index + 2],
            );
          }
          if (brightest < 4) {
            darkFrames += 1;
            if (darkFrames === 12) setDark(true);
          } else {
            darkFrames = 0;
            setDark(false);
          }
          const code = jsQR(image.data, width, height, {
            inversionAttempts: "attemptBoth",
          });
          if (code?.data) finish(code.data);
        }, 150);
      } catch (error) {
        if (!stopped) callbacks.current.onError(error);
      }
    };
    void start();

    return () => {
      stopped = true;
      if (timer !== null) window.clearInterval(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [facing]);

  return (
    <div className="sync-scan-overlay">
      <video ref={video} className="sync-scan-video" playsInline muted />
      <canvas ref={canvas} className="sync-scan-canvas" />
      <div className="sync-scan-card">
        <p>{dark ? t.syncHubScanDark : t.syncHubScanPoint}</p>
        <div className="sync-scan-actions">
          <button
            type="button"
            className="text-button settings-inline-button"
            onClick={() =>
              setFacing((current) =>
                current === "environment" ? "user" : "environment",
              )
            }
          >
            {t.syncHubScanSwitch}
          </button>
          <button
            type="button"
            className="text-button settings-inline-button"
            onClick={onCancel}
          >
            {t.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}

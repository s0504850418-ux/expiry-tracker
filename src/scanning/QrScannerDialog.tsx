import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

interface Props {
  onScan: (batchId: string) => void;
  onClose: () => void;
}

export function QrScannerDialog({ onScan, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let rafId = 0;
    let stopped = false;

    function scanLoop() {
      if (stopped) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          if (code?.data) {
            stopped = true;
            onScan(code.data);
            return;
          }
        }
      }
      rafId = requestAnimationFrame(scanLoop);
    }

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        scanLoop();
      } catch {
        setError("לא ניתן לגשת למצלמה — ודא/י שניתנה הרשאה");
      }
    }

    start();

    return () => {
      stopped = true;
      cancelAnimationFrame(rafId);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [onScan]);

  return (
    <div className="dialog-backdrop" dir="rtl">
      <div className="dialog">
        <h2>סריקת QR</h2>
        {error && <p className="error-text">{error}</p>}
        <video
          id="qr-scanner-video"
          ref={videoRef}
          muted
          playsInline
          style={{ width: "100%", borderRadius: 8 }}
        />
        <canvas ref={canvasRef} style={{ display: "none" }} />
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}

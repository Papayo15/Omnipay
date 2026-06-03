"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Camera } from "lucide-react";

interface Props {
  onScan: (data: string) => void;
}

export default function QRScanner({ onScan }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState("");
  const raf = useRef<number>(0);

  async function start() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setActive(true);
        scan();
      }
    } catch {
      setError("No se pudo acceder a la cámara");
    }
  }

  function scan() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      raf.current = requestAnimationFrame(scan);
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "dontInvert",
    });
    if (code?.data) {
      stop();
      // El QR puede ser "op://[base64]" o una URL "/pagar?s=[base64]"
      const raw = code.data;
      if (raw.startsWith("op://")) {
        onScan(raw.slice(5));
      } else {
        try {
          const url = new URL(raw);
          const s = url.searchParams.get("s");
          if (s) onScan(s);
        } catch {
          onScan(raw);
        }
      }
      return;
    }
    raf.current = requestAnimationFrame(scan);
  }

  function stop() {
    cancelAnimationFrame(raf.current);
    const video = videoRef.current;
    if (video?.srcObject) {
      (video.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
    }
    setActive(false);
  }

  useEffect(() => () => { stop(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!active) {
    return (
      <button
        onClick={start}
        className="w-full border-2 border-dashed border-slate-700 rounded-2xl py-8 flex flex-col items-center gap-3 text-slate-400 hover:border-slate-500 touch-manipulation transition-colors"
      >
        <Camera className="w-8 h-8" />
        <span className="font-medium">Escanear QR con la cámara</span>
        {error && <span className="text-red-400 text-sm">{error}</span>}
      </button>
    );
  }

  return (
    <div className="relative rounded-2xl overflow-hidden bg-black">
      <video ref={videoRef} className="w-full aspect-square object-cover" muted playsInline />
      <canvas ref={canvasRef} className="hidden" />
      {/* Marco de escaneo */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-52 h-52 border-2 border-indigo-400 rounded-2xl" />
      </div>
      <button
        onClick={stop}
        className="absolute top-3 right-3 bg-black/60 text-white text-xs px-3 py-1.5 rounded-full touch-manipulation"
      >
        Cancelar
      </button>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Nfc } from "lucide-react";
import { motion } from "framer-motion";

interface Props {
  onRead: (data: string) => void;
}

export default function NFCButton({ onRead }: Props) {
  const [scanning, setScanning] = useState(false);

  // Web NFC API solo existe en Chrome Android — no se muestra en iOS Safari
  const isSupported = typeof window !== "undefined" && "NDEFReader" in window;
  if (!isSupported) return null;

  async function startNFC() {
    setScanning(true);
    try {
      // @ts-expect-error — NDEFReader es experimental, no en TypeScript lib
      const reader = new window.NDEFReader();
      await reader.scan();
      reader.addEventListener("reading", ({ message }: { message: { records: Array<{ recordType: string; data: DataView }> } }) => {
        for (const record of message.records) {
          if (record.recordType === "text" || record.recordType === "url") {
            const decoded = new TextDecoder().decode(record.data);
            if (decoded.includes("/pagar?s=")) {
              const url = new URL(decoded);
              const s = url.searchParams.get("s");
              if (s) {
                onRead(s);
                setScanning(false);
              }
            }
          }
        }
      });
    } catch {
      setScanning(false);
    }
  }

  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onClick={startNFC}
      className={`w-full border-2 border-dashed rounded-2xl py-5 flex items-center justify-center gap-3 transition-colors touch-manipulation ${
        scanning
          ? "border-indigo-500 bg-indigo-900/20 text-indigo-400"
          : "border-slate-700 text-slate-400 hover:border-slate-500"
      }`}
    >
      <Nfc className={`w-6 h-6 ${scanning ? "animate-pulse" : ""}`} />
      <span className="font-medium">
        {scanning ? "Acerca el dispositivo..." : "Pagar por NFC"}
      </span>
    </motion.button>
  );
}

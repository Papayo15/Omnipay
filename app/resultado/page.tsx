"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { CheckCircle, XCircle, Home, RotateCcw, Send } from "lucide-react";
import { parseReceiptURL, type ReceiptData } from "@/lib/link";

function ResultadoContent() {
  const t = useTranslations("resultado");
  const router = useRouter();
  const params = useSearchParams();

  const status  = params.get("s");   // "success" | "error"
  const receipt = params.get("r");   // encoded receipt (no PII)

  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const isSuccess = status === "success" || !!receipt;

  useEffect(() => {
    if (receipt) {
      const d = parseReceiptURL(receipt);
      if (d) setReceiptData(d);
    }
  }, [receipt]);

  function fmt(n: number, c: string) {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency: c }).format(n);
  }

  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-[#0f172a] px-6 text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 22 }}
        className="flex flex-col items-center gap-6 max-w-sm w-full"
      >
        {isSuccess ? (
          <>
            {/* Success icon */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.15, type: "spring", stiffness: 400 }}
              className="rounded-full p-8 bg-emerald-500/10"
            >
              {receiptData?.tt === "remesa"
                ? <Send className="w-20 h-20 text-indigo-400" />
                : <CheckCircle className="w-20 h-20 text-emerald-400" />
              }
            </motion.div>

            <div>
              <h1 className="text-3xl font-bold text-white mb-2">
                {receiptData?.tt === "remesa" ? t("success_remesa") : t("success_cobro")}
              </h1>
              {receiptData && (
                <p className="text-emerald-400 text-2xl font-semibold">
                  {fmt(receiptData.a, receiptData.c)}
                </p>
              )}
              {receiptData?.n && (
                <p className="text-slate-400 text-sm mt-1">{receiptData.n}</p>
              )}
            </div>

            {/* Bouncing dots */}
            <div className="flex gap-2">
              {["bg-indigo-400", "bg-emerald-400", "bg-amber-400", "bg-pink-400"].map((color, i) => (
                <motion.div
                  key={i}
                  className={`w-3 h-3 rounded-full ${color}`}
                  animate={{ y: [0, -12, 0] }}
                  transition={{ repeat: Infinity, delay: i * 0.1, duration: 0.8 }}
                />
              ))}
            </div>

            {/* Receipt details (if available) */}
            {receiptData && (
              <div className="w-full bg-slate-800/50 border border-slate-700 rounded-2xl p-4 text-left text-sm">
                {[
                  [t("receipt_id"), receiptData.id || "—"],
                  [t("receipt_merchant"), receiptData.n],
                  [t("receipt_date"), new Date(receiptData.ts).toLocaleString("es-MX")],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between py-2 border-b border-slate-700/50 last:border-0">
                    <span className="text-slate-500">{label}</span>
                    <span className="text-white font-medium max-w-[55%] text-right break-all">{value}</span>
                  </div>
                ))}
                <p className="text-slate-600 text-xs mt-3">{t("receipt_note")}</p>
              </div>
            )}

            <div className="flex flex-col gap-3 w-full">
              <button
                onClick={() => router.push("/cobrar")}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-lg py-5 rounded-2xl touch-manipulation transition-colors"
              >
                {t("new_charge")}
              </button>
              <button
                onClick={() => router.push("/")}
                className="w-full border border-slate-700 hover:bg-slate-800/40 text-slate-300 font-medium py-4 rounded-2xl touch-manipulation transition-colors flex items-center justify-center gap-2"
              >
                <Home className="w-5 h-5" />
                {t("go_home")}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="bg-red-500/10 rounded-full p-8">
              <XCircle className="w-20 h-20 text-red-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">{t("failed_title")}</h1>
              <p className="text-slate-400 text-sm">{t("failed_sub")}</p>
            </div>
            <div className="flex flex-col gap-3 w-full">
              <button
                onClick={() => router.back()}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-lg py-5 rounded-2xl touch-manipulation transition-colors flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-5 h-5" />
                {t("retry")}
              </button>
              <button
                onClick={() => router.push("/")}
                className="w-full border border-slate-700 hover:bg-slate-800/40 text-slate-300 py-4 rounded-2xl touch-manipulation transition-colors flex items-center justify-center gap-2"
              >
                <Home className="w-5 h-5" />
                {t("go_home")}
              </button>
            </div>
          </>
        )}
      </motion.div>
    </main>
  );
}

export default function ResultadoPage() {
  return (
    <Suspense>
      <ResultadoContent />
    </Suspense>
  );
}

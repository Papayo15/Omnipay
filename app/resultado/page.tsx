"use client";

import { useEffect, useState, Suspense, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { CheckCircle, XCircle, Home, RotateCcw, Send, Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePaymentStore } from "@/lib/store/paymentStore";
import { parseReceiptURL, type ReceiptPayload } from "@/lib/payload";
import ReceiptShareButton from "@/components/ReceiptShareButton";

interface ReceiptData {
  txId: string;
  amount: number;
  currency: string;
  bankName: string;
  country: string;
  transactionType: string;
  rail: string;
  senderAmount?: number;
  sourceCurrency?: string;
}

function downloadReceiptPNG(data: ReceiptData) {
  const canvas = document.createElement("canvas");
  canvas.width = 800;
  canvas.height = 500;
  const ctx = canvas.getContext("2d")!;

  // Background
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, 800, 500);

  // Header bar
  ctx.fillStyle = data.transactionType === "terminal" ? "#059669" : "#4f46e5";
  ctx.fillRect(0, 0, 800, 8);

  // Title
  ctx.fillStyle = "#f8fafc";
  ctx.font = "bold 28px system-ui, sans-serif";
  ctx.fillText("OmniPay — Comprobante de Pago", 40, 60);

  // Divider
  ctx.strokeStyle = "#1e293b";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(40, 80);
  ctx.lineTo(760, 80);
  ctx.stroke();

  const fmt = (n: number, c: string) =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency: c }).format(n);

  const rows: [string, string][] = [
    ["ID de rastreo", data.txId || "—"],
    ["Monto", fmt(data.amount, data.currency)],
    ...(data.senderAmount && data.sourceCurrency
      ? [["Enviado", fmt(data.senderAmount, data.sourceCurrency)] as [string, string]]
      : []),
    ["Banco destino", data.bankName],
    ["País", data.country],
    ["Riel", data.rail],
    ["Tipo", data.transactionType],
    ["Fecha", new Date().toLocaleString("es-MX")],
  ];

  ctx.font = "16px system-ui, sans-serif";
  rows.forEach(([label, value], i) => {
    const y = 120 + i * 44;
    ctx.fillStyle = "#64748b";
    ctx.fillText(label, 40, y);
    ctx.fillStyle = "#f1f5f9";
    ctx.fillText(value, 260, y);
  });

  // Footer
  ctx.fillStyle = "#334155";
  ctx.font = "13px system-ui, sans-serif";
  ctx.fillText("omnipay.app · Transferencia segura y verificable", 40, 470);

  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `omnipay-${data.txId || Date.now()}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }, "image/png");
}

function ResultadoContent() {
  const router = useRouter();
  const t = useTranslations("resultado");
  const params = useSearchParams();
  const status = params.get("s");
  const receiptEncoded = params.get("r");
  const sessionId = params.get("session_id");
  const isSuccess = status === "success";

  const [auditReceipt, setAuditReceipt] = useState<ReceiptPayload | null>(null);
  const [auditError, setAuditError] = useState(false);
  const [auditUrl, setAuditUrl] = useState("");

  const { errorMessage, amount, currency, transactionType, senderAmount, sourceCurrency, exchangeRate, txReference, txId, bankName, country, rail, recipientPhone, clearAll } = usePaymentStore();

  const isRemesa = transactionType === "remesa";
  const isTerminal = transactionType === "terminal";

  useEffect(() => {
    if (receiptEncoded) {
      parseReceiptURL(receiptEncoded)
        .then(setAuditReceipt)
        .catch(() => setAuditError(true));
    }
  }, [receiptEncoded]);

  // Restore store from sessionStorage when Stripe redirects back
  // (Zustand in-memory store is lost on external page navigation)
  useEffect(() => {
    if (!sessionId) return;
    try {
      const saved = sessionStorage.getItem("omnipay_stripe_pending");
      if (!saved) return;
      const d = JSON.parse(saved) as {
        txId: string; amount: number; currency: string; bankName: string;
        country: string; transactionType: string; rail: string;
      };
      sessionStorage.removeItem("omnipay_stripe_pending");
      const s = usePaymentStore.getState();
      s.setTxReference(d.txId ?? sessionId);
      s.setAmount(Number(d.amount));
      s.setCurrency(String(d.currency));
      s.setBankName(String(d.bankName ?? ""));
      s.setCountry(String(d.country ?? "MX"));
      if (d.transactionType === "terminal" || d.transactionType === "remesa" || d.transactionType === "importacion") {
        s.setTransactionType(d.transactionType);
      }
      s.setRail("stripe");
    } catch { /* non-critical */ }
  }, [sessionId]);

  useEffect(() => {
    if (!receiptEncoded) {
      const timer = setTimeout(() => {
        if (typeof window !== "undefined") sessionStorage.clear();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [receiptEncoded]);

  const buildAuditUrl = useCallback(async () => {
    if (typeof window === "undefined") return;
    const { buildReceiptURL } = await import("@/lib/payload");
    const receipt: ReceiptPayload = {
      id: txReference ?? txId ?? "",
      a: amount,
      c: currency,
      nb: bankName,
      cn: country,
      ts: Date.now(),
      tt: transactionType ?? "generic",
      r: rail ?? "wise",
      ...(senderAmount > 0 && sourceCurrency ? { sa: senderAmount, sc: sourceCurrency } : {}),
    };
    const url = await buildReceiptURL(receipt);
    setAuditUrl(url);
    return url;
  }, [txReference, txId, amount, currency, bankName, country, transactionType, rail, senderAmount, sourceCurrency]);

  useEffect(() => {
    if (isSuccess && !receiptEncoded) {
      buildAuditUrl();
    }
  }, [isSuccess, receiptEncoded, buildAuditUrl]);

  function handleGoHome() {
    clearAll();
    router.push("/");
  }

  function handleRetry() {
    clearAll();
    router.push(isTerminal ? "/cobrar" : "/mandar");
  }

  function handleNuevoCobro() {
    clearAll();
    router.push("/cobrar");
  }

  function fmt(n: number, c: string) {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency: c }).format(n);
  }

  const amountLabel = amount > 0 && currency ? fmt(amount, currency) : "";

  function handleDownloadReceipt() {
    downloadReceiptPNG({
      txId: txReference ?? txId ?? "",
      amount,
      currency,
      bankName,
      country,
      transactionType: transactionType ?? "generic",
      rail: rail ?? "wise",
      ...(senderAmount > 0 && sourceCurrency ? { senderAmount, sourceCurrency } : {}),
    });
  }

  // Audit view mode (opened via /resultado?r=...)
  if (receiptEncoded) {
    if (auditError) {
      return (
        <main className="flex flex-col items-center justify-center min-h-screen bg-[#0f172a] px-6 text-center">
          <XCircle className="w-16 h-16 text-red-400 mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Comprobante inválido</h2>
          <p className="text-slate-400">El enlace de auditoría no es válido o está corrupto.</p>
          <button onClick={() => router.push("/")} className="mt-6 text-indigo-400 touch-manipulation">Ir al inicio</button>
        </main>
      );
    }
    if (!auditReceipt) {
      return <div className="flex items-center justify-center min-h-screen bg-[#0f172a]"><div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>;
    }
    return (
      <main className="flex flex-col min-h-screen bg-[#0f172a] px-5 pt-10 pb-10">
        <div className="flex items-center gap-3 mb-8">
          <CheckCircle className="w-7 h-7 text-emerald-400" />
          <h1 className="text-2xl font-bold text-white">Comprobante de pago</h1>
        </div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4">
          <div className="bg-emerald-900/20 border border-emerald-700/40 rounded-2xl p-5 text-center">
            <p className="text-slate-400 text-sm mb-1">{t("tracking_id")}</p>
            <p className="text-white font-mono text-sm">{auditReceipt.id || "—"}</p>
          </div>
          {[
            ["Monto", fmt(auditReceipt.a, auditReceipt.c)],
            ...(auditReceipt.sa && auditReceipt.sc ? [["Enviado", fmt(auditReceipt.sa, auditReceipt.sc)]] : []),
            ["Banco destino", auditReceipt.nb],
            ["País", auditReceipt.cn],
            ["Tipo", auditReceipt.tt],
            ["Riel", auditReceipt.r],
            ["Fecha", new Date(auditReceipt.ts).toLocaleString("es-MX")],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between items-center bg-slate-800/40 rounded-xl px-4 py-3">
              <span className="text-slate-400 text-sm">{label}</span>
              <span className="text-white text-sm font-semibold">{value}</span>
            </div>
          ))}
          <p className="text-slate-600 text-xs text-center mt-2">Este comprobante es de solo lectura. No contiene datos bancarios.</p>
          <button onClick={() => router.push("/")} className="mt-4 text-indigo-400 text-sm text-center touch-manipulation">Ir al inicio</button>
        </motion.div>
      </main>
    );
  }

  const successTitle = isRemesa ? t("success_transfer") : isTerminal ? t("success_terminal") : t("success_generic");
  const failTitle = isRemesa ? t("failed_transfer") : isTerminal ? t("failed_terminal") : t("failed_generic");

  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-[#0f172a] px-6 text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        className="flex flex-col items-center gap-6 max-w-sm w-full"
      >
        {isSuccess ? (
          <>
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 400 }}
              className={`rounded-full p-8 ${isRemesa ? "bg-indigo-500/10" : "bg-emerald-500/10"}`}
            >
              {isRemesa ? (
                <Send className="w-20 h-20 text-indigo-400" />
              ) : (
                <CheckCircle className="w-20 h-20 text-emerald-400" />
              )}
            </motion.div>

            <div>
              <h1 className="text-3xl font-bold text-white mb-2">{successTitle}</h1>

              {isRemesa && senderAmount > 0 && sourceCurrency ? (
                <>
                  <p className="text-indigo-300 text-2xl font-semibold">{fmt(senderAmount, sourceCurrency)}</p>
                  {exchangeRate && amount > 0 && (
                    <p className="text-emerald-400 text-lg font-semibold mt-1">→ {fmt(amount, currency)}</p>
                  )}
                  <p className="text-slate-400 mt-2">{t("family_will_receive")}</p>
                </>
              ) : isTerminal && amount > 0 ? (
                <>
                  <p className="text-emerald-400 text-2xl font-semibold">{fmt(amount, currency)}</p>
                  <p className="text-slate-400 text-sm mt-1">
                    {t("business_receives")}{" "}
                    <span className="text-emerald-300 font-semibold">
                      {fmt(amount * (1 - 0.0025), currency)}
                    </span>
                  </p>
                </>
              ) : (
                <>
                  {amount > 0 && <p className="text-emerald-400 text-2xl font-semibold">{fmt(amount, currency)}</p>}
                  <p className="text-slate-400 mt-2">{t("transfer_done")}</p>
                </>
              )}
            </div>

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

            {/* Receipt actions */}
            <button
              onClick={handleDownloadReceipt}
              className="w-full flex items-center justify-center gap-2 border border-slate-700 rounded-xl py-3 text-slate-300 text-sm hover:bg-slate-800/40 touch-manipulation transition-colors"
            >
              <Download className="w-4 h-4" />
              {t("download_receipt")}
            </button>

            {auditUrl && (
              <ReceiptShareButton
                auditUrl={auditUrl}
                amount={amountLabel || `${amount} ${currency}`}
              />
            )}

            <div className="flex flex-col gap-3 w-full">
              {isTerminal && (
                <button
                  onClick={handleNuevoCobro}
                  className="w-full bg-emerald-600 text-white font-bold text-lg py-5 rounded-2xl flex items-center justify-center gap-2 touch-manipulation hover:bg-emerald-500 transition-colors"
                >
                  {t("new_charge")}
                </button>
              )}
              <button
                onClick={handleGoHome}
                className={`w-full text-white font-bold text-lg py-5 rounded-2xl flex items-center justify-center gap-2 touch-manipulation transition-colors ${isTerminal ? "border border-slate-700 hover:bg-slate-800/40" : "bg-indigo-600 hover:bg-indigo-500"}`}
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
              <h1 className="text-3xl font-bold text-white mb-2">{failTitle}</h1>
              <p className="text-slate-400">
                {errorMessage ?? t("could_not_complete")}
              </p>
            </div>
            <div className="flex flex-col gap-3 w-full">
              <button
                onClick={handleRetry}
                className="w-full bg-indigo-600 text-white font-bold text-lg py-5 rounded-2xl flex items-center justify-center gap-2 touch-manipulation hover:bg-indigo-500 transition-colors"
              >
                <RotateCcw className="w-5 h-5" />
                {t("retry")}
              </button>
              <button
                onClick={handleGoHome}
                className="w-full border border-slate-700 text-slate-300 font-medium py-4 rounded-2xl touch-manipulation hover:bg-slate-800/40 transition-colors"
              >
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

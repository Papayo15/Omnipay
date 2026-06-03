"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, AlertCircle, Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import { parsePayload, type PaymentPayload } from "@/lib/payload";
import FeeBreakdown from "@/components/FeeBreakdown";
import { RAIL_LABELS } from "@/constants/rails";
import { usePaymentStore } from "@/lib/store/paymentStore";

function PagarContent() {
  const router = useRouter();
  const t = useTranslations("pagar");
  const params = useSearchParams();
  const [payload, setPayload] = useState<PaymentPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState(0);

  const { setDecodedPayload, setRail, setAmount, setMode, setCurrency } = usePaymentStore();

  useEffect(() => {
    const s = params.get("s");
    if (!s) { setError(t("invalid_link")); setLoading(false); return; }

    parsePayload(s)
      .then((p) => {
        setPayload(p);
        setDecodedPayload(p);
        setRail(p.r);
        setAmount(p.a);
        setMode(p.m);
        setCurrency(p.c);
        setTimeLeft(Math.max(0, Math.floor((p.ex - Date.now()) / 1000)));
      })
      .catch((e: Error) => {
        if (e.message === "expired") setError(t("expired_request"));
        else setError(t("invalid_tampered"));
      })
      .finally(() => setLoading(false));
  }, [params, setDecodedPayload, setRail, setAmount, setMode, setCurrency, t]);

  useEffect(() => {
    if (timeLeft <= 0) return;
    const timer = setTimeout(() => setTimeLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [timeLeft]);

  function fmt(n: number, c: string) {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency: c }).format(n);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0f172a]">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#0f172a] px-6 text-center">
        <div className="bg-red-500/10 rounded-full p-5 mb-4">
          <AlertCircle className="w-12 h-12 text-red-400" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">{t("cannot_process")}</h2>
        <p className="text-slate-400">{error}</p>
        <button onClick={() => router.push("/")} className="mt-6 text-indigo-400 touch-manipulation">
          Ir al inicio
        </button>
      </div>
    );
  }

  if (!payload) return null;

  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;

  return (
    <main className="flex flex-col min-h-screen bg-[#0f172a] px-5 pt-10 pb-10">
      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => router.back()} className="p-2 rounded-xl hover:bg-slate-800 touch-manipulation">
          <ArrowLeft className="w-6 h-6 text-slate-400" />
        </button>
        <h1 className="text-2xl font-bold text-white">{t("title")}</h1>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-5 flex-1"
      >
        <div className="bg-slate-800/60 rounded-2xl p-5 flex flex-col gap-2">
          <p className="text-slate-400 text-sm">{t("requested_by")}</p>
          <p className="text-white font-bold text-xl">{payload.rn}</p>
          <p className="text-slate-400 text-sm">{payload.nb} · {payload.cn}</p>
          <div className="flex items-center gap-1 text-slate-500 text-xs mt-1">
            <Clock className="w-3 h-3" />
            <span>
              {timeLeft > 0
                ? `${t("expires_in")} ${mins}:${secs.toString().padStart(2, "0")}`
                : t("expired")}
            </span>
          </div>
        </div>

        <div className="text-center py-4">
          <p className="text-slate-400 text-sm mb-1">{t("amount")}</p>
          <p className="text-white text-5xl font-bold">{fmt(payload.a, payload.c)}</p>
        </div>

        <FeeBreakdown amount={payload.a} currency={payload.c} mode={payload.m} />

        <div className="flex items-center justify-between bg-slate-800/40 rounded-xl px-4 py-3">
          <span className="text-slate-400 text-sm">{t("rail")}</span>
          <span className="text-white text-sm font-semibold">{RAIL_LABELS[payload.r]}</span>
        </div>

        <div className="mt-auto">
          <button
            disabled={timeLeft <= 0}
            onClick={() => router.push("/procesando")}
            className="w-full bg-indigo-600 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold text-xl py-6 rounded-2xl transition-colors touch-manipulation shadow-2xl shadow-indigo-900/50"
          >
            {t("pay_now")}
          </button>
          <p className="text-slate-600 text-xs text-center mt-3">
            {t("auth_note")}
          </p>
        </div>
      </motion.div>
    </main>
  );
}

export default function PagarPage() {
  return (
    <Suspense>
      <PagarContent />
    </Suspense>
  );
}

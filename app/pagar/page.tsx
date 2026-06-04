"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { ArrowLeft, AlertCircle, Shield, Clock } from "lucide-react";

// Pantalla camaleón — se transforma según type=cobro|remesa
// Cobro:  "Vas a PAGAR $X a [tienda]"   → redirige a Stripe Checkout
// Remesa: "Vas a RECIBIR $X de [nombre]" → captura tarjeta receptor → ejecuta push

interface LinkData {
  type: "cobro" | "remesa";
  amount: number;
  currency: string;
  name: string;          // comercio (cobro) o nombre del emisor (remesa)
  targetCurrency?: string;
  targetAmount?: number;
  checkoutUrl?: string;  // solo cobro
  token?: string;        // token completo (para ejecutar remesa)
  sig?: string;
}

function fmt(n: number, c: string) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: c }).format(n);
}

function PagarContent() {
  const t = useTranslations("pagar");
  const router = useRouter();
  const params = useSearchParams();

  const [data, setData]           = useState<LinkData | null>(null);
  const [error, setError]         = useState("");
  const [loading, setLoading]     = useState(true);
  const [card, setCard]           = useState("");
  const [executing, setExecuting] = useState(false);
  const [timeLeft, setTimeLeft]   = useState(600); // 10 min

  const type = params.get("type") ?? "cobro";

  useEffect(() => {
    const token = params.get("t") ?? "";
    const sig   = params.get("s") ?? "";
    if (!token || !sig) { setError(t("invalid_link")); setLoading(false); return; }

    fetch(`/api/cobrar/verify?t=${encodeURIComponent(token)}&s=${encodeURIComponent(sig)}&type=${type}`)
      .then((r) => r.json())
      .then((d: { ok: boolean; data?: LinkData; error?: string }) => {
        if (!d.ok || !d.data) throw new Error(d.error ?? t("invalid_link"));
        setData({ ...d.data, token, sig });
      })
      .catch((e: Error) => setError(e.message === "expired" ? t("expired_link") : e.message))
      .finally(() => setLoading(false));
  }, [params, t, type]);

  // Countdown 10 min
  useEffect(() => {
    if (!data) return;
    const id = setInterval(() => setTimeLeft((s) => {
      if (s <= 1) { clearInterval(id); setError(t("expired_link")); return 0; }
      return s - 1;
    }), 1000);
    return () => clearInterval(id);
  }, [data, t]);

  async function handleCobro() {
    if (!data?.checkoutUrl) return;
    setExecuting(true);
    window.location.href = data.checkoutUrl;
  }

  async function handleRemesa() {
    const digits = card.replace(/\D/g, "");
    if (digits.length !== 16) return;
    setExecuting(true);
    try {
      const res = await fetch("/api/remesa/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token:             data?.token,
          sig:               data?.sig,
          recipientCard:     digits,
        }),
      });
      const result = await res.json() as { tx_id?: string; error?: string };
      if (!res.ok || result.error) throw new Error(result.error ?? t("error_generic"));
      const appUrl = window.location.origin;
      router.push(`/resultado?s=success&tx=${result.tx_id ?? ""}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("error_generic"));
      setExecuting(false);
    }
  }

  const mins = Math.floor(timeLeft / 60);
  const secs = String(timeLeft % 60).padStart(2, "0");

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-[#0f172a]">
      <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
        className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full" />
    </div>
  );

  if (error) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#0f172a] px-6 text-center gap-4">
      <div className="bg-red-500/10 rounded-full p-5"><AlertCircle className="w-10 h-10 text-red-400" /></div>
      <h2 className="text-xl font-bold text-white">{t("cannot_process")}</h2>
      <p className="text-slate-400 text-sm">{error}</p>
      <button onClick={() => router.push("/")} className="text-indigo-400 text-sm touch-manipulation">{t("go_home")}</button>
    </div>
  );

  if (!data) return null;

  const isCobro  = type === "cobro";
  const accentBg = isCobro ? "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/50" : "bg-indigo-600 hover:bg-indigo-500 shadow-indigo-900/50";
  const cardOk   = !isCobro ? card.replace(/\D/g, "").length === 16 : true;

  return (
    <main className="flex flex-col min-h-screen bg-[#0f172a] px-5 pt-6 pb-10">
      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => router.back()}
          className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-white font-bold text-lg">{isCobro ? t("title_cobro") : t("title_remesa")}</h1>
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-5 flex-1">

        {/* Resumen del pago */}
        <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-6 text-center">
          {isCobro ? (
            <>
              <p className="text-slate-400 text-sm">{t("paying_to")}</p>
              <p className="text-white font-bold text-xl mt-1">{data.name}</p>
              <div className="mt-4">
                <p className="text-slate-500 text-xs uppercase tracking-wider mb-1">{t("amount")}</p>
                <p className="text-white text-5xl font-bold">{fmt(data.amount, data.currency)}</p>
              </div>
            </>
          ) : (
            <>
              <p className="text-slate-400 text-sm">{t("receiving_from")}</p>
              <p className="text-white font-bold text-xl mt-1">{data.name}</p>
              <div className="mt-4">
                <p className="text-slate-500 text-xs uppercase tracking-wider mb-1">{t("you_receive")}</p>
                <p className="text-emerald-400 text-5xl font-bold">
                  {fmt(data.targetAmount ?? data.amount, data.targetCurrency ?? data.currency)}
                </p>
                {data.targetCurrency && data.targetCurrency !== data.currency && (
                  <p className="text-slate-500 text-sm mt-1">
                    ({fmt(data.amount, data.currency)} → {data.targetCurrency})
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        {/* Countdown */}
        {timeLeft > 0 && (
          <div className="flex items-center justify-center gap-1.5 text-slate-500 text-xs">
            <Clock className="w-3.5 h-3.5" />
            <span>{t("expires_in")} {mins}:{secs}</span>
          </div>
        )}

        {/* Campo de tarjeta (solo remesa) */}
        {!isCobro && (
          <div className="flex flex-col gap-2">
            <label className="text-slate-400 text-sm">{t("your_card_label")}</label>
            <input
              type="tel"
              inputMode="numeric"
              maxLength={19}
              value={card.replace(/\D/g, "").replace(/(.{4})/g, "$1 ").trim()}
              onChange={(e) => setCard(e.target.value)}
              placeholder="0000 0000 0000 0000"
              className={`bg-slate-800/60 border rounded-xl px-4 py-4 text-white text-xl font-mono tracking-widest placeholder-slate-600 focus:outline-none transition-colors ${
                card.replace(/\D/g, "").length === 16
                  ? "border-emerald-600/60 focus:border-emerald-500"
                  : card.length > 0
                  ? "border-slate-600 focus:border-indigo-500"
                  : "border-slate-700 focus:border-indigo-500"
              }`}
            />
            <p className="text-slate-600 text-xs">{t("card_hint")}</p>
          </div>
        )}

        {/* Trust badge */}
        <div className="flex items-center gap-2 bg-slate-800/30 border border-slate-700/40 rounded-xl px-4 py-3">
          <Shield className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <p className="text-slate-400 text-xs">
            {isCobro ? t("stripe_trust") : t("card_trust")}
          </p>
        </div>

        {/* CTA */}
        <div className="mt-auto flex flex-col gap-3">
          <button
            onClick={isCobro ? handleCobro : handleRemesa}
            disabled={executing || !cardOk || timeLeft === 0}
            className={`w-full ${accentBg} disabled:opacity-40 active:scale-95 transition-all text-white font-bold text-lg py-5 rounded-2xl shadow-2xl touch-manipulation flex items-center justify-center gap-2`}
          >
            {executing ? (
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                className="w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
            ) : isCobro ? (
              `${t("pay_button")} ${fmt(data.amount, data.currency)}`
            ) : (
              t("accept_button")
            )}
          </button>
          <p className="text-slate-600 text-xs text-center">
            {isCobro ? t("stripe_redirect_note") : t("instant_note")}
          </p>
        </div>

      </motion.div>
    </main>
  );
}

export default function PagarPage() {
  return <Suspense><PagarContent /></Suspense>;
}

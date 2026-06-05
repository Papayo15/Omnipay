"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { ArrowLeft, AlertCircle, Shield, Clock } from "lucide-react";
import { getAccountValidation } from "@/lib/wise-accounts";

// Pantalla camaleón — se transforma según type=cobro|remesa
// Cobro:  "Vas a PAGAR $X a [tienda]"    → redirige a Stripe Checkout
// Remesa: "Vas a RECIBIR $X de [nombre]" → input inteligente por país → Wise/Thunes

interface LinkData {
  type: "cobro" | "remesa";
  amount: number;
  currency: string;
  name: string;
  targetCountry?: string;
  targetCurrency?: string;
  targetAmount?: number;
  checkoutUrl?: string;
  token?: string;
  sig?: string;
}

function fmt(n: number, c: string) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: c }).format(n);
}

function PagarContent() {
  const t = useTranslations("pagar");
  const router = useRouter();
  const params = useSearchParams();

  const [data, setData]                     = useState<LinkData | null>(null);
  const [error, setError]                   = useState("");
  const [loading, setLoading]               = useState(true);
  const [recipientAccount, setRecipientAccount] = useState("");
  const [recipientName, setRecipientName]   = useState("");
  const [executing, setExecuting]           = useState(false);
  const [timeLeft, setTimeLeft]             = useState(600);

  const type    = params.get("type") ?? "cobro";
  const isCobro = type === "cobro";

  // Validación del input según país destino
  const accountValidation = useMemo(
    () => getAccountValidation(data?.targetCountry ?? ""),
    [data?.targetCountry],
  );

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
    if (!accountOk) return;
    setExecuting(true);
    try {
      const res = await fetch("/api/remesa/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token:            data?.token,
          sig:              data?.sig,
          recipientAccount: recipientAccount.trim(),
          recipientName:    recipientName.trim(),
        }),
      });
      const result = await res.json() as { status?: string; receipt_url?: string; error?: string; errorCode?: string };
      if (!res.ok || result.error) {
        if (result.errorCode === "INVALID_ACCOUNT") {
          setError(t("error_invalid_account"));
          setExecuting(false);
          return;
        }
        throw new Error(result.error ?? t("error_generic"));
      }
      const rParam = new URL(result.receipt_url ?? window.location.origin).searchParams.get("r") ?? "";
      router.push(`/resultado?s=success&r=${encodeURIComponent(rParam)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("error_generic"));
      setExecuting(false);
    }
  }

  const mins     = Math.floor(timeLeft / 60);
  const secs     = String(timeLeft % 60).padStart(2, "0");
  const accentBg = isCobro
    ? "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/50"
    : "bg-indigo-600 hover:bg-indigo-500 shadow-indigo-900/50";

  const accountIsValid = accountValidation.validate(recipientAccount);
  const accountOk      = !isCobro
    ? accountIsValid && recipientName.trim().length >= 2
    : true;

  const accountBorderClass = recipientAccount.length === 0
    ? "border-slate-700 focus:border-indigo-500"
    : accountIsValid
      ? "border-emerald-600/60 focus:border-emerald-500"
      : "border-slate-600 focus:border-indigo-500";

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-[#0f172a]">
      <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
        className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full" />
    </div>
  );

  if (error && !executing) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#0f172a] px-6 text-center gap-4">
      <div className="bg-red-500/10 rounded-full p-5"><AlertCircle className="w-10 h-10 text-red-400" /></div>
      <h2 className="text-xl font-bold text-white">{t("cannot_process")}</h2>
      <p className="text-slate-400 text-sm">{error}</p>
      {/* Retry button for invalid account — link still valid */}
      {error === t("error_invalid_account") ? (
        <button onClick={() => setError("")}
          className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-6 py-3 rounded-xl touch-manipulation">
          {t("retry_account")}
        </button>
      ) : (
        <button onClick={() => router.push("/")} className="text-indigo-400 text-sm touch-manipulation">{t("go_home")}</button>
      )}
    </div>
  );

  if (!data) return null;

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
                <p className="text-indigo-300 text-5xl font-bold">
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

        {/* Input inteligente por país (solo remesa) */}
        {!isCobro && (
          <div className="flex flex-col gap-3">
            {/* Nombre del titular */}
            <input
              type="text"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              placeholder={t("your_name_label")}
              className="bg-slate-800/60 border border-slate-700 focus:border-indigo-500 rounded-xl px-4 py-3 text-white placeholder-slate-500 text-sm focus:outline-none transition-colors"
            />

            {/* Cuenta bancaria — formato según país destino */}
            <div className="flex flex-col gap-1">
              <label className="text-slate-400 text-sm font-medium">
                {accountValidation.label}
              </label>
              <input
                type={accountValidation.inputMode === "numeric" ? "tel" : "text"}
                inputMode={accountValidation.inputMode}
                value={recipientAccount}
                onChange={(e) => setRecipientAccount(e.target.value)}
                placeholder={accountValidation.placeholder}
                maxLength={accountValidation.maxLength + 5}
                className={`bg-slate-800/60 border rounded-xl px-4 py-4 text-white placeholder-slate-600 focus:outline-none transition-colors text-base tracking-wide ${accountBorderClass}`}
              />
              <p className="text-slate-600 text-xs leading-relaxed">{accountValidation.hint}</p>
            </div>
          </div>
        )}

        {/* Trust badge */}
        <div className="flex items-center gap-2 bg-slate-800/30 border border-slate-700/40 rounded-xl px-4 py-3">
          <Shield className="w-4 h-4 text-indigo-400 flex-shrink-0" />
          <p className="text-slate-400 text-xs">
            {isCobro ? t("stripe_trust") : t("account_trust")}
          </p>
        </div>

        {/* CTA */}
        <div className="mt-auto flex flex-col gap-3">
          <button
            onClick={isCobro ? handleCobro : handleRemesa}
            disabled={executing || !accountOk || timeLeft === 0}
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
            {isCobro ? t("stripe_redirect_note") : t("processing_note")}
          </p>
        </div>

      </motion.div>
    </main>
  );
}

export default function PagarPage() {
  return <Suspense><PagarContent /></Suspense>;
}

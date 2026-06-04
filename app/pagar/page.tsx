"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { ArrowLeft, AlertCircle, Shield } from "lucide-react";

// The Stripe Checkout URL is embedded in the link token.
// This page just decodes it, shows a confirmation screen, and redirects to Stripe.
// No card data ever passes through OmniPay servers — Stripe handles everything.

interface LinkData {
  a: number;    // amount
  c: string;    // currency
  n: string;    // merchant name
  u: string;    // checkout URL
}

function PagarContent() {
  const t = useTranslations("pagar");
  const router = useRouter();
  const params = useSearchParams();
  const [data, setData] = useState<LinkData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    const token = params.get("t");
    const sig   = params.get("s");

    if (!token || !sig) {
      setError(t("invalid_link"));
      setLoading(false);
      return;
    }

    // Verify link server-side
    fetch(`/api/cobrar/verify?t=${encodeURIComponent(token)}&s=${encodeURIComponent(sig)}`)
      .then((r) => r.json())
      .then((d: { ok: boolean; data?: LinkData; error?: string }) => {
        if (!d.ok || !d.data) throw new Error(d.error ?? t("invalid_link"));
        setData(d.data);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [params, t]);

  function fmt(n: number, c: string) {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency: c }).format(n);
  }

  function pay() {
    if (!data?.u) return;
    setRedirecting(true);
    window.location.href = data.u;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0f172a]">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#0f172a] px-6 text-center gap-4">
        <div className="bg-red-500/10 rounded-full p-5">
          <AlertCircle className="w-10 h-10 text-red-400" />
        </div>
        <h2 className="text-xl font-bold text-white">{t("cannot_process")}</h2>
        <p className="text-slate-400 text-sm">{error}</p>
        <button onClick={() => router.push("/")} className="text-indigo-400 text-sm touch-manipulation">
          {t("go_home")}
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <main className="flex flex-col min-h-screen bg-[#0f172a] px-5 pt-6 pb-10">
      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => router.back()} className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-white font-bold text-lg">{t("title")}</h1>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-6 flex-1"
      >
        {/* Payment summary */}
        <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-6 text-center">
          <p className="text-slate-400 text-sm">{t("paying_to")}</p>
          <p className="text-white font-bold text-xl mt-1">{data.n}</p>
          <div className="mt-4">
            <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">{t("amount")}</p>
            <p className="text-white text-5xl font-bold">{fmt(data.a, data.c)}</p>
          </div>
        </div>

        {/* Trust badge */}
        <div className="flex items-center gap-2 bg-emerald-900/20 border border-emerald-700/30 rounded-xl px-4 py-3">
          <Shield className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <p className="text-emerald-300 text-xs">{t("stripe_trust")}</p>
        </div>

        <div className="mt-auto flex flex-col gap-3">
          <button
            onClick={pay}
            disabled={redirecting}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 active:scale-95 transition-all text-white font-bold text-lg py-5 rounded-2xl shadow-2xl shadow-indigo-900/50 touch-manipulation flex items-center justify-center gap-2"
          >
            {redirecting ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
              />
            ) : t("pay_button", { amount: fmt(data.a, data.c) })}
          </button>
          <p className="text-slate-600 text-xs text-center">{t("stripe_redirect_note")}</p>
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

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { ArrowLeft, Store, ChevronRight } from "lucide-react";
import AmountField from "@/components/AmountField";
import ShareSheet from "@/components/ShareSheet";

type Step = "amount" | "share";

export default function CobrarPage() {
  const t = useTranslations("cobrar");
  const router = useRouter();

  const [step, setStep] = useState<Step>("amount");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("MXN");
  const [clientPhone, setClientPhone] = useState("");
  const [merchantName, setMerchantName] = useState("");
  const [merchantPhone, setMerchantPhone] = useState("");
  const [paymentUrl, setPaymentUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const amountNum = parseFloat(amount) || 0;
  const canContinue = amountNum > 0 && clientPhone.trim().length >= 7;
  const fee = amountNum > 0 ? amountNum * 0.01 : 0;

  const CURRENCIES = ["MXN", "USD", "CAD", "EUR", "BRL", "COP"];

  async function generateLink() {
    if (!canContinue) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/cobrar/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amountNum,
          currency,
          clientPhone: clientPhone.trim(),
          merchantPhone: merchantPhone.trim(),
          merchantName: merchantName.trim() || "Comercio",
        }),
      });
      const data = await res.json() as { checkout_url?: string; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? t("error_generic"));
      setPaymentUrl(data.checkout_url ?? "");
      setStep("share");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("error_generic"));
    } finally {
      setLoading(false);
    }
  }

  const fmtAmt = (n: number) =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(n);

  const shareMessage = `${t("share_message", {
    amount: fmtAmt(amountNum),
    merchant: merchantName || t("merchant_default"),
  })}`;

  return (
    <main className="flex flex-col min-h-screen bg-[#0f172a] px-5 pt-6 pb-10">

      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={() => step === "share" ? setStep("amount") : router.push("/")}
          className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <Store className="w-5 h-5 text-emerald-400" />
          <h1 className="text-white font-bold text-lg">{t("title")}</h1>
        </div>
      </div>

      <AnimatePresence mode="wait">

        {/* Step 1: amount + phones */}
        {step === "amount" && (
          <motion.div
            key="amount"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex flex-col gap-5"
          >
            <p className="text-slate-400 text-sm">{t("step_amount_hint")}</p>

            {/* Currency selector */}
            <div className="flex gap-2 flex-wrap">
              {CURRENCIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setCurrency(c)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    currency === c
                      ? "bg-emerald-600 border-emerald-500 text-white"
                      : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>

            <AmountField
              value={amount}
              onChange={setAmount}
              currency={currency}
              label={t("amount_label")}
            />

            {amountNum > 0 && (
              <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl px-4 py-3 text-sm text-slate-400">
                {t("fee_note", { fee: fmtAmt(fee) })}
                <span className="text-white ml-1">{fmtAmt(amountNum - fee)}</span>
              </div>
            )}

            {/* Merchant name */}
            <input
              type="text"
              value={merchantName}
              onChange={(e) => setMerchantName(e.target.value)}
              placeholder={t("merchant_name_placeholder")}
              className="bg-slate-800/60 border border-slate-700 focus:border-emerald-500 rounded-xl px-4 py-3 text-white placeholder-slate-500 text-sm focus:outline-none transition-colors"
            />

            {/* Merchant phone */}
            <input
              type="tel"
              value={merchantPhone}
              onChange={(e) => setMerchantPhone(e.target.value)}
              placeholder={t("merchant_phone_placeholder")}
              className="bg-slate-800/60 border border-slate-700 focus:border-emerald-500 rounded-xl px-4 py-3 text-white placeholder-slate-500 text-sm focus:outline-none transition-colors"
            />

            {/* Client phone */}
            <input
              type="tel"
              value={clientPhone}
              onChange={(e) => setClientPhone(e.target.value)}
              placeholder={t("client_phone_placeholder")}
              className={`bg-slate-800/60 border rounded-xl px-4 py-3 text-white placeholder-slate-500 text-sm focus:outline-none transition-colors ${
                clientPhone.length > 0 && clientPhone.length < 7
                  ? "border-red-600/60 focus:border-red-500"
                  : "border-slate-700 focus:border-emerald-500"
              }`}
            />
            <p className="text-slate-600 text-xs -mt-3">{t("client_phone_hint")}</p>

            {error && (
              <div className="bg-red-900/30 border border-red-700/50 rounded-xl px-4 py-3 text-red-300 text-sm">
                {error}
              </div>
            )}

            <button
              onClick={generateLink}
              disabled={!canContinue || loading}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all rounded-2xl py-4 text-white font-bold text-base flex items-center justify-center gap-2 touch-manipulation"
            >
              {loading ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                  className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
                />
              ) : (
                <>
                  {t("generate_button")}
                  <ChevronRight className="w-5 h-5" />
                </>
              )}
            </button>
          </motion.div>
        )}

        {/* Step 2: share the link */}
        {step === "share" && (
          <motion.div
            key="share"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex flex-col gap-6"
          >
            <div className="bg-emerald-900/30 border border-emerald-700/40 rounded-2xl p-5 text-center">
              <p className="text-emerald-400 text-xs uppercase tracking-wider mb-1">{t("amount_to_collect")}</p>
              <p className="text-white text-4xl font-bold">{fmtAmt(amountNum)}</p>
              {merchantName && <p className="text-emerald-300/70 text-sm mt-1">{merchantName}</p>}
              <p className="text-slate-500 text-xs mt-2">{t("fee_note", { fee: fmtAmt(fee) })}{fmtAmt(amountNum - fee)}</p>
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-slate-400 text-sm font-medium">{t("share_hint")}</p>
              <ShareSheet url={paymentUrl} message={shareMessage} />
            </div>

            <button
              onClick={() => { setStep("amount"); setAmount(""); setClientPhone(""); setPaymentUrl(""); setError(""); }}
              className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-2xl py-3 text-slate-300 text-sm transition-colors"
            >
              {t("new_charge")}
            </button>
          </motion.div>
        )}

      </AnimatePresence>
    </main>
  );
}

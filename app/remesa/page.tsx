"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { ArrowLeft, Send, ChevronRight, Clock } from "lucide-react";
import AmountField from "@/components/AmountField";
import CountryPicker from "@/components/CountryPicker";
import { COUNTRIES, type Country } from "@/constants/countries";
import { selectRemesaRail, RAIL_ETA } from "@/constants/remesa-rails";
import { getFXRate } from "@/lib/fx";

type Step = "origin" | "recipient" | "confirm" | "processing";

const DEFAULT_ORIGIN = COUNTRIES.find((c) => c.code === "MX") ?? COUNTRIES[0];
const DEFAULT_DEST   = COUNTRIES.find((c) => c.code === "US") ?? COUNTRIES[1];

export default function RemesaPage() {
  const t = useTranslations("remesa");
  const router = useRouter();

  const [step, setStep] = useState<Step>("origin");
  const [originCountry, setOriginCountry] = useState<Country>(DEFAULT_ORIGIN);
  const [destCountry, setDestCountry] = useState<Country>(DEFAULT_DEST);
  const [amount, setAmount] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [recipientAccount, setRecipientAccount] = useState("");
  const [senderPhone, setSenderPhone] = useState("");

  const [fxRate, setFxRate] = useState<number | null>(null);
  const [fxLoading, setFxLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const amountNum = parseFloat(amount) || 0;
  const destAmount = fxRate ? parseFloat((amountNum * fxRate).toFixed(2)) : null;
  const rail = selectRemesaRail(destCountry.code);
  const eta  = RAIL_ETA[rail];

  const canContinueOrigin = amountNum > 0;
  const canContinueRecipient = (recipientPhone.trim().length >= 7 || recipientAccount.trim().length >= 4) && recipientName.trim().length >= 2;

  // Fetch FX rate when countries or amount change
  useEffect(() => {
    if (!canContinueOrigin || originCountry.currency === destCountry.currency) {
      setFxRate(originCountry.currency === destCountry.currency ? 1 : null);
      return;
    }
    setFxLoading(true);
    getFXRate(originCountry.currency, destCountry.currency)
      .then((r) => setFxRate(r))
      .finally(() => setFxLoading(false));
  }, [originCountry.currency, destCountry.currency, canContinueOrigin]);

  function fmt(n: number, c: string) {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency: c }).format(n);
  }

  async function sendRemesa() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/remesa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amountNum,
          sourceCurrency: originCountry.currency,
          targetCountry:  destCountry.code,
          recipientName:  recipientName.trim(),
          recipientPhone: recipientPhone.trim(),
          recipientAccount: recipientAccount.trim(),
          senderPhone:    senderPhone.trim(),
        }),
      });
      const data = await res.json() as { tx_id?: string; status?: string; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? t("error_generic"));
      router.push(`/resultado?s=success&tx=${data.tx_id ?? ""}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("error_generic"));
      setLoading(false);
    }
  }

  return (
    <main className="flex flex-col min-h-screen bg-[#0f172a] px-5 pt-6 pb-10">

      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={() => {
            if (step === "origin") router.push("/");
            else if (step === "recipient") setStep("origin");
            else if (step === "confirm") setStep("recipient");
          }}
          className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <Send className="w-5 h-5 text-indigo-400" />
          <h1 className="text-white font-bold text-lg">{t("title")}</h1>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex gap-2 mb-8">
        {(["origin","recipient","confirm"] as Step[]).map((s, i) => (
          <div
            key={s}
            className={`h-1 flex-1 rounded-full transition-colors ${
              ["origin","recipient","confirm"].indexOf(step) >= i
                ? "bg-indigo-500"
                : "bg-slate-700"
            }`}
          />
        ))}
      </div>

      <AnimatePresence mode="wait">

        {/* Step 1: origin amount + countries */}
        {step === "origin" && (
          <motion.div key="origin" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col gap-5">

            <CountryPicker value={originCountry.code} onChange={setOriginCountry} label={t("from_country")} />

            <AmountField value={amount} onChange={setAmount} currency={originCountry.currency} label={t("send_amount")} />

            <CountryPicker value={destCountry.code} onChange={setDestCountry} label={t("to_country")} />

            {/* FX preview */}
            {amountNum > 0 && (
              <div className="bg-indigo-900/20 border border-indigo-700/30 rounded-xl px-4 py-3">
                {fxLoading ? (
                  <p className="text-slate-500 text-sm">{t("calculating")}</p>
                ) : destAmount !== null ? (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-slate-400 text-xs">{t("recipient_gets")}</p>
                      <p className="text-indigo-300 text-xl font-bold">{fmt(destAmount, destCountry.currency)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-slate-500 text-xs">{t("eta")}</p>
                      <div className="flex items-center gap-1 text-slate-400 text-xs">
                        <Clock className="w-3 h-3" />
                        <span>{eta}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-slate-500 text-sm">{t("rate_unavailable")}</p>
                )}
              </div>
            )}

            <button
              disabled={!canContinueOrigin}
              onClick={() => setStep("recipient")}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 active:scale-95 transition-all rounded-2xl py-4 text-white font-bold text-base flex items-center justify-center gap-2 touch-manipulation"
            >
              {t("next")} <ChevronRight className="w-5 h-5" />
            </button>
          </motion.div>
        )}

        {/* Step 2: recipient details */}
        {step === "recipient" && (
          <motion.div key="recipient" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col gap-4">
            <p className="text-slate-400 text-sm">{t("recipient_hint")}</p>

            <input
              type="text"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              placeholder={t("recipient_name")}
              className="bg-slate-800/60 border border-slate-700 focus:border-indigo-500 rounded-xl px-4 py-3 text-white placeholder-slate-500 text-sm focus:outline-none transition-colors"
            />

            <input
              type="tel"
              value={recipientPhone}
              onChange={(e) => setRecipientPhone(e.target.value)}
              placeholder={t("recipient_phone")}
              className="bg-slate-800/60 border border-slate-700 focus:border-indigo-500 rounded-xl px-4 py-3 text-white placeholder-slate-500 text-sm focus:outline-none transition-colors"
            />

            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-700" />
              <span className="text-slate-600 text-xs">{t("or_account")}</span>
              <div className="h-px flex-1 bg-slate-700" />
            </div>

            <input
              type="text"
              value={recipientAccount}
              onChange={(e) => setRecipientAccount(e.target.value)}
              placeholder={destCountry.accountPlaceholder || t("recipient_account")}
              className="bg-slate-800/60 border border-slate-700 focus:border-indigo-500 rounded-xl px-4 py-3 text-white placeholder-slate-500 text-sm focus:outline-none transition-colors"
            />
            <p className="text-slate-600 text-xs -mt-2">{destCountry.accountLabel}</p>

            <input
              type="tel"
              value={senderPhone}
              onChange={(e) => setSenderPhone(e.target.value)}
              placeholder={t("sender_phone")}
              className="bg-slate-800/60 border border-slate-700 focus:border-indigo-500 rounded-xl px-4 py-3 text-white placeholder-slate-500 text-sm focus:outline-none transition-colors"
            />

            <button
              disabled={!canContinueRecipient}
              onClick={() => setStep("confirm")}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 active:scale-95 transition-all rounded-2xl py-4 text-white font-bold text-base flex items-center justify-center gap-2 touch-manipulation"
            >
              {t("review")} <ChevronRight className="w-5 h-5" />
            </button>
          </motion.div>
        )}

        {/* Step 3: confirm */}
        {step === "confirm" && (
          <motion.div key="confirm" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col gap-4">
            <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-5 flex flex-col gap-3">
              {[
                [t("sending"), fmt(amountNum, originCountry.currency)],
                [t("recipient_gets_label"), destAmount ? fmt(destAmount, destCountry.currency) : "—"],
                [t("recipient_label"), recipientName],
                [t("destination_label"), `${destCountry.flag} ${destCountry.name}`],
                [t("method_label"), rail.toUpperCase()],
                [t("eta_label"), eta],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between items-center">
                  <span className="text-slate-500 text-sm">{label}</span>
                  <span className="text-white text-sm font-semibold">{value}</span>
                </div>
              ))}
            </div>

            {error && (
              <div className="bg-red-900/30 border border-red-700/50 rounded-xl px-4 py-3 text-red-300 text-sm">
                {error}
              </div>
            )}

            <button
              onClick={sendRemesa}
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 active:scale-95 transition-all rounded-2xl py-5 text-white font-bold text-lg flex items-center justify-center gap-2 touch-manipulation shadow-2xl shadow-indigo-900/50"
            >
              {loading ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                  className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
                />
              ) : (
                <><Send className="w-5 h-5" /> {t("send_now")}</>
              )}
            </button>

            <p className="text-slate-600 text-xs text-center">{t("confirm_note")}</p>
          </motion.div>
        )}

      </AnimatePresence>
    </main>
  );
}

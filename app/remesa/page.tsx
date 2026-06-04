"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { ArrowLeft, Send, ChevronRight, AlertTriangle, Clock } from "lucide-react";
import AmountField from "@/components/AmountField";
import CountryPicker from "@/components/CountryPicker";
import ShareSheet from "@/components/ShareSheet";
import { COUNTRIES, type Country } from "@/constants/countries";
import { selectRemesaRail, RAIL_ETA } from "@/constants/remesa-rails";
import { getFXRate } from "@/lib/fx";

type Step = "origin" | "sender_card" | "recipient" | "share";

const DEFAULT_ORIGIN = COUNTRIES.find((c) => c.code === "CA") ?? COUNTRIES[0];
const DEFAULT_DEST   = COUNTRIES.find((c) => c.code === "MX") ?? COUNTRIES[1];
const KYC_THRESHOLD  = 1000; // USD equivalent — aviso informativo

export default function RemesaPage() {
  const t = useTranslations("remesa");
  const router = useRouter();

  const [step, setStep]               = useState<Step>("origin");
  const [originCountry, setOrigin]    = useState<Country>(DEFAULT_ORIGIN);
  const [destCountry, setDest]        = useState<Country>(DEFAULT_DEST);
  const [amount, setAmount]           = useState("");
  const [senderCard, setSenderCard]   = useState("");
  const [senderName, setSenderName]   = useState("");
  const [senderPhone, setSenderPhone] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [recipientName, setRecipientName]   = useState("");
  const [shareLink, setShareLink]     = useState("");
  const [fxRate, setFxRate]           = useState<number | null>(null);
  const [fxLoading, setFxLoading]     = useState(false);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");

  const amountNum  = parseFloat(amount) || 0;
  const destAmount = fxRate && amountNum > 0 ? parseFloat((amountNum * fxRate).toFixed(2)) : null;
  const rail       = selectRemesaRail(destCountry.code);
  const eta        = RAIL_ETA[rail];
  const showKyc    = amountNum >= KYC_THRESHOLD;

  const senderDigits = senderCard.replace(/\D/g, "");
  const canGoRecipient = senderDigits.length === 16 && senderName.trim().length >= 2 && senderPhone.trim().length >= 7;
  const canShare = recipientPhone.trim().length >= 7 || recipientName.trim().length >= 2;

  const fetchFX = useCallback(async () => {
    if (originCountry.currency === destCountry.currency) { setFxRate(1); return; }
    setFxLoading(true);
    const r = await getFXRate(originCountry.currency, destCountry.currency);
    setFxRate(r);
    setFxLoading(false);
  }, [originCountry.currency, destCountry.currency]);

  useEffect(() => { if (amountNum > 0) fetchFX(); }, [amountNum, fetchFX]);

  function fmt(n: number, c: string) {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency: c }).format(n);
  }

  async function generateRemesaLink() {
    setLoading(true);
    setError("");
    try {
      // 1. Tokenizar tarjeta del emisor server-side (Airwallex)
      const tokenRes = await fetch("/api/remesa/tokenize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardNumber: senderDigits }),
      });
      const tokenData = await tokenRes.json() as { token?: string; error?: string };
      if (!tokenRes.ok || tokenData.error) throw new Error(tokenData.error ?? t("error_tokenize"));

      // 2. Generar link firmado con el token cifrado
      const linkRes = await fetch("/api/remesa/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount:         amountNum,
          currency:       originCountry.currency,
          targetCountry:  destCountry.code,
          targetCurrency: destCountry.currency,
          targetAmount:   destAmount ?? amountNum,
          senderPhone:    senderPhone.trim(),
          senderName:     senderName.trim(),
          recipientPhone: recipientPhone.trim(),
          recipientName:  recipientName.trim() || undefined,
          senderCardToken: tokenData.token,
        }),
      });
      const linkData = await linkRes.json() as { share_link?: string; error?: string };
      if (!linkRes.ok || linkData.error) throw new Error(linkData.error ?? t("error_generic"));

      setShareLink(linkData.share_link ?? "");
      setStep("share");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("error_generic"));
    } finally {
      setLoading(false);
    }
  }

  const shareMessage = `${t("share_message", {
    amount: fmt(amountNum, originCountry.currency),
    dest:   destAmount ? fmt(destAmount, destCountry.currency) : "",
  })}`;

  return (
    <main className="flex flex-col min-h-screen bg-[#0f172a] px-5 pt-6 pb-10">

      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => {
          if (step === "share")          setStep("recipient");
          else if (step === "recipient") setStep("sender_card");
          else if (step === "sender_card") setStep("origin");
          else router.push("/");
        }} className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <Send className="w-5 h-5 text-indigo-400" />
          <h1 className="text-white font-bold text-lg">{t("title")}</h1>
        </div>
      </div>

      {/* Step dots */}
      <div className="flex gap-2 mb-8">
        {(["origin","sender_card","recipient","share"] as Step[]).map((s, i) => (
          <div key={s} className={`h-1 flex-1 rounded-full transition-colors ${
            ["origin","sender_card","recipient","share"].indexOf(step) >= i ? "bg-indigo-500" : "bg-slate-700"
          }`} />
        ))}
      </div>

      <AnimatePresence mode="wait">

        {/* ORIGIN — monto + países */}
        {step === "origin" && (
          <motion.div key="origin" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
            className="flex flex-col gap-5">
            <CountryPicker value={originCountry.code} onChange={setOrigin} label={t("from_country")} />
            <AmountField value={amount} onChange={setAmount} currency={originCountry.currency} label={t("send_amount")} />
            <CountryPicker value={destCountry.code} onChange={setDest} label={t("to_country")} />

            {/* FX preview */}
            {amountNum > 0 && (
              <div className="bg-indigo-900/20 border border-indigo-700/30 rounded-xl px-4 py-3">
                {fxLoading ? <p className="text-slate-500 text-sm">{t("calculating")}</p>
                  : destAmount !== null ? (
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-slate-400 text-xs">{t("recipient_gets")}</p>
                        <p className="text-indigo-300 text-xl font-bold">{fmt(destAmount, destCountry.currency)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-slate-500 text-xs">{t("eta")}</p>
                        <div className="flex items-center gap-1 text-slate-400 text-xs">
                          <Clock className="w-3 h-3" /><span>{eta}</span>
                        </div>
                      </div>
                    </div>
                  ) : <p className="text-slate-500 text-sm">{t("rate_unavailable")}</p>}
              </div>
            )}

            {/* KYC warning */}
            {showKyc && (
              <div className="flex items-start gap-3 bg-amber-900/20 border border-amber-700/30 rounded-xl px-4 py-3">
                <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-amber-300 text-xs">{t("kyc_warning")}</p>
              </div>
            )}

            <button disabled={amountNum <= 0} onClick={() => setStep("sender_card")}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 active:scale-95 transition-all rounded-2xl py-4 text-white font-bold flex items-center justify-center gap-2 touch-manipulation">
              {t("next")} <ChevronRight className="w-5 h-5" />
            </button>
          </motion.div>
        )}

        {/* SENDER CARD — emisor ingresa su tarjeta */}
        {step === "sender_card" && (
          <motion.div key="sender_card" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
            className="flex flex-col gap-4">
            <p className="text-slate-400 text-sm">{t("sender_card_hint")}</p>
            <input type="text" value={senderName} onChange={(e) => setSenderName(e.target.value)}
              placeholder={t("sender_name")}
              className="bg-slate-800/60 border border-slate-700 focus:border-indigo-500 rounded-xl px-4 py-3 text-white placeholder-slate-500 text-sm focus:outline-none transition-colors"
            />
            <input type="tel" value={senderPhone} onChange={(e) => setSenderPhone(e.target.value)}
              placeholder={t("sender_phone")}
              className="bg-slate-800/60 border border-slate-700 focus:border-indigo-500 rounded-xl px-4 py-3 text-white placeholder-slate-500 text-sm focus:outline-none transition-colors"
            />
            <div className="flex flex-col gap-1">
              <label className="text-slate-400 text-sm">{t("sender_card_label")}</label>
              <input
                type="tel" inputMode="numeric" maxLength={19}
                value={senderCard.replace(/\D/g, "").replace(/(.{4})/g, "$1 ").trim()}
                onChange={(e) => setSenderCard(e.target.value)}
                placeholder="0000 0000 0000 0000"
                className={`bg-slate-800/60 border rounded-xl px-4 py-4 text-white text-xl font-mono tracking-widest placeholder-slate-600 focus:outline-none transition-colors ${
                  senderDigits.length === 16 ? "border-emerald-600/60 focus:border-emerald-500"
                  : senderDigits.length > 0  ? "border-slate-600 focus:border-indigo-500"
                  : "border-slate-700 focus:border-indigo-500"}`}
              />
              <p className="text-slate-600 text-xs">{t("sender_card_hint2")}</p>
            </div>
            <button disabled={!canGoRecipient} onClick={() => setStep("recipient")}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 active:scale-95 transition-all rounded-2xl py-4 text-white font-bold flex items-center justify-center gap-2 touch-manipulation">
              {t("next")} <ChevronRight className="w-5 h-5" />
            </button>
          </motion.div>
        )}

        {/* RECIPIENT — datos del receptor */}
        {step === "recipient" && (
          <motion.div key="recipient" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
            className="flex flex-col gap-4">
            <p className="text-slate-400 text-sm">{t("recipient_hint")}</p>
            <input type="text" value={recipientName} onChange={(e) => setRecipientName(e.target.value)}
              placeholder={t("recipient_name")}
              className="bg-slate-800/60 border border-slate-700 focus:border-indigo-500 rounded-xl px-4 py-3 text-white placeholder-slate-500 text-sm focus:outline-none transition-colors"
            />
            <input type="tel" value={recipientPhone} onChange={(e) => setRecipientPhone(e.target.value)}
              placeholder={t("recipient_phone")}
              className="bg-slate-800/60 border border-slate-700 focus:border-indigo-500 rounded-xl px-4 py-3 text-white placeholder-slate-500 text-sm focus:outline-none transition-colors"
            />
            <p className="text-slate-600 text-xs -mt-2">
              {destCountry.flag} {destCountry.name} — {destCountry.accountLabel}
            </p>
            {error && <div className="bg-red-900/30 border border-red-700/50 rounded-xl px-4 py-3 text-red-300 text-sm">{error}</div>}
            <button disabled={!canShare || loading} onClick={generateRemesaLink}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 active:scale-95 transition-all rounded-2xl py-4 text-white font-bold flex items-center justify-center gap-2 touch-manipulation">
              {loading ? <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                className="w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                : <>{t("generate_link")} <ChevronRight className="w-5 h-5" /></>}
            </button>
          </motion.div>
        )}

        {/* SHARE */}
        {step === "share" && (
          <motion.div key="share" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
            className="flex flex-col gap-6">
            <div className="bg-indigo-900/30 border border-indigo-700/40 rounded-2xl p-5 text-center">
              <p className="text-indigo-400 text-xs uppercase tracking-wider mb-1">{t("sending_label")}</p>
              <p className="text-white text-3xl font-bold">{fmt(amountNum, originCountry.currency)}</p>
              {destAmount && (
                <p className="text-emerald-400 text-xl font-semibold mt-1">
                  → {fmt(destAmount, destCountry.currency)}
                </p>
              )}
              {recipientName && <p className="text-indigo-300/70 text-sm mt-1">{t("to_label")} {recipientName}</p>}
              <p className="text-amber-400/70 text-xs mt-2">⏱ {t("valid_10")}</p>
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-slate-400 text-sm font-medium">{t("share_hint")}</p>
              <ShareSheet url={shareLink} message={shareMessage} />
            </div>
            <button onClick={() => { setStep("origin"); setAmount(""); setSenderCard(""); setRecipientPhone(""); setShareLink(""); setError(""); }}
              className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-2xl py-3 text-slate-300 text-sm transition-colors">
              {t("new_remesa")}
            </button>
          </motion.div>
        )}

      </AnimatePresence>
    </main>
  );
}

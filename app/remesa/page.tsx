"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { ArrowLeft, Send, ChevronRight, AlertTriangle, Clock } from "lucide-react";
import AmountField from "@/components/AmountField";
import CountryPicker from "@/components/CountryPicker";
import ShareSheet from "@/components/ShareSheet";
import { COUNTRIES, type Country } from "@/constants/countries";
import { selectRemesaRail, RAIL_ETA } from "@/constants/remesa-rails";
import { getFXRate } from "@/lib/fx";

type Step = "origin" | "recipient" | "share";

const DEFAULT_ORIGIN = COUNTRIES.find((c) => c.code === "CA") ?? COUNTRIES[0];
const DEFAULT_DEST   = COUNTRIES.find((c) => c.code === "MX") ?? COUNTRIES[1];
const KYC_THRESHOLD  = 1000;

export default function RemesaPage() {
  const t = useTranslations("remesa");
  const router = useRouter();
  const searchParams = useSearchParams();
  const paid = searchParams.get("paid") === "1";

  const [step, setStep]               = useState<Step>("origin");
  const [originCountry, setOrigin]    = useState<Country>(DEFAULT_ORIGIN);
  const [destCountry, setDest]        = useState<Country>(DEFAULT_DEST);
  const [amount, setAmount]           = useState("");
  const [senderName, setSenderName]   = useState("");
  const [senderPhone, setSenderPhone] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [recipientName, setRecipientName]   = useState("");
  const [shareLink, setShareLink]     = useState("");
  // cadRate: sender_currency → CAD (para cobrar siempre en CAD y evitar doble conversión)
  const [cadRate, setCadRate]         = useState<number | null>(null);
  // destFxRate: CAD → destination_currency (para quote del receptor)
  const [destFxRate, setDestFxRate]   = useState<number | null>(null);
  const [fxLoading, setFxLoading]     = useState(false);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");

  // Al volver de Stripe con ?paid=1, recuperar el link del sessionStorage
  useEffect(() => {
    if (paid) {
      const saved = sessionStorage.getItem("omnipay_remesa_link");
      if (saved) {
        setShareLink(saved);
        setStep("share");
        sessionStorage.removeItem("omnipay_remesa_link");
      }
    }
  }, [paid]);

  const amountNum   = parseFloat(amount) || 0;
  const isOriginCAD = originCountry.currency === "CAD";

  // Monto en CAD que se cobrará a Stripe — UNA sola conversión FX (CAD→destino)
  const cadAmount   = amountNum > 0
    ? (isOriginCAD ? amountNum : cadRate ? parseFloat((amountNum * cadRate).toFixed(2)) : null)
    : null;

  // Lo que recibirá el receptor (CAD menos 1% fee, convertido a moneda destino)
  const destAmount  = cadAmount && destFxRate
    ? parseFloat((cadAmount * 0.99 * destFxRate).toFixed(2))
    : null;

  const rail    = selectRemesaRail(destCountry.code);
  const eta     = RAIL_ETA[rail];
  const showKyc = (cadAmount ?? 0) >= KYC_THRESHOLD;

  const canGoRecipient = (cadAmount ?? 0) > 0 && senderName.trim().length >= 2 && senderPhone.trim().length >= 7;
  const canShare       = recipientPhone.trim().length >= 7 || recipientName.trim().length >= 2;

  const fetchFX = useCallback(async () => {
    setFxLoading(true);
    const [cr, dr] = await Promise.all([
      isOriginCAD ? Promise.resolve(1) : getFXRate(originCountry.currency, "CAD"),
      destCountry.currency === "CAD" ? Promise.resolve(1) : getFXRate("CAD", destCountry.currency),
    ]);
    setCadRate(cr);
    setDestFxRate(dr);
    setFxLoading(false);
  }, [originCountry.currency, destCountry.currency, isOriginCAD]);

  useEffect(() => { if (amountNum > 0) fetchFX(); }, [amountNum, fetchFX]);

  function fmt(n: number, c: string) {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency: c }).format(n);
  }

  async function generateRemesaLink() {
    if (!cadAmount) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/remesa/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Siempre en CAD — evita doble conversión FX (Stripe + Wise)
          amount:         cadAmount,
          currency:       "cad",
          targetCountry:  destCountry.code,
          targetCurrency: destCountry.currency,
          targetAmount:   destAmount ?? cadAmount,
          senderPhone:    senderPhone.trim(),
          senderName:     senderName.trim(),
          recipientPhone: recipientPhone.trim(),
          recipientName:  recipientName.trim() || undefined,
        }),
      });
      const data = await res.json() as { checkout_url?: string; share_link?: string; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? t("error_generic"));

      // Guardar link antes de redirigir — el state de React no sobrevive el redirect
      sessionStorage.setItem("omnipay_remesa_link", data.share_link ?? "");
      window.location.href = data.checkout_url ?? "/remesa";
    } catch (e) {
      setError(e instanceof Error ? e.message : t("error_generic"));
      setLoading(false);
    }
  }

  const shareMessage = t("share_message", {
    amount: fmt(amountNum, originCountry.currency),
    dest:   destAmount ? fmt(destAmount, destCountry.currency) : "",
  });

  return (
    <main className="flex flex-col min-h-screen bg-[#0f172a] px-5 pt-6 pb-10">

      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => {
          if (step === "share")          setStep("recipient");
          else if (step === "recipient") setStep("origin");
          else router.push("/");
        }} className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <Send className="w-5 h-5 text-indigo-400" />
          <h1 className="text-white font-bold text-lg">{t("title")}</h1>
        </div>
      </div>

      {/* Step dots — 3 pasos */}
      <div className="flex gap-2 mb-8">
        {(["origin", "recipient", "share"] as Step[]).map((s, i) => (
          <div key={s} className={`h-1 flex-1 rounded-full transition-colors ${
            (["origin", "recipient", "share"] as Step[]).indexOf(step) >= i ? "bg-indigo-500" : "bg-slate-700"
          }`} />
        ))}
      </div>

      <AnimatePresence mode="wait">

        {/* ORIGIN — monto + países + datos del emisor */}
        {step === "origin" && (
          <motion.div key="origin" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
            className="flex flex-col gap-5">
            <CountryPicker value={originCountry.code} onChange={setOrigin} label={t("from_country")} />
            <AmountField value={amount} onChange={setAmount} currency={originCountry.currency} label={t("send_amount")} />
            <CountryPicker value={destCountry.code} onChange={setDest} label={t("to_country")} />

            {/* FX preview */}
            {amountNum > 0 && (
              <div className="bg-indigo-900/20 border border-indigo-700/30 rounded-xl px-4 py-3 flex flex-col gap-1.5">
                {fxLoading ? <p className="text-slate-500 text-sm">{t("calculating")}</p>
                  : destAmount !== null && cadAmount !== null ? (
                    <>
                      {/* Monto a cobrar en CAD */}
                      {!isOriginCAD && (
                        <div className="flex justify-between items-center">
                          <p className="text-slate-500 text-xs">{t("charge_cad")}</p>
                          <p className="text-slate-300 text-sm font-semibold">{fmt(cadAmount, "CAD")}</p>
                        </div>
                      )}
                      {/* Receptor recibe */}
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
                      {/* Rate line */}
                      {destFxRate && (
                        <p className="text-slate-600 text-xs">
                          1 CAD = {destFxRate.toFixed(2)} {destCountry.currency} · OmniPay 1%
                        </p>
                      )}
                    </>
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

            {/* Datos del emisor */}
            <div className="flex flex-col gap-3 pt-1">
              <input type="text" value={senderName} onChange={(e) => setSenderName(e.target.value)}
                placeholder={t("sender_name")}
                className="bg-slate-800/60 border border-slate-700 focus:border-indigo-500 rounded-xl px-4 py-3 text-white placeholder-slate-500 text-sm focus:outline-none transition-colors"
              />
              <input type="tel" value={senderPhone} onChange={(e) => setSenderPhone(e.target.value)}
                placeholder={t("sender_phone")}
                className="bg-slate-800/60 border border-slate-700 focus:border-indigo-500 rounded-xl px-4 py-3 text-white placeholder-slate-500 text-sm focus:outline-none transition-colors"
              />
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
              {loading
                ? <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                    className="w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                : <>{t("generate_link")} <ChevronRight className="w-5 h-5" /></>}
            </button>
          </motion.div>
        )}

        {/* SHARE — link listo para compartir */}
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
            <button onClick={() => {
              setStep("origin"); setAmount(""); setSenderName(""); setSenderPhone("");
              setRecipientPhone(""); setRecipientName(""); setShareLink(""); setError("");
            }}
              className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-2xl py-3 text-slate-300 text-sm transition-colors">
              {t("new_remesa")}
            </button>
          </motion.div>
        )}

      </AnimatePresence>
    </main>
  );
}

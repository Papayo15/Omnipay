"use client";

import { useState, useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Zap, ArrowLeft, Building2, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { SEPA_COUNTRIES } from "@/lib/wise-accounts";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "");

// ── Fee constants (mirrors b2b/page.tsx) ───────────────────────────────────────
const STRIPE_PCT   = 0.029;
const STRIPE_FLAT  = 0.30;
const WISE_B2B_PCT = 0.011;
const WISE_B2B_MIN = 3.00;
const OMNI_PCT     = 0.005;
const OMNI_MIN     = 1.99;
const OMNI_FLAT    = 1.99;

function calcFees(sendAmount: number) {
  const stripe  = +(sendAmount * STRIPE_PCT + STRIPE_FLAT).toFixed(2);
  const wise    = +Math.max(sendAmount * WISE_B2B_PCT, WISE_B2B_MIN).toFixed(2);
  const omni    = +Math.max(sendAmount * OMNI_PCT, OMNI_MIN).toFixed(2);
  const total   = +(sendAmount + stripe + wise + omni + OMNI_FLAT).toFixed(2);
  return { stripe, wise, omni, total };
}

const WISE_COUNTRIES = [
  { code: "MX", flag: "🇲🇽", currency: "MXN" },
  { code: "US", flag: "🇺🇸", currency: "USD" },
  { code: "GB", flag: "🇬🇧", currency: "GBP" },
  { code: "CA", flag: "🇨🇦", currency: "CAD" },
  { code: "AU", flag: "🇦🇺", currency: "AUD" },
  { code: "DE", flag: "🇩🇪", currency: "EUR" },
  { code: "FR", flag: "🇫🇷", currency: "EUR" },
  { code: "ES", flag: "🇪🇸", currency: "EUR" },
  { code: "IT", flag: "🇮🇹", currency: "EUR" },
  { code: "NL", flag: "🇳🇱", currency: "EUR" },
  { code: "PT", flag: "🇵🇹", currency: "EUR" },
  { code: "BE", flag: "🇧🇪", currency: "EUR" },
  { code: "CH", flag: "🇨🇭", currency: "CHF" },
  { code: "BR", flag: "🇧🇷", currency: "BRL" },
  { code: "CO", flag: "🇨🇴", currency: "COP" },
  { code: "IN", flag: "🇮🇳", currency: "INR" },
  { code: "NG", flag: "🇳🇬", currency: "NGN" },
  { code: "KE", flag: "🇰🇪", currency: "KES" },
  { code: "ZA", flag: "🇿🇦", currency: "ZAR" },
  { code: "PL", flag: "🇵🇱", currency: "PLN" },
  { code: "CZ", flag: "🇨🇿", currency: "CZK" },
  { code: "HU", flag: "🇭🇺", currency: "HUF" },
  { code: "RO", flag: "🇷🇴", currency: "RON" },
  { code: "SE", flag: "🇸🇪", currency: "SEK" },
  { code: "NO", flag: "🇳🇴", currency: "NOK" },
  { code: "DK", flag: "🇩🇰", currency: "DKK" },
  { code: "PH", flag: "🇵🇭", currency: "PHP" },
  { code: "MY", flag: "🇲🇾", currency: "MYR" },
  { code: "ID", flag: "🇮🇩", currency: "IDR" },
  { code: "JP", flag: "🇯🇵", currency: "JPY" },
  { code: "KR", flag: "🇰🇷", currency: "KRW" },
  { code: "SG", flag: "🇸🇬", currency: "SGD" },
  { code: "HK", flag: "🇭🇰", currency: "HKD" },
  { code: "NZ", flag: "🇳🇿", currency: "NZD" },
  { code: "IL", flag: "🇮🇱", currency: "ILS" },
];

type Step = "form" | "checkout" | "processing" | "done" | "error";

interface CheckoutFormProps {
  clientSecret: string;
  onSuccess: () => void;
  onError: (msg: string) => void;
  t: ReturnType<typeof useTranslations>;
}

function CheckoutForm({ clientSecret: _cs, onSuccess, onError, t }: CheckoutFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [paying, setPaying] = useState(false);

  const handlePay = useCallback(async () => {
    if (!stripe || !elements) return;
    setPaying(true);
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}/enviar-empresa?paid=1` },
      redirect: "if_required",
    });
    if (error) { onError(error.message ?? t("pay_error")); setPaying(false); }
    else { onSuccess(); }
  }, [stripe, elements, onSuccess, onError, t]);

  return (
    <div className="space-y-4">
      <PaymentElement />
      <button
        onClick={handlePay}
        disabled={paying || !stripe}
        className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-4 rounded-2xl transition-all duration-200 active:scale-[0.98]"
      >
        {paying ? t("paying") : t("pay_now")}
      </button>
    </div>
  );
}

export default function EnviarEmpresaPage() {
  const t  = useTranslations("enviar_empresa");
  const tF = useTranslations("p2p");
  const router = useRouter();

  const [step, setStep] = useState<Step>("form");
  const [error, setError] = useState("");
  const [clientSecret, setClientSecret] = useState("");

  // Sender data
  const [senderName, setSenderName] = useState("");
  const [senderEmail, setSenderEmail] = useState("");

  // Recipient data
  const [businessName, setBusinessName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientCountry, setRecipientCountry] = useState("MX");
  const [accountField, setAccountField] = useState("");
  const [bicField, setBicField] = useState("");
  const [receiveAmount, setReceiveAmount] = useState("");
  const [receiveCurrency, setReceiveCurrency] = useState("MXN");

  const isSepa   = SEPA_COUNTRIES.has(recipientCountry);
  const needsBic = isSepa;

  const accountLabel = recipientCountry === "MX" ? tF("clabe_label")
    : isSepa            ? tF("iban_label")
    : recipientCountry === "GB" ? tF("uk_label")
    : recipientCountry === "BR" ? tF("pix_label")
    : recipientCountry === "CO" ? tF("co_label")
    : tF("account_label");

  const accountHint = isSepa ? tF("hint_sepa")
    : recipientCountry === "GB" ? tF("hint_uk")
    : recipientCountry === "US" ? tF("hint_us")
    : null;

  // Update currency when country changes
  useEffect(() => {
    const currencies: Record<string, string> = {
      MX: "MXN", US: "USD", GB: "GBP", CA: "CAD", AU: "AUD", BR: "BRL",
      CO: "COP", IN: "INR", NG: "NGN", KE: "KES", ZA: "ZAR", JP: "JPY",
      KR: "KRW", SG: "SGD", HK: "HKD", NZ: "NZD", IL: "ILS", PH: "PHP",
      MY: "MYR", ID: "IDR", SE: "SEK", NO: "NOK", DK: "DKK", CH: "CHF",
      CZ: "CZK", HU: "HUF", RO: "RON", PL: "PLN",
    };
    setReceiveCurrency(SEPA_COUNTRIES.has(recipientCountry) ? "EUR" : (currencies[recipientCountry] ?? "USD"));
    setAccountField("");
    setBicField("");
  }, [recipientCountry]);

  // Indicative fee preview (amounts shown in USD/CAD approximation)
  const receiveNum = parseFloat(receiveAmount) || 0;
  const fees = calcFees(receiveNum);

  const handleSubmit = useCallback(async () => {
    setError("");
    try {
      // 1. Create remesa token (recipient bank details encrypted)
      const remesaRes = await fetch("/api/remesa/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientName:    businessName.trim(),
          recipientAccount: accountField.trim() + (bicField ? `|${bicField.trim()}` : ""),
          receiveMode:      "bank",
          receiveAmount:    receiveNum,
          receiveCurrency,
          targetCountry:    recipientCountry,
          originCountry:    "US",
          senderEmail:      senderEmail.trim().toLowerCase(),
        }),
      });
      const remesaData = await remesaRes.json() as {
        token?: string; link?: string; error?: string;
      };
      if (!remesaRes.ok || remesaData.error) throw new Error(remesaData.error ?? "Error generando token");

      // 2. Create Stripe payment intent using the existing remesa token
      const payRes = await fetch("/api/pay/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token:      remesaData.token,
          senderName: senderName.trim(),
          senderEmail: senderEmail.trim().toLowerCase(),
        }),
      });
      const payData = await payRes.json() as { clientSecret?: string; error?: string };
      if (!payRes.ok || payData.error) throw new Error(payData.error ?? "Error creando intención de pago");

      setClientSecret(payData.clientSecret!);
      setStep("checkout");
    } catch (e) {
      setError((e as Error).message);
      setStep("error");
    }
  }, [businessName, accountField, bicField, receiveNum, receiveCurrency, recipientCountry, senderName, senderEmail]);

  const isValid = senderName && senderEmail && businessName && accountField && receiveAmount && parseFloat(receiveAmount) >= 20;

  return (
    <main className="min-h-screen bg-[#0f172a] flex flex-col items-center px-5 pt-8 pb-16">
      <div className="w-full max-w-md">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button onClick={() => router.back()} className="text-slate-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <Zap className="w-5 h-5 text-[#00C9C8]" />
          <span className="text-white font-bold">OmniPay</span>
          <span className="ml-auto text-[10px] text-slate-500 uppercase tracking-widest">B2B</span>
        </div>

        {/* FORM */}
        {step === "form" && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-white mb-1">{t("title")}</h1>
              <p className="text-slate-400 text-sm">{t("subtitle")}</p>
            </div>

            {/* Datos del emisor (empresa) */}
            <div className="space-y-3">
              <p className="text-slate-400 text-xs uppercase tracking-widest">{t("section_you")}</p>
              <input type="text" placeholder={t("your_name")} value={senderName} onChange={e => setSenderName(e.target.value)}
                className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-emerald-500/60" />
              <input type="email" placeholder={t("your_email")} value={senderEmail} onChange={e => setSenderEmail(e.target.value)}
                className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-emerald-500/60" />
            </div>

            {/* Datos de la empresa receptora */}
            <div className="space-y-3">
              <p className="text-slate-400 text-xs uppercase tracking-widest">{t("section_recipient")}</p>
              <input type="text" placeholder={t("business_name")} value={businessName} onChange={e => setBusinessName(e.target.value)}
                className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-[#00C9C8]/60" />
              <input type="email" placeholder={t("recipient_email") + " " + t("optional")} value={recipientEmail} onChange={e => setRecipientEmail(e.target.value)}
                className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-[#00C9C8]/60" />

              <select value={recipientCountry} onChange={e => setRecipientCountry(e.target.value)}
                className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#00C9C8]/60">
                {WISE_COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.flag} {tF(`country_${c.code}`)} ({c.currency})</option>)}
              </select>

              <input type="text" placeholder={accountLabel} value={accountField} onChange={e => setAccountField(e.target.value)}
                className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-[#00C9C8]/60 font-mono" />
              {needsBic && (
                <input type="text" placeholder="BIC / SWIFT" value={bicField} onChange={e => setBicField(e.target.value)}
                  className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-[#00C9C8]/60 font-mono" />
              )}
              {accountHint && <p className="text-slate-500 text-[10px] px-1">{accountHint}</p>}
            </div>

            {/* Monto */}
            <div className="space-y-3">
              <p className="text-slate-400 text-xs uppercase tracking-widest">{t("section_amount")}</p>
              <div className="relative">
                <input type="number" placeholder="0.00" value={receiveAmount} onChange={e => setReceiveAmount(e.target.value)}
                  className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 pr-16 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-emerald-500/60" />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-mono">{receiveCurrency}</span>
              </div>
              <p className="text-slate-500 text-[10px] px-1">{t("amount_hint")}</p>
            </div>

            {/* Fee preview */}
            {receiveNum >= 20 && (
              <div className="bg-slate-800/40 border border-slate-700/60 rounded-2xl p-4 space-y-2">
                <p className="text-slate-400 text-xs uppercase tracking-widest mb-3">{t("fee_preview")}</p>
                <div className="flex justify-between text-xs text-slate-400">
                  <span>{t("fee_stripe")}</span>
                  <span className="font-mono">${fees.stripe.toFixed(2)} USD</span>
                </div>
                <div className="flex justify-between text-xs text-slate-400">
                  <span>{t("fee_wise")}</span>
                  <span className="font-mono">${fees.wise.toFixed(2)} USD</span>
                </div>
                <div className="flex justify-between text-xs text-slate-400">
                  <span>{t("fee_omni")}</span>
                  <span className="font-mono">${fees.omni.toFixed(2)} + $1.99 USD</span>
                </div>
                <div className="border-t border-slate-700 pt-2 flex justify-between text-sm font-semibold">
                  <span className="text-white">{t("fee_total")}</span>
                  <span className="text-emerald-400 font-mono">${fees.total.toFixed(2)} USD</span>
                </div>
                <p className="text-slate-500 text-[10px] leading-relaxed">{t("fee_note")}</p>
              </div>
            )}

            <button onClick={handleSubmit} disabled={!isValid}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-4 rounded-2xl transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2">
              <Building2 className="w-4 h-4" />
              {t("cta")}
            </button>

            <div className="text-center">
              <p className="text-slate-500 text-xs">{t("delivery_note")}</p>
            </div>
          </div>
        )}

        {/* CHECKOUT — Stripe Elements */}
        {step === "checkout" && clientSecret && (
          <div className="space-y-6">
            <div>
              <h1 className="text-xl font-bold text-white mb-1">{t("pay_title")}</h1>
              <p className="text-slate-400 text-sm">{t("pay_subtitle")}</p>
            </div>

            <div className="bg-slate-800/40 border border-slate-700/60 rounded-2xl p-4">
              <p className="text-slate-400 text-xs mb-1">{t("paying_to")}</p>
              <p className="text-white font-semibold">{businessName}</p>
              <p className="text-slate-400 text-xs mt-1">{receiveAmount} {receiveCurrency} · {tF(`country_${recipientCountry}`)}</p>
            </div>

            <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: "night" } }}>
              <CheckoutForm
                clientSecret={clientSecret}
                onSuccess={() => setStep("done")}
                onError={(msg) => { setError(msg); setStep("error"); }}
                t={t}
              />
            </Elements>

            <button onClick={() => setStep("form")} className="w-full text-slate-500 text-sm hover:text-slate-300 transition-colors py-2">
              ← {t("back")}
            </button>
          </div>
        )}

        {/* DONE */}
        {step === "done" && (
          <div className="space-y-6 pt-8">
            <div className="flex flex-col items-center gap-4">
              <CheckCircle2 className="w-16 h-16 text-emerald-400" />
              <div className="text-center">
                <h1 className="text-2xl font-bold text-white mb-2">{t("done_title")}</h1>
                <p className="text-slate-400 text-sm leading-relaxed">{t("done_body")}</p>
              </div>
            </div>
            <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-2xl p-5 space-y-2">
              <p className="text-emerald-400 font-semibold text-sm">{t("done_timeline_title")}</p>
              <div className="flex items-center gap-3">
                <Clock className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <p className="text-slate-300 text-sm">{t("done_timeline_body")}</p>
              </div>
            </div>
            <button onClick={() => router.push("/")} className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-3 rounded-xl transition-all text-sm">
              {t("go_home")}
            </button>
          </div>
        )}

        {/* ERROR */}
        {step === "error" && (
          <div className="space-y-6">
            <div className="bg-red-900/20 border border-red-500/30 rounded-2xl p-5 flex gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-red-300 text-sm">{error}</p>
            </div>
            <button onClick={() => setStep("form")} className="w-full text-slate-400 hover:text-white text-sm transition-colors py-2">
              ← {t("back")}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, Copy, Check, CreditCard, Building2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { getFXRate } from "@/lib/fx";

type Step     = "form" | "generating" | "share" | "error";
type PayMode  = "card" | "bank";

// Countries with native bank rail (Bridge NATIVE_RAILS)
const BANK_RAIL_COUNTRIES = new Set([
  "MX","US","BR","GB","CA","IN","PH","DE","FR","ES","IT","NL","PT","BE","AT","IE",
]);

// Countries + currencies for the dropdown
const COUNTRY_OPTIONS = [
  { code: "MX", label: "México", currency: "MXN", flag: "🇲🇽" },
  { code: "US", label: "USA",    currency: "USD", flag: "🇺🇸" },
  { code: "BR", label: "Brasil", currency: "BRL", flag: "🇧🇷" },
  { code: "CO", label: "Colombia", currency: "COP", flag: "🇨🇴" },
  { code: "AR", label: "Argentina", currency: "ARS", flag: "🇦🇷" },
  { code: "PE", label: "Perú",   currency: "PEN", flag: "🇵🇪" },
  { code: "GB", label: "UK",     currency: "GBP", flag: "🇬🇧" },
  { code: "DE", label: "Alemania", currency: "EUR", flag: "🇩🇪" },
  { code: "FR", label: "Francia", currency: "EUR", flag: "🇫🇷" },
  { code: "ES", label: "España", currency: "EUR", flag: "🇪🇸" },
  { code: "IT", label: "Italia", currency: "EUR", flag: "🇮🇹" },
  { code: "NL", label: "Países Bajos", currency: "EUR", flag: "🇳🇱" },
  { code: "PT", label: "Portugal", currency: "EUR", flag: "🇵🇹" },
  { code: "CA", label: "Canadá", currency: "CAD", flag: "🇨🇦" },
  { code: "IN", label: "India",  currency: "INR", flag: "🇮🇳" },
  { code: "PH", label: "Filipinas", currency: "PHP", flag: "🇵🇭" },
  { code: "NG", label: "Nigeria", currency: "NGN", flag: "🇳🇬" },
  { code: "GH", label: "Ghana",  currency: "GHS", flag: "🇬🇭" },
  { code: "KE", label: "Kenia",  currency: "KES", flag: "🇰🇪" },
  { code: "JP", label: "Japón",  currency: "JPY", flag: "🇯🇵" },
  { code: "AU", label: "Australia", currency: "AUD", flag: "🇦🇺" },
  { code: "TH", label: "Tailandia", currency: "THB", flag: "🇹🇭" },
];

interface BridgeQuote {
  amount_principal:  number;
  bridge_onramp:     number;
  bridge_offramp:    number;
  bridge_total:      number;
  omnipay_service:   number;
  omnipay_flat:      number;
  kyc_surcharge:     number;
  is_new_customer:   boolean;
  total_sender_pays: number;
  target_currency:   string;
}

interface CheckoutResponse {
  pay_link:        string;
  token:           string;
  needs_kyc:       boolean;
  kyc_url?:        string | null;
  amount_target:   number;
  target_currency: string;
  country:         string;
}

export default function P2PPage() {
  const t      = useTranslations("p2p");
  const router = useRouter();

  const [step,         setStep]         = useState<Step>("form");
  const [payMode,      setPayMode]      = useState<PayMode>("card");
  const [nombre,       setNombre]       = useState("");
  const [email,        setEmail]        = useState("");
  const [country,      setCountry]      = useState("MX");
  const [account,      setAccount]      = useState("");
  const [amountLocal,  setAmountLocal]  = useState("");  // in local currency (MXN, BRL, etc.)
  const [recipientPhone, setRecipientPhone] = useState("");
  const [shareLink,    setShareLink]    = useState("");
  const [copied,       setCopied]       = useState(false);
  const [errorMsg,     setErrorMsg]     = useState("");
  const [submitting,   setSubmitting]   = useState(false);
  const [quote,        setQuote]        = useState<BridgeQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [fxRate,       setFxRate]       = useState<number | null>(null);
  const [kycUrl,       setKycUrl]       = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedCountry = COUNTRY_OPTIONS.find((c) => c.code === country) ?? COUNTRY_OPTIONS[0];
  const hasBankRail     = BANK_RAIL_COUNTRIES.has(country);
  const currency        = selectedCountry.currency;

  // Reset pay mode when country changes to one without bank rail
  useEffect(() => {
    if (!hasBankRail && payMode === "bank") {
      setPayMode("card");
      setAccount("");
    }
  }, [country, hasBankRail, payMode]);

  // Live quote: debounce on amount + email + country change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const amt = parseFloat(amountLocal);
    if (!amt || amt < 1 || !email.includes("@")) { setQuote(null); return; }

    debounceRef.current = setTimeout(async () => {
      setQuoteLoading(true);
      try {
        // 1. FX: local currency → USD
        const rate = await getFXRate(currency, "USD");
        setFxRate(rate);
        if (!rate) return;

        const usdEstimate = amt * rate;

        // 2. Bridge quote with USD estimate
        const res = await fetch("/api/bridge/quote", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ amount: usdEstimate, email: email.toLowerCase(), type: "p2p", country }),
        });
        if (res.ok) setQuote(await res.json() as BridgeQuote);
      } catch { /* ignore */ } finally {
        setQuoteLoading(false);
      }
    }, 700);
  }, [amountLocal, email, country, currency]);

  const generateLink = useCallback(async () => {
    const amt = parseFloat(amountLocal);
    if (!nombre.trim() || !email.includes("@") || !account.trim() || !amt) return;

    setSubmitting(true);
    setStep("generating");
    try {
      const body: Record<string, unknown> = {
        nombre:          nombre.trim(),
        email:           email.toLowerCase().trim(),
        country,
        receive_method:  payMode,
        amount_target:   amt,
        recipient_phone: recipientPhone || undefined,
      };
      if (payMode === "card") {
        body.card_number = account.replace(/\s/g, "");
      } else {
        // Map bank account to right field based on country
        if (country === "MX") body.clabe = account;
        else if (["DE","FR","ES","IT","NL","PT","BE","AT","IE"].includes(country)) body.iban = account;
        else if (country === "BR") body.pix_key = account;
        else if (country === "GB") {
          const parts = account.split("/");
          body.sort_code       = parts[0]?.trim();
          body.account_number  = parts[1]?.trim();
        } else if (country === "CA") {
          const parts = account.split("/");
          body.transit_number  = parts[0]?.trim();
          body.account_number  = parts[1]?.trim();
        } else if (country === "IN") {
          const parts = account.split("/");
          body.ifsc            = parts[0]?.trim();
          body.account_number  = parts[1]?.trim();
        } else {
          body.account_number = account;
        }
      }

      const res  = await fetch("/api/bridge/checkout", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      const data = await res.json() as CheckoutResponse & { error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "Error");

      setShareLink(data.pay_link);
      if (data.kyc_url) setKycUrl(data.kyc_url);
      setStep("share");
    } catch (err) {
      setErrorMsg((err as Error).message);
      setStep("error");
    } finally {
      setSubmitting(false);
    }
  }, [nombre, email, country, payMode, account, amountLocal, recipientPhone]);

  const copyLink = useCallback(async () => {
    await navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [shareLink]);

  const openWhatsApp = useCallback(() => {
    const senderAmt = quote ? quote.total_sender_pays.toFixed(2) : "?";
    const msg = t("share_message_cobrar", {
      name:          nombre,
      amount:        parseFloat(amountLocal).toLocaleString(),
      currency,
      sender_amount: senderAmt,
      link:          shareLink,
    });
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  }, [nombre, amountLocal, currency, shareLink, quote, t]);

  const openTelegram = useCallback(() => {
    const senderAmt = quote ? quote.total_sender_pays.toFixed(2) : "?";
    const msg = t("share_message_cobrar", {
      name:          nombre,
      amount:        parseFloat(amountLocal).toLocaleString(),
      currency,
      sender_amount: senderAmt,
      link:          shareLink,
    });
    window.open(`https://t.me/share/url?url=${encodeURIComponent(shareLink)}&text=${encodeURIComponent(msg)}`, "_blank");
  }, [nombre, amountLocal, currency, shareLink, quote, t]);

  const scrollToForm = () => document.getElementById("p2p-form")?.scrollIntoView({ behavior: "smooth" });

  const accountValid = payMode === "card"
    ? account.replace(/\s/g, "").length === 16
    : account.trim().length >= 5;
  const formReady = !!nombre.trim() && email.includes("@") && accountValid && parseFloat(amountLocal) >= 1;

  // ── Generating ──────────────────────────────────────────────────────────────
  if (step === "generating") {
    return (
      <main className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-slate-400 text-sm">{t("generate_button")}…</p>
        </div>
      </main>
    );
  }

  // ── Share ───────────────────────────────────────────────────────────────────
  if (step === "share") {
    const senderAmt = quote ? quote.total_sender_pays.toFixed(2) : null;
    return (
      <main className="min-h-screen bg-[#0f172a] flex flex-col px-5 pt-12 pb-10 max-w-sm mx-auto w-full">
        <button onClick={() => setStep("form")} className="flex items-center gap-1 text-slate-400 text-sm mb-8 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" /> {t("new_transfer")}
        </button>
        <div className="flex-1 flex flex-col items-center justify-center gap-5 text-center">
          <div className="text-5xl">🔗</div>
          <div>
            <h2 className="text-white font-bold text-xl mb-1">{t("share_title")}</h2>
            <p className="text-slate-400 text-sm">{t("share_hint")}</p>
          </div>

          {/* KYC notice */}
          {kycUrl && (
            <div className="w-full bg-amber-900/30 border border-amber-500/40 rounded-2xl p-4 text-left">
              <p className="text-amber-400 text-xs font-semibold mb-1">⚠️ {t("kyc_pending_title")}</p>
              <p className="text-slate-400 text-xs mb-2">{t("kyc_pending_body")}</p>
              <a href={kycUrl} target="_blank" rel="noopener noreferrer"
                className="text-emerald-400 text-xs underline">{t("kyc_complete_link")}</a>
            </div>
          )}

          {/* Summary card */}
          <div className="w-full bg-slate-800/60 border border-slate-700 rounded-2xl p-4 text-center">
            <p className="text-slate-400 text-xs mb-1">{nombre}</p>
            <p className="text-white font-bold text-2xl">{parseFloat(amountLocal).toLocaleString()} {currency}</p>
            {senderAmt && (
              <p className="text-slate-500 text-xs mt-2">
                {t("sender_ref_usd", { amount: senderAmt })}
              </p>
            )}
            <p className="text-slate-600 text-xs mt-1">Bridge · Sin base de datos</p>
          </div>

          {/* Action buttons */}
          <div className="w-full space-y-3">
            <button onClick={openWhatsApp} className="w-full bg-[#25D366] hover:bg-[#20ba59] text-white font-semibold py-3 rounded-xl text-sm flex items-center justify-center gap-2 transition-colors">
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              {t("share_whatsapp")}
            </button>
            <button onClick={openTelegram} className="w-full bg-[#229ED9] hover:bg-[#1a8bc2] text-white font-semibold py-3 rounded-xl text-sm flex items-center justify-center gap-2 transition-colors">
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
              {t("done_share_telegram")}
            </button>
            <button onClick={copyLink} className="w-full border border-slate-600 text-slate-300 hover:border-slate-400 py-3 rounded-xl text-sm flex items-center justify-center gap-2 transition-colors">
              {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
              {copied ? "✓" : t("share_copy")}
            </button>
          </div>
          <button onClick={() => { setStep("form"); setNombre(""); setEmail(""); setAccount(""); setAmountLocal(""); setRecipientPhone(""); setQuote(null); setKycUrl(null); }}
            className="text-slate-500 hover:text-slate-300 text-xs transition-colors">
            + {t("new_transfer")}
          </button>
        </div>
      </main>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────────
  if (step === "error") {
    return (
      <main className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center px-6 text-center gap-5">
        <div className="text-5xl">⚠️</div>
        <p className="text-slate-300 text-sm max-w-xs">{errorMsg}</p>
        <button onClick={() => setStep("form")} className="text-emerald-400 text-sm underline">← {t("new_transfer")}</button>
      </main>
    );
  }

  // ── FORM ─────────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-[#0f172a] flex flex-col pb-10 w-full">

      {/* Back */}
      <div className="max-w-2xl mx-auto w-full px-6 pt-6">
        <button onClick={() => router.push("/")} className="flex items-center gap-2 text-slate-400 hover:text-white text-sm transition-colors">
          ← OmniPay Global
        </button>
      </div>

      {/* Header */}
      <section className="w-full max-w-2xl mx-auto px-6 pt-8 pb-4 text-center">
        <div className="text-4xl mb-3">💸</div>
        <h1 className="text-white font-bold text-2xl mb-1">{t("cobrar_title")}</h1>
        <p className="text-slate-400 text-sm mb-2">{t("cobrar_subtitle")}</p>
        <span className="text-[10px] text-slate-500 bg-slate-800 rounded-lg px-3 py-1.5 inline-block">
          Powered by Bridge.xyz · 170+ países · Sin base de datos
        </span>
      </section>

      {/* Feature cards */}
      <section className="w-full max-w-2xl mx-auto px-6 py-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { emoji: "🌍", title: t("feat1_title"), body: t("feat1_body") },
          { emoji: "💱", title: t("feat2_title"), body: t("feat2_body") },
          { emoji: "⚡", title: t("feat3_title"), body: t("feat3_body") },
        ].map((f) => (
          <div key={f.title} className="bg-slate-800/50 rounded-2xl p-5 border border-slate-700/50">
            <div className="text-2xl mb-3">{f.emoji}</div>
            <h3 className="text-white font-semibold text-sm mb-2">{f.title}</h3>
            <p className="text-slate-400 text-xs leading-relaxed">{f.body}</p>
          </div>
        ))}
      </section>

      {/* Pricing */}
      <section className="w-full max-w-2xl mx-auto px-6 pb-10">
        <h2 className="text-white font-bold text-xl text-center mb-2">{t("pricing_title")}</h2>
        <p className="text-slate-500 text-xs text-center mb-8">{t("pricing_sub")}</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="bg-slate-800/60 border border-emerald-500/40 rounded-2xl p-6 flex flex-col gap-4">
            <div>
              <span className="text-xs text-slate-400 uppercase tracking-widest font-semibold">{t("pricing_card1_label")}</span>
              <p className="text-emerald-400 text-4xl font-extrabold mt-1">~2%</p>
              <p className="text-slate-400 text-xs mt-1">{t("pricing_card1_fee")}</p>
            </div>
            <ul className="text-slate-400 text-xs space-y-1">
              {[t("pricing_card1_li1"), t("pricing_card1_li2"), t("pricing_card1_li3"), t("pricing_card1_li4")].map((li) => (
                <li key={li}>{li}</li>
              ))}
            </ul>
            <button onClick={scrollToForm} className="mt-auto w-full bg-emerald-500 hover:bg-emerald-400 active:scale-95 transition-all text-white font-semibold py-3 rounded-xl text-sm">
              {t("pricing_card1_cta")}
            </button>
          </div>
          <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-6 flex flex-col gap-4 relative">
            <span className="absolute top-4 right-4 bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">60% OFF</span>
            <div>
              <span className="text-xs text-slate-400 uppercase tracking-widest font-semibold">{t("pricing_card2_label")}</span>
              <p className="text-slate-200 text-4xl font-extrabold mt-1">vs.</p>
              <p className="text-slate-400 text-xs mt-1">{t("pricing_card2_fee")}</p>
            </div>
            <ul className="text-xs space-y-1">
              <li className="text-emerald-400 font-semibold">{t("pricing_card2_li1")}</li>
              {[t("pricing_card2_li2"), t("pricing_card2_li3"), t("pricing_card2_li4")].map((li) => (
                <li key={li} className="text-red-400">{li}</li>
              ))}
            </ul>
            <button onClick={scrollToForm} className="mt-auto w-full border border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10 active:scale-95 transition-all font-semibold py-3 rounded-xl text-sm">
              {t("pricing_card1_cta")}
            </button>
          </div>
        </div>
      </section>

      {/* Form header */}
      <div className="w-full max-w-sm mx-auto px-5 pb-4">
        <h2 className="text-white font-bold text-lg mb-1">{t("form_title")}</h2>
        <p className="text-slate-500 text-xs mb-6">{t("form_sub")}</p>
      </div>

      <div id="p2p-form" className="space-y-4 flex-1 max-w-sm mx-auto w-full px-5">

        {/* Nombre */}
        <div>
          <label className="block text-xs text-slate-400 mb-1">{t("label_recipient")}</label>
          <input
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder={t("name_placeholder")}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-sm"
          />
        </div>

        {/* Email */}
        <div>
          <label className="block text-xs text-slate-400 mb-1">{t("email_label")}</label>
          <input
            type="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@email.com"
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-sm"
          />
        </div>

        {/* País */}
        <div>
          <label className="block text-xs text-slate-400 mb-1">{t("country_label")}</label>
          <select
            value={country}
            onChange={(e) => { setCountry(e.target.value); setAccount(""); setQuote(null); }}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-emerald-500"
          >
            {COUNTRY_OPTIONS.map((c) => (
              <option key={c.code} value={c.code}>{c.flag} {c.label} — {c.currency}</option>
            ))}
          </select>
        </div>

        {/* Método de cobro */}
        <div>
          <label className="block text-xs text-slate-400 mb-2">{t("card_or_bank")}</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setPayMode("card"); setAccount(""); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                payMode === "card"
                  ? "bg-emerald-500/20 border-emerald-500 text-emerald-400"
                  : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500"
              }`}
            >
              <CreditCard size={15} /> {t("payout_toggle_card")}
            </button>
            {hasBankRail && (
              <button
                type="button"
                onClick={() => { setPayMode("bank"); setAccount(""); }}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                  payMode === "bank"
                    ? "bg-blue-500/20 border-blue-500 text-blue-400"
                    : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500"
                }`}
              >
                <Building2 size={15} /> {t("payout_toggle_bank")}
              </button>
            )}
          </div>
        </div>

        {/* Cuenta (tarjeta o banco) */}
        {payMode === "card" ? (
          <div>
            <label className="block text-xs text-slate-400 mb-1">{t("card_number_label")}</label>
            <input
              type="text"
              inputMode="numeric"
              value={account}
              onChange={(e) => {
                const raw = e.target.value.replace(/\D/g, "").slice(0, 16);
                setAccount(raw.replace(/(.{4})/g, "$1 ").trim());
              }}
              placeholder={t("card_number_placeholder")}
              className={`w-full bg-slate-800 border rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none text-sm font-mono tracking-widest transition-colors ${
                account.replace(/\s/g, "").length > 0 && account.replace(/\s/g, "").length !== 16
                  ? "border-red-500" : "border-slate-700 focus:border-emerald-500"
              }`}
            />
            {account.replace(/\s/g, "").length > 0 && account.replace(/\s/g, "").length !== 16 && (
              <p className="text-xs text-red-400 mt-1">16 dígitos requeridos</p>
            )}
          </div>
        ) : (
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              {country === "MX" ? t("clabe_label")
                : ["DE","FR","ES","IT","NL","PT","BE","AT","IE"].includes(country) ? "IBAN"
                : country === "BR" ? "Chave PIX"
                : country === "GB" ? "Sort Code / Account Number (XXXXXX/XXXXXXXX)"
                : country === "CA" ? "Transit / Account (XXXXX/XXXXXXX)"
                : country === "IN" ? "IFSC / Account (XXXXXXXXXX/XXXXXXXX)"
                : "Número de cuenta"}
            </label>
            <input
              type="text"
              inputMode={country === "MX" ? "numeric" : "text"}
              value={account}
              onChange={(e) => setAccount(country === "MX" ? e.target.value.replace(/\D/g, "").slice(0, 18) : e.target.value)}
              placeholder={country === "MX" ? t("clabe_placeholder") : ""}
              className={`w-full bg-slate-800 border rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none text-sm font-mono transition-colors ${
                country === "MX" && account.length > 0 && account.length !== 18
                  ? "border-red-500" : "border-slate-700 focus:border-emerald-500"
              }`}
            />
            {country === "MX" && account.length > 0 && account.length !== 18 && (
              <p className="text-xs text-red-400 mt-1">{t("error_invalid_clabe")}</p>
            )}
          </div>
        )}

        {/* Monto a recibir */}
        <div>
          <label className="block text-xs text-slate-400 mb-1">
            {t("amount_receive_label")} ({currency})
          </label>
          <input
            type="number"
            inputMode="numeric"
            value={amountLocal}
            onChange={(e) => setAmountLocal(e.target.value)}
            placeholder={currency === "MXN" ? "5000" : currency === "USD" ? "300" : "500"}
            min="1"
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-sm"
          />
        </div>

        {/* Live fee breakdown */}
        {(quoteLoading || quote) && (
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4 space-y-2">
            <p className="text-xs text-slate-400 font-semibold uppercase tracking-widest mb-3">
              {t("fee_breakdown_title")}
            </p>
            {quoteLoading ? (
              <div className="flex items-center gap-2 text-slate-500 text-xs py-2">
                <div className="w-3 h-3 border border-slate-500 border-t-transparent rounded-full animate-spin" />
                {t("fee_loading")}
              </div>
            ) : quote ? (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">{t("fee_principal")}</span>
                  <span className="text-white font-semibold">{parseFloat(amountLocal).toLocaleString()} {currency}</span>
                </div>
                {fxRate && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-600">≈ USD estimado</span>
                    <span className="text-slate-500">${(parseFloat(amountLocal) * fxRate).toFixed(2)} USD</span>
                  </div>
                )}
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">{t("fee_bridge_conversion")} (0.75%)</span>
                  <span className="text-slate-400">${quote.bridge_total.toFixed(2)} USD</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">{t("fee_platform")} (1.25%)</span>
                  <span className="text-slate-400">${quote.omnipay_service.toFixed(2)} USD</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">{t("fee_network")} (fijo)</span>
                  <span className="text-slate-400">${quote.omnipay_flat.toFixed(2)} USD</span>
                </div>
                {quote.kyc_surcharge > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-amber-500">{t("fee_kyc_first")}</span>
                    <span className="text-amber-400">${quote.kyc_surcharge.toFixed(2)} USD</span>
                  </div>
                )}
                <div className="border-t border-slate-700 pt-2 flex justify-between text-sm font-bold">
                  <span className="text-white">{t("fee_total_to_send")}</span>
                  <span className="text-emerald-400">${quote.total_sender_pays.toFixed(2)} USD</span>
                </div>
                <p className="text-[10px] text-slate-500 text-center mt-1">{t("fee_sender_sees_own_currency")}</p>
                <p className="text-[10px] text-slate-600 text-center mt-1">{t("fee_approx_note")}</p>
              </>
            ) : null}
          </div>
        )}

        {/* Phone (optional) */}
        <div>
          <label className="block text-xs text-slate-400 mb-1">{t("label_recipient_phone")}</label>
          <input type="tel" inputMode="tel" value={recipientPhone} onChange={(e) => setRecipientPhone(e.target.value)}
            placeholder="+52 55 1234 5678"
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-sm" />
        </div>

        {/* Submit */}
        <button
          onClick={generateLink}
          disabled={submitting || !formReady || quoteLoading}
          className="w-full bg-emerald-500 hover:bg-emerald-400 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-white py-4 rounded-2xl font-semibold text-lg mt-2"
        >
          {submitting ? `${t("generate_button")}…` : t("pricing_card1_cta")}
        </button>

        <p className="text-center text-xs text-slate-600 pb-2">
          🔒 Bridge.xyz · AES-256-GCM · {t("feat3_title")}
        </p>

      </div>
    </main>
  );
}

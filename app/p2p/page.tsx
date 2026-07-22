"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, Copy, Check, CreditCard, Building2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { getFXRate } from "@/lib/fx";
import { validateClabe, detectBank, type BankInfo } from "@/lib/clabe";

type Step     = "form" | "generating" | "share" | "error";
type PayMode  = "card" | "bank";

// All 41 countries with native Bridge bank rail (SPEI/ACH/PIX/FPS/Bre-B/SEPA)
const BANK_RAIL_COUNTRIES = new Set([
  "MX","US","BR","GB","CO",
  "DE","FR","ES","IT","NL","PT","BE","AT","IE","FI","GR","CY","EE","LV","LT","LU","MT","SK","SI","HR",
  "SE","DK","NO","PL","CZ","HU","RO","BG","CH","IS","LI",
  "AD","MC","SM","XK","VA",
]);

// SEPA countries always receive EUR regardless of local currency
const SEPA_COUNTRIES = new Set([
  "DE","FR","ES","IT","NL","PT","BE","AT","IE","FI","GR","CY","EE","LV","LT","LU","MT","SK","SI","HR",
  "SE","DK","NO","PL","CZ","HU","RO","BG","CH","IS","LI","AD","MC","SM","XK","VA",
]);

// Countries + currencies for the dropdown — 41 Bridge-native + extras
const COUNTRY_OPTIONS = [
  // Americas
  { code: "MX", label: "México",          currency: "MXN", flag: "🇲🇽" },
  { code: "US", label: "EE.UU.",          currency: "USD", flag: "🇺🇸" },
  { code: "BR", label: "Brasil",          currency: "BRL", flag: "🇧🇷" },
  { code: "CO", label: "Colombia",        currency: "COP", flag: "🇨🇴" },
  // UK + Europe (Bridge native)
  { code: "GB", label: "Reino Unido",     currency: "GBP", flag: "🇬🇧" },
  { code: "DE", label: "Alemania",        currency: "EUR", flag: "🇩🇪" },
  { code: "FR", label: "Francia",         currency: "EUR", flag: "🇫🇷" },
  { code: "ES", label: "España",          currency: "EUR", flag: "🇪🇸" },
  { code: "IT", label: "Italia",          currency: "EUR", flag: "🇮🇹" },
  { code: "NL", label: "Países Bajos",    currency: "EUR", flag: "🇳🇱" },
  { code: "PT", label: "Portugal",        currency: "EUR", flag: "🇵🇹" },
  { code: "BE", label: "Bélgica",         currency: "EUR", flag: "🇧🇪" },
  { code: "AT", label: "Austria",         currency: "EUR", flag: "🇦🇹" },
  { code: "IE", label: "Irlanda",         currency: "EUR", flag: "🇮🇪" },
  { code: "FI", label: "Finlandia",       currency: "EUR", flag: "🇫🇮" },
  { code: "GR", label: "Grecia",          currency: "EUR", flag: "🇬🇷" },
  { code: "CY", label: "Chipre",          currency: "EUR", flag: "🇨🇾" },
  { code: "EE", label: "Estonia",         currency: "EUR", flag: "🇪🇪" },
  { code: "LV", label: "Letonia",         currency: "EUR", flag: "🇱🇻" },
  { code: "LT", label: "Lituania",        currency: "EUR", flag: "🇱🇹" },
  { code: "LU", label: "Luxemburgo",      currency: "EUR", flag: "🇱🇺" },
  { code: "MT", label: "Malta",           currency: "EUR", flag: "🇲🇹" },
  { code: "SK", label: "Eslovaquia",      currency: "EUR", flag: "🇸🇰" },
  { code: "SI", label: "Eslovenia",       currency: "EUR", flag: "🇸🇮" },
  { code: "HR", label: "Croacia",         currency: "EUR", flag: "🇭🇷" },
  { code: "SE", label: "Suecia",          currency: "EUR", flag: "🇸🇪" },
  { code: "DK", label: "Dinamarca",       currency: "EUR", flag: "🇩🇰" },
  { code: "NO", label: "Noruega",         currency: "EUR", flag: "🇳🇴" },
  { code: "PL", label: "Polonia",         currency: "EUR", flag: "🇵🇱" },
  { code: "CZ", label: "Rep. Checa",      currency: "EUR", flag: "🇨🇿" },
  { code: "HU", label: "Hungría",         currency: "EUR", flag: "🇭🇺" },
  { code: "RO", label: "Rumania",         currency: "EUR", flag: "🇷🇴" },
  { code: "BG", label: "Bulgaria",        currency: "EUR", flag: "🇧🇬" },
  { code: "CH", label: "Suiza",           currency: "EUR", flag: "🇨🇭" },
  { code: "IS", label: "Islandia",        currency: "EUR", flag: "🇮🇸" },
  { code: "LI", label: "Liechtenstein",   currency: "EUR", flag: "🇱🇮" },
  { code: "AD", label: "Andorra",         currency: "EUR", flag: "🇦🇩" },
  { code: "MC", label: "Mónaco",          currency: "EUR", flag: "🇲🇨" },
  { code: "SM", label: "San Marino",      currency: "EUR", flag: "🇸🇲" },
  { code: "XK", label: "Kosovo",          currency: "EUR", flag: "🇽🇰" },
  { code: "VA", label: "Vaticano",        currency: "EUR", flag: "🇻🇦" },
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
  const t            = useTranslations("p2p");
  const router       = useRouter();
  const searchParams = useSearchParams();

  const [origin,       setOrigin]       = useState<"us"|"ca">("us");
  const [step,         setStep]         = useState<Step>("form");
  const [payMode,      setPayMode]      = useState<PayMode>("card");
  const [nombre,       setNombre]       = useState("");
  const [email,        setEmail]        = useState("");
  const [country,      setCountry]      = useState("MX");
  const [account,      setAccount]      = useState("");
  const [bankInfo,     setBankInfo]     = useState<BankInfo | null>(null);
  const [clabeValid,   setClabeValid]   = useState<boolean | null>(null);
  const [amountLocal,  setAmountLocal]  = useState("");
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

  // Canada relay form state
  const [caName,     setCaName]     = useState("");
  const [caCountry,  setCaCountry]  = useState("MX");
  const [caAccount,  setCaAccount]  = useState("");
  const [caAmount,   setCaAmount]   = useState("");
  const [caPhone,    setCaPhone]    = useState("");
  const [caStep,     setCaStep]     = useState<"form"|"instructions">("form");

  const selectedCountry = COUNTRY_OPTIONS.find((c) => c.code === country) ?? COUNTRY_OPTIONS[0];
  const hasBankRail     = BANK_RAIL_COUNTRIES.has(country);
  const currency        = selectedCountry.currency;

  // Pre-populate from URL query params (e.g. from Calculator or WhatsApp bot)
  useEffect(() => {
    const amt  = searchParams.get("amount");
    const cur  = searchParams.get("currency");
    const cty  = searchParams.get("country");
    if (amt && !isNaN(parseFloat(amt))) setAmountLocal(amt);
    if (cty && COUNTRY_OPTIONS.some(c => c.code === cty.toUpperCase())) {
      setCountry(cty.toUpperCase());
    }
    // currency hint: if USD source, default to bank rail for Bridge countries
    if (cur === "USD" || cur === "CAD") {
      const resolvedCountry = cty?.toUpperCase() ?? "MX";
      if (BANK_RAIL_COUNTRIES.has(resolvedCountry)) setPayMode("bank");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset pay mode when country changes to one without bank rail
  useEffect(() => {
    if (!hasBankRail && payMode === "bank") {
      setPayMode("card");
      setAccount("");
    }
    // Clear CLABE detection when country changes
    setBankInfo(null);
    setClabeValid(null);
  }, [country, hasBankRail, payMode]);

  // CLABE bank detection — fires when account changes and country is MX
  useEffect(() => {
    if (country !== "MX" || payMode !== "bank") {
      setBankInfo(null);
      setClabeValid(null);
      return;
    }
    const digits = account.replace(/\D/g, "");
    if (digits.length === 18) {
      setBankInfo(detectBank(digits));
      setClabeValid(validateClabe(digits));
    } else {
      setBankInfo(null);
      setClabeValid(null);
    }
  }, [account, country, payMode]);

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
      <div className="w-full max-w-sm mx-auto px-5 pt-6 pb-2">
        <h2 className="text-white font-bold text-lg mb-1">💸 Envío P2P</h2>
        <p className="text-slate-500 text-xs mb-5">Receptor llena sus datos — el emisor recibe el link de pago</p>

        {/* Origin tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => { setOrigin("us"); setStep("form"); }}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              origin === "us"
                ? "bg-emerald-500 text-white"
                : "bg-slate-800 text-slate-400 border border-slate-700 hover:text-white"
            }`}
          >
            {t("tab_41countries")}
          </button>
          <button
            onClick={() => { setOrigin("ca"); setCaStep("form"); }}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              origin === "ca"
                ? "bg-red-600 text-white"
                : "bg-slate-800 text-slate-400 border border-slate-700 hover:text-white"
            }`}
          >
            {t("tab_canada")}
          </button>
        </div>
      </div>

      {/* ── CANADA TAB ── */}
      {origin === "ca" && (
        <div className="space-y-4 flex-1 max-w-sm mx-auto w-full px-5">
          {caStep === "form" ? (
            <>
              <p className="text-slate-500 text-xs bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 leading-relaxed">
                {t("canada_info")}
              </p>

              {/* Nombre receptor */}
              <div>
                <label className="block text-xs text-slate-400 mb-1">{t("canada_recipient_name")}</label>
                <input type="text" value={caName} onChange={(e) => setCaName(e.target.value)}
                  placeholder="María García"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-red-500 text-sm" />
              </div>

              {/* País destino */}
              <div>
                <label className="block text-xs text-slate-400 mb-1">{t("canada_destination")}</label>
                <select value={caCountry} onChange={(e) => { setCaCountry(e.target.value); setCaAccount(""); }}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-red-500">
                  {COUNTRY_OPTIONS.map((c) => (
                    <option key={c.code} value={c.code}>{c.flag} {c.label} — {c.currency}</option>
                  ))}
                </select>
              </div>

              {/* Cuenta destino */}
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  {caCountry === "MX" ? t("clabe_label")
                    : caCountry === "BR" ? "Chave PIX"
                    : caCountry === "GB" ? "Sort Code / Account"
                    : caCountry === "CO" ? "Cuenta Bre-B"
                    : caCountry === "US" ? "Routing / Account"
                    : "IBAN"}
                </label>
                <input type="text" inputMode={caCountry === "MX" ? "numeric" : "text"}
                  value={caAccount} onChange={(e) => setCaAccount(e.target.value)}
                  placeholder={caCountry === "MX" ? "646180528000000001" : caCountry === "BR" ? "CPF, email o celular" : caCountry === "GB" ? "20-00-00 / 55779911" : "IBAN o número de cuenta"}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-red-500 text-sm font-mono" />
              </div>

              {/* Monto en CAD */}
              <div>
                <label className="block text-xs text-slate-400 mb-1">{t("canada_amount_label")}</label>
                <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3">
                  <span className="text-slate-400 text-sm">CA$</span>
                  <input type="number" inputMode="decimal" min="1" value={caAmount}
                    onChange={(e) => setCaAmount(e.target.value)} placeholder="500"
                    className="flex-1 bg-transparent text-white text-lg font-semibold outline-none" />
                  <span className="text-slate-500 text-sm">CAD</span>
                </div>
              </div>

              {/* Fee breakdown — shown as soon as amount is entered */}
              {parseFloat(caAmount) > 0 && (() => {
                const amt      = parseFloat(caAmount) || 0;
                // Wise: transferencia + FX entrada (CAD→intermedio) + FX salida (→moneda local)
                // CAD→MXN ~1.08%+CA$1.93, CAD→USD ~0.37%+CA$0.50, CAD→EUR ~0.58%+CA$0.50
                // Usamos 1.10% + CA$3 mínimo — cubre todos los corredores sin pérdida
                const wiseFeeTotal = parseFloat((Math.max(amt * 0.011, 3.00)).toFixed(2));
                const wiseFxIn     = parseFloat((wiseFeeTotal * 0.55).toFixed(2)); // FX entrada
                const wiseFxOut    = parseFloat((wiseFeeTotal - wiseFxIn).toFixed(2)); // FX salida
                const omni         = parseFloat((Math.max(amt * 0.005, 1.99)).toFixed(2));
                const flat         = 0.99;
                const total        = parseFloat((amt + wiseFeeTotal + omni + flat).toFixed(2));
                return (
                  <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4 space-y-2">
                    <p className="text-xs text-slate-400 font-semibold uppercase tracking-widest mb-2">
                      {t("fee_breakdown_title")}
                    </p>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">{t("fee_principal")}</span>
                      <span className="text-white font-semibold">CA${amt.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Wise FX entrada (CAD→intermedio ~0.60%)</span>
                      <span className="text-slate-400">+CA${wiseFxIn.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Wise FX salida (→moneda local ~0.50%)</span>
                      <span className="text-slate-400">+CA${wiseFxOut.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">{t("fee_platform")} (0.50%, mín CA$1.99)</span>
                      <span className="text-slate-400">+CA${omni.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">{t("fee_network")} (fijo)</span>
                      <span className="text-slate-400">+CA${flat.toFixed(2)}</span>
                    </div>
                    <div className="border-t border-slate-700 pt-2 flex justify-between text-sm font-bold">
                      <span className="text-white">{t("fee_total_to_send")}</span>
                      <span className="text-red-400">CA${total.toFixed(2)}</span>
                    </div>
                    <p className="text-[10px] text-slate-600 text-center">
                      Wise publica: CAD→MXN ~1.08%, CAD→USD ~0.37%, CAD→EUR ~0.58%
                    </p>
                  </div>
                );
              })()}

              {/* Teléfono receptor */}
              <div>
                <label className="block text-xs text-slate-400 mb-1">{t("canada_phone_label")}</label>
                <input type="tel" inputMode="tel" value={caPhone} onChange={(e) => setCaPhone(e.target.value)}
                  placeholder="+52 55 1234 5678"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-red-500 text-sm" />
              </div>

              <button
                disabled={!caName.trim() || !caAccount.trim() || parseFloat(caAmount) < 1}
                onClick={() => {
                  const adminNumber = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "").replace(/\D/g, "");
                  const amt   = parseFloat(caAmount) || 0;
                  const wise  = (amt * 0.008).toFixed(2);
                  const omni  = (Math.max(amt * 0.005, 1.99) + 0.99).toFixed(2);
                  const total = (amt + parseFloat(wise) + parseFloat(omni)).toFixed(2);
                  const msg = `🇨🇦 NUEVO P2P CANADÁ\n\nReceptor: ${caName}\nDestino: ${caCountry}\nCuenta: ${caAccount}\nPrincipal: CA$${caAmount}\nWise fee: CA$${wise}\nOmniPay: CA$${omni}\nEmisor paga: CA$${total}${caPhone ? `\nTel: ${caPhone}` : ""}\n\nProcesar vía Wise → Bridge/Wise al destino`;
                  if (adminNumber) window.open(`https://wa.me/${adminNumber}?text=${encodeURIComponent(msg)}`, "_blank");
                  setCaStep("instructions");
                }}
                className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl py-3 transition-colors"
              >
                {t("canada_submit")}
              </button>
            </>
          ) : (
            <div className="space-y-4">
              <div className="text-center">
                <div className="text-4xl mb-2">✅</div>
                <h3 className="text-white font-bold text-lg">{t("canada_created_title")}</h3>
                <p className="text-slate-400 text-xs mt-1">{t("canada_created_sub")}</p>
              </div>

              <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-5 space-y-3">
                <p className="text-slate-400 text-xs font-semibold uppercase tracking-widest">{t("canada_instructions_label")}</p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">{t("canada_send_to")}</span>
                    <span className="text-white font-semibold">{t("canada_wise_name")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">{t("canada_amount_row")}</span>
                    <span className="text-white font-semibold">
                      CA${(parseFloat(caAmount||"0") * 1.013 + 0.99).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">{t("canada_reference")}</span>
                    <span className="text-emerald-400 font-mono font-semibold">OP-{Date.now().toString(36).toUpperCase()}</span>
                  </div>
                </div>
                <div className="border-t border-slate-700 pt-3">
                  <p className="text-slate-500 text-xs">{t("canada_wise_note")}</p>
                </div>
              </div>

              <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-xl px-4 py-3">
                <p className="text-emerald-400 text-xs">
                  ✅ {t("canada_recipient_name")}: <span className="font-semibold">{caName}</span><br/>
                  {COUNTRY_OPTIONS.find(c=>c.code===caCountry)?.flag} {COUNTRY_OPTIONS.find(c=>c.code===caCountry)?.label} · <span className="font-mono">{caAccount}</span>
                </p>
                <p className="text-slate-500 text-xs mt-2">{t("canada_processing_note")}</p>
              </div>

              <button onClick={() => { setCaStep("form"); setCaName(""); setCaAccount(""); setCaAmount(""); setCaPhone(""); setCaCountry("MX"); }}
                className="w-full border border-slate-600 text-slate-400 hover:text-white rounded-xl py-3 text-sm transition-colors">
                {t("canada_new_request")}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── USA TAB ── */}
      {origin === "us" && (
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
                : SEPA_COUNTRIES.has(country) ? `IBAN · Recibirás EUR (SEPA)`
                : country === "BR" ? "Chave PIX"
                : country === "GB" ? "Sort Code / Account (00-00-00 / 12345678)"
                : country === "CO" ? "Número de cuenta Bre-B"
                : "Número de cuenta"}
            </label>
            <input
              type="text"
              inputMode={country === "MX" ? "numeric" : "text"}
              value={account}
              onChange={(e) => setAccount(country === "MX" ? e.target.value.replace(/\D/g, "").slice(0, 18) : e.target.value)}
              placeholder={
                country === "MX" ? t("clabe_placeholder")
                : SEPA_COUNTRIES.has(country) ? "DE89 3704 0044 0532 0130 00"
                : country === "BR" ? "CPF, email, celular o llave aleatoria"
                : country === "GB" ? "20-00-00 / 55779911"
                : country === "CO" ? "Número de cuenta"
                : ""
              }
              className={`w-full bg-slate-800 border rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none text-sm font-mono transition-colors ${
                country === "MX" && account.length > 0
                  ? clabeValid === false ? "border-red-500"
                  : clabeValid === true  ? "border-emerald-500"
                  : "border-slate-700"
                : "border-slate-700 focus:border-emerald-500"
              }`}
            />
            {/* CLABE bank detection */}
            {country === "MX" && bankInfo && (
              <div className="flex items-center gap-2 mt-2">
                <span
                  className="inline-block px-2 py-0.5 rounded text-xs font-semibold text-white"
                  style={{ backgroundColor: bankInfo.color }}
                >
                  {bankInfo.shortName}
                </span>
                <span className="text-slate-400 text-xs">{bankInfo.name}</span>
                {clabeValid === true && <span className="text-emerald-400 text-xs">✓ CLABE válida</span>}
                {clabeValid === false && <span className="text-red-400 text-xs">✗ Dígito de control inválido</span>}
              </div>
            )}
            {country === "MX" && account.length > 0 && account.length !== 18 && (
              <p className="text-xs text-red-400 mt-1">{t("error_invalid_clabe")}</p>
            )}
            {SEPA_COUNTRIES.has(country) && (
              <p className="text-xs text-slate-500 mt-1">
                ℹ️ El pago se acredita en Euros (EUR) independientemente de la moneda local
              </p>
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
      )}
    </main>
  );
}

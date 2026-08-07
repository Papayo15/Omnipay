"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, Copy, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { getFXRate } from "@/lib/fx";
import { validateClabe, detectBank, type BankInfo } from "@/lib/clabe";
import { TrustBanner } from "@/components/TrustBanner";

type Step = "form" | "generating" | "kyc_info" | "kyc_polling" | "share" | "error";

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

// Destination country list — only Bridge-native rails (41 countries) + CA (Wise relay)
// Labels are resolved via t(`country_${code}`) inside the component
const COUNTRY_OPTIONS = [
  // Americas
  { code: "MX", currency: "MXN", flag: "🇲🇽" },
  { code: "US", currency: "USD", flag: "🇺🇸" },
  { code: "BR", currency: "BRL", flag: "🇧🇷" },
  { code: "CO", currency: "COP", flag: "🇨🇴" },
  { code: "CA", currency: "CAD", flag: "🇨🇦" },
  // UK + Europe (Bridge native — SEPA + FPS)
  { code: "GB", currency: "GBP", flag: "🇬🇧" },
  { code: "DE", currency: "EUR", flag: "🇩🇪" },
  { code: "FR", currency: "EUR", flag: "🇫🇷" },
  { code: "ES", currency: "EUR", flag: "🇪🇸" },
  { code: "IT", currency: "EUR", flag: "🇮🇹" },
  { code: "NL", currency: "EUR", flag: "🇳🇱" },
  { code: "PT", currency: "EUR", flag: "🇵🇹" },
  { code: "BE", currency: "EUR", flag: "🇧🇪" },
  { code: "AT", currency: "EUR", flag: "🇦🇹" },
  { code: "IE", currency: "EUR", flag: "🇮🇪" },
  { code: "FI", currency: "EUR", flag: "🇫🇮" },
  { code: "GR", currency: "EUR", flag: "🇬🇷" },
  { code: "CY", currency: "EUR", flag: "🇨🇾" },
  { code: "EE", currency: "EUR", flag: "🇪🇪" },
  { code: "LV", currency: "EUR", flag: "🇱🇻" },
  { code: "LT", currency: "EUR", flag: "🇱🇹" },
  { code: "LU", currency: "EUR", flag: "🇱🇺" },
  { code: "MT", currency: "EUR", flag: "🇲🇹" },
  { code: "SK", currency: "EUR", flag: "🇸🇰" },
  { code: "SI", currency: "EUR", flag: "🇸🇮" },
  { code: "HR", currency: "EUR", flag: "🇭🇷" },
  { code: "SE", currency: "EUR", flag: "🇸🇪" },
  { code: "DK", currency: "EUR", flag: "🇩🇰" },
  { code: "NO", currency: "EUR", flag: "🇳🇴" },
  { code: "PL", currency: "EUR", flag: "🇵🇱" },
  { code: "CZ", currency: "EUR", flag: "🇨🇿" },
  { code: "HU", currency: "EUR", flag: "🇭🇺" },
  { code: "RO", currency: "EUR", flag: "🇷🇴" },
  { code: "BG", currency: "EUR", flag: "🇧🇬" },
  { code: "CH", currency: "EUR", flag: "🇨🇭" },
  { code: "IS", currency: "EUR", flag: "🇮🇸" },
  { code: "LI", currency: "EUR", flag: "🇱🇮" },
  { code: "AD", currency: "EUR", flag: "🇦🇩" },
  { code: "MC", currency: "EUR", flag: "🇲🇨" },
  { code: "SM", currency: "EUR", flag: "🇸🇲" },
  { code: "XK", currency: "EUR", flag: "🇽🇰" },
  { code: "VA", currency: "EUR", flag: "🇻🇦" },
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

// Bridge FX fees by corridor (confirmed Bridge email julio 2026)
const BRIDGE_FX_RATES: Record<string, number> = {
  MXN: 0.005, EUR: 0.005, BRL: 0.0055, GBP: 0.005, COP: 0.005, USD: 0,
};

// Local Bridge fee calculation — no API call needed during form filling
function calcBridgeFees(amtLocal: number, localCurrency: string, fxRate: number) {
  const usd     = amtLocal * fxRate;
  const onramp  = parseFloat((usd * 0.005).toFixed(2));
  const offramp = parseFloat((usd * 0.0025).toFixed(2));
  const fxPct   = BRIDGE_FX_RATES[localCurrency] ?? 0.005;
  const fxFee   = parseFloat((usd * fxPct).toFixed(2));
  const omniSvc = parseFloat(Math.max(usd * 0.005, 0.99).toFixed(2));
  const omniFlat = 0.49;
  const kyc      = 0;  // KYC absorbido por OmniPay — siempre $0 para el usuario
  const total    = parseFloat((usd + onramp + offramp + fxFee + omniSvc + omniFlat + kyc).toFixed(2));
  return { usd: parseFloat(usd.toFixed(2)), onramp, offramp, fxFee, fxPct, omniSvc, omniFlat, kyc, total };
}


export default function P2PPage() {
  const t      = useTranslations("p2p");
  const router = useRouter();

  const [step,            setStep]            = useState<Step>("form");
  const [nombre,          setNombre]          = useState("");
  const [email,           setEmail]           = useState("");
  const [country,         setCountry]         = useState("MX");
  const [account,         setAccount]         = useState("");
  const [bic,             setBic]             = useState("");
  const [cpf,             setCpf]             = useState("");
  const [bankInfo,        setBankInfo]        = useState<BankInfo | null>(null);
  const [clabeValid,      setClabeValid]      = useState<boolean | null>(null);
  const [amountLocal,     setAmountLocal]     = useState("");
  const [recipientPhone,  setRecipientPhone]  = useState("");
  const [shareLink,       setShareLink]       = useState("");
  const [copied,          setCopied]          = useState(false);
  const [errorMsg,        setErrorMsg]        = useState("");
  const [submitting,      setSubmitting]      = useState(false);
  const [fxRate,          setFxRate]          = useState<number | null>(null);
  const [kycUrl,          setKycUrl]          = useState<string | null>(null);
  const [realSenderTotal, setRealSenderTotal] = useState<string | null>(null);
  const [pendingKycRetry, setPendingKycRetry] = useState(false);
  const [kycStillPending, setKycStillPending] = useState(false);
  const [savedKycForm,    setSavedKycForm]    = useState(false);
  // Ref always fresh in callbacks — tracks whether current generateLink call is a KYC retry
  const kycAutoRetryRef = useRef(false);

  const selectedCountry = COUNTRY_OPTIONS.find((c) => c.code === country) ?? COUNTRY_OPTIONS[0];
  const currency        = selectedCountry.currency;

  const rail = BANK_RAIL_COUNTRIES.has(country) ? "bridge" : "unavailable";

  // Pre-populate from URL query params — also detects post-KYC return
  useEffect(() => {
    const p       = new URLSearchParams(window.location.search);
    const amt     = p.get("amount");
    const cty     = p.get("country");
    const kycDone = p.get("kyc_done") === "1";
    if (amt && !isNaN(parseFloat(amt))) setAmountLocal(amt);
    if (cty && COUNTRY_OPTIONS.some(c => c.code === cty.toUpperCase())) {
      setCountry(cty.toUpperCase());
    }
    try {
      const saved = sessionStorage.getItem("omnipay_p2p_form");
      if (saved) {
        const form = JSON.parse(saved) as Record<string, string>;
        if (kycDone) {
          // Auto-retry: Bridge redirected back with ?kyc_done=1
          if (form.nombre)         setNombre(form.nombre);
          if (form.email)          setEmail(form.email);
          if (form.country)        setCountry(form.country);
          if (form.account)        setAccount(form.account);
          if (form.bic)            setBic(form.bic);
          if (form.cpf)            setCpf(form.cpf);
          if (form.amountLocal)    setAmountLocal(form.amountLocal);
          if (form.recipientPhone) setRecipientPhone(form.recipientPhone);
          setStep("kyc_polling");
          setPendingKycRetry(true);
        } else {
          // User returned manually — show banner so they can continue
          setSavedKycForm(true);
        }
      }
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clear account when country changes
  useEffect(() => {
    setAccount("");
    setCpf("");
    setBic("");
    setBankInfo(null);
    setClabeValid(null);
  }, [country]);

  // CLABE bank detection
  useEffect(() => {
    if (country !== "MX") {
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
  }, [account, country]);

  useEffect(() => {
    if (rail !== "bridge") return;
    getFXRate(currency, "USD").then(r => { if (r) setFxRate(r); }).catch(() => {});
  }, [currency, country, rail]);

  // Auto-retry after returning from KYC — waits for React to apply all setState calls
  useEffect(() => {
    if (!pendingKycRetry) return;
    if (!nombre || !email || !account || !amountLocal) return;
    setPendingKycRetry(false);
    kycAutoRetryRef.current = true;
    generateLink();
  // generateLink is stable (useCallback) — safe to include
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingKycRetry, nombre, email, account, amountLocal]);

  // Bridge link generation — gets real fees from Bridge at submit time
  const generateLink = useCallback(async () => {
    const amt = parseFloat(amountLocal);
    if (!nombre.trim() || !email.includes("@") || !account.trim() || !amt) return;

    // Format validation
    if (SEPA_COUNTRIES.has(country)) {
      const ibanClean = account.replace(/\s+/g, "").toUpperCase();
      if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(ibanClean)) {
        setErrorMsg(t("error_invalid_iban")); setStep("error"); return;
      }
      if (!bic.trim()) {
        setErrorMsg(t("bic_required")); setStep("error"); return;
      }
    }
    if (country === "GB") {
      const p = account.split("/");
      const sc = (p[0] ?? "").replace(/\D/g, "");
      const an = (p[1] ?? "").replace(/\D/g, "");
      if (sc.length !== 6 || an.length !== 8) {
        setErrorMsg(t("error_invalid_sort_code")); setStep("error"); return;
      }
    }
    if (country === "US") {
      const p = account.split("/");
      const rn = (p[0] ?? "").replace(/\D/g, "");
      if (rn.length !== 9) {
        setErrorMsg(t("error_invalid_routing")); setStep("error"); return;
      }
    }
    if (country === "BR" && !cpf.trim()) {
      setErrorMsg(t("cpf_label") + " es requerido para Brasil"); setStep("error"); return;
    }

    // Convert local amount to USD to enforce $20 minimum
    // fxRate = getFXRate(currency, "USD") → local→USD (e.g. 0.057 for MXN)
    const rateNow = fxRate ?? 1;
    const amtUSD  = currency === "USD" ? amt : amt * rateNow;
    if (amtUSD < 20) {
      setErrorMsg("El monto mínimo de envío es $20 USD.");
      setStep("error");
      return;
    }

    // If FX rate not yet loaded, fetch it now before proceeding
    let rate = fxRate;
    if (!rate) {
      rate = await getFXRate(currency, "USD").catch(() => null);
      if (rate) setFxRate(rate);
      if (!rate) { setErrorMsg("No se pudo obtener el tipo de cambio. Intenta de nuevo."); setStep("error"); return; }
    }

    setSubmitting(true);
    setStep("generating");
    try {
      // 1. Get real Bridge quote (fees confirmed at this moment)
      try {
        const qRes = await fetch("/api/bridge/quote", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount: amt * rate, email: email.toLowerCase(), type: "p2p", country }),
        });
        if (qRes.ok) {
          const q = await qRes.json() as BridgeQuote;
          setRealSenderTotal(q.total_sender_pays.toFixed(2));
        }
      } catch { /* estimado local ya visible, continuar */ }

      // 2. Generate payment link
      const body: Record<string, unknown> = {
        nombre:          nombre.trim(),
        email:           email.toLowerCase().trim(),
        country,
        receive_method:  "bank",
        amount_target:   amt,
        recipient_phone: recipientPhone || undefined,
      };
      if (country === "MX")                 body.clabe          = account;
      else if (SEPA_COUNTRIES.has(country)) {
        body.iban = account;
        if (bic.trim()) body.bic = bic.trim().toUpperCase();
      }
      else if (country === "BR") {
        body.pix_key         = account;
        body.document_number = cpf.replace(/\D/g, "");
      }
      else if (country === "GB") {
        const p = account.split("/");
        body.sort_code = p[0]?.trim(); body.account_number = p[1]?.trim();
      } else if (country === "US") {
        const p = account.split("/");
        body.routing_number = p[0]?.trim(); body.account_number = p[1]?.trim();
      } else {
        body.account_number = account;
      }
      // Card support kept in code for future activation
      // body.card_number = ...

      const res  = await fetch("/api/bridge/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json() as CheckoutResponse & { error?: string; message?: string };
      if (res.status !== 202 && (!res.ok || data.error)) throw new Error(data.error ?? "Error");
      if (data.needs_kyc || res.status === 202) {
        if (data.kyc_url) setKycUrl(data.kyc_url);
        if (kycAutoRetryRef.current) {
          // Auto-retry after KYC still returns needs_kyc — KYC processing async on Bridge's side
          kycAutoRetryRef.current = false;
          setKycStillPending(true);
          setStep("kyc_polling");
        } else {
          // First time needs_kyc — save form + show pre-KYC explanation
          try {
            sessionStorage.setItem("omnipay_p2p_form", JSON.stringify({
              nombre, email, country, account, bic, cpf, amountLocal, recipientPhone,
            }));
          } catch { /* ignore */ }
          setStep("kyc_info");
        }
      } else {
        kycAutoRetryRef.current = false;
        setShareLink(data.pay_link);
        setKycStillPending(false);
        setSavedKycForm(false);
        try { sessionStorage.removeItem("omnipay_p2p_form"); } catch { /* ignore */ }
        setStep("share");
      }
    } catch (err) {
      setErrorMsg((err as Error).message);
      setStep("error");
    } finally {
      setSubmitting(false);
    }
  }, [nombre, email, country, account, bic, cpf, amountLocal, recipientPhone, fxRate, t]);

  const handleKycReturn = useCallback(() => {
    try {
      const saved = sessionStorage.getItem("omnipay_p2p_form");
      if (!saved) return;
      const form = JSON.parse(saved) as Record<string, string>;
      if (form.nombre)         setNombre(form.nombre);
      if (form.email)          setEmail(form.email);
      if (form.country)        setCountry(form.country);
      if (form.account)        setAccount(form.account);
      if (form.bic)            setBic(form.bic);
      if (form.cpf)            setCpf(form.cpf);
      if (form.amountLocal)    setAmountLocal(form.amountLocal);
      if (form.recipientPhone) setRecipientPhone(form.recipientPhone);
      setSavedKycForm(false);
      setPendingKycRetry(true);
    } catch { /* ignore */ }
  }, []);

  const copyLink = useCallback(async () => {
    await navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [shareLink]);

  const openWhatsApp = useCallback(() => {
    const msg = t("share_message_cobrar", { name: nombre, amount: parseFloat(amountLocal).toLocaleString(), currency, sender_amount: realSenderTotal ?? "?", link: shareLink });
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  }, [nombre, amountLocal, currency, shareLink, realSenderTotal, t]);

  const openTelegram = useCallback(() => {
    const msg = t("share_message_cobrar", { name: nombre, amount: parseFloat(amountLocal).toLocaleString(), currency, sender_amount: realSenderTotal ?? "?", link: shareLink });
    window.open(`https://t.me/share/url?url=${encodeURIComponent(shareLink)}&text=${encodeURIComponent(msg)}`, "_blank");
  }, [nombre, amountLocal, currency, shareLink, realSenderTotal, t]);

  const accountValid = account.trim().length >= 5;
  const amtUSDLocal  = fxRate && parseFloat(amountLocal) >= 1
    ? (currency === "USD" ? parseFloat(amountLocal) : parseFloat(amountLocal) * fxRate)
    : 0;
  const bicRequired  = SEPA_COUNTRIES.has(country) && !bic.trim();
  const cpfRequired  = country === "BR" && !cpf.trim();
  const bridgeReady  = !!nombre.trim() && email.includes("@") && accountValid && amtUSDLocal >= 20 && rail === "bridge" && !bicRequired && !cpfRequired;

  // ── KYC Info — pre-verification explanation ──────────────────────────────────
  if (step === "kyc_info") {
    return (
      <main className="min-h-screen bg-[#0f172a] flex flex-col items-center px-5 pt-10 pb-16 max-w-sm mx-auto w-full">
        <div className="w-full mb-8">
          <button onClick={() => setStep("form")} className="flex items-center gap-1 text-slate-400 hover:text-white text-sm transition-colors">
            <ArrowLeft className="w-4 h-4" /> {t("kyc_intro_back")}
          </button>
        </div>
        <div className="w-full flex flex-col gap-5">
          <h2 className="text-white font-bold text-xl">{t("kyc_intro_title")}</h2>
          <p className="text-slate-400 text-sm leading-relaxed">{t("kyc_intro_why")}</p>
          <ul className="space-y-3">
            {(["li1","li2","li3","li4"] as const).map((k) => (
              <li key={k} className="flex items-start gap-3">
                <span className="text-emerald-400 mt-0.5 flex-shrink-0">✓</span>
                <span className="text-slate-300 text-sm">{t(`kyc_intro_${k}`)}</span>
              </li>
            ))}
          </ul>
          {kycUrl ? (
            <button
              onClick={() => { window.location.href = kycUrl; }}
              className="w-full bg-emerald-500 hover:bg-emerald-400 active:scale-95 transition-all text-white font-bold py-4 rounded-2xl text-sm mt-2"
            >
              {t("kyc_intro_cta")}
            </button>
          ) : (
            <p className="text-slate-500 text-sm text-center">Cargando link de verificación…</p>
          )}
          <div className="mt-4">
            <TrustBanner variant="checkout" />
          </div>
        </div>
      </main>
    );
  }

  // ── KYC Polling — after returning from Bridge verification ───────────────────
  if (step === "kyc_polling") {
    return (
      <main className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center px-5 gap-5 max-w-sm mx-auto w-full">
        {!kycStillPending ? (
          <>
            <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <div className="text-center space-y-2">
              <p className="text-white font-semibold text-base">{t("kyc_polling_title")}</p>
              <p className="text-slate-400 text-sm">{t("kyc_polling_body")}</p>
            </div>
          </>
        ) : (
          <>
            <div className="text-4xl">⏳</div>
            <div className="text-center space-y-2">
              <p className="text-white font-semibold text-base">{t("kyc_polling_title")}</p>
              <p className="text-slate-400 text-sm leading-relaxed">{t("kyc_polling_wait")}</p>
            </div>
            <button
              onClick={() => { setPendingKycRetry(false); setKycStillPending(false); generateLink(); }}
              className="mt-2 text-emerald-400 text-sm underline"
            >
              Intentar de nuevo
            </button>
          </>
        )}
        <p className="text-slate-600 text-xs text-center max-w-xs">{t("kyc_polling_wait")}</p>
      </main>
    );
  }

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

  // ── Share (Bridge) ───────────────────────────────────────────────────────────
  if (step === "share") {
    const senderAmt = realSenderTotal;
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
          {shareLink && (
            <div className="w-full bg-slate-800/60 border border-slate-700 rounded-2xl p-4 text-center">
              <p className="text-slate-400 text-xs mb-1">{nombre}</p>
              <p className="text-white font-bold text-2xl">{parseFloat(amountLocal).toLocaleString()} {currency}</p>
              {senderAmt && <p className="text-slate-500 text-xs mt-2">{t("sender_ref_usd", { amount: senderAmt })}</p>}
              <p className="text-slate-600 text-xs mt-1">Bridge · Sin base de datos</p>
            </div>
          )}
          {shareLink && <div className="w-full space-y-3">
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
          </div>}
          <button onClick={() => { setStep("form"); setNombre(""); setEmail(""); setAccount(""); setAmountLocal(""); setRecipientPhone(""); setRealSenderTotal(null); setKycUrl(null); setKycStillPending(false); }}
            className="text-slate-500 hover:text-slate-300 text-xs transition-colors">
            + {t("new_transfer")}
          </button>
        </div>
      </main>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────────
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
          ← OmniPay
        </button>
      </div>

      {/* Header */}
      <div className="w-full max-w-sm mx-auto px-5 pt-5 pb-2">
        <h1 className="text-white font-bold text-lg mb-1">🌍 {t("page_title")}</h1>
        <p className="text-slate-500 text-xs mb-4">{t("page_sub")}</p>
      </div>

      {/* Form */}
      <div id="p2p-form" className="space-y-4 flex-1 max-w-sm mx-auto w-full px-5">

        {/* Banner post-KYC manual return */}
        {savedKycForm && (
          <div className="bg-emerald-900/30 border border-emerald-500/40 rounded-2xl p-4 flex items-center justify-between gap-3">
            <p className="text-emerald-300 text-sm leading-snug">¿Ya completaste tu verificación de identidad?</p>
            <button
              onClick={handleKycReturn}
              className="flex-shrink-0 bg-emerald-500 hover:bg-emerald-400 active:scale-95 transition-all text-white font-semibold text-sm px-4 py-2 rounded-xl"
            >
              Continuar →
            </button>
          </div>
        )}

        {/* Nombre receptor */}
        <div>
          <label className="block text-xs text-slate-400 mb-1">{t("label_recipient")}</label>
          <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)}
            placeholder={t("name_placeholder")}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-sm" />
        </div>

        {/* Email */}
        <div>
          <label className="block text-xs text-slate-400 mb-1">{t("email_label")}</label>
          <input type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@email.com"
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-sm" />
        </div>

        {/* País destino */}
        <div>
          <label className="block text-xs text-slate-400 mb-1">{t("country_label")}</label>
          <select value={country} onChange={(e) => setCountry(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-emerald-500">
            {COUNTRY_OPTIONS.map((c) => (
              <option key={c.code} value={c.code}>{c.flag} {t(`country_${c.code}`)} — {c.currency}</option>
            ))}
          </select>
        </div>

        {/* Bridge: país no soportado por Bridge (solo si no es Canada relay) */}
        {rail === "unavailable" && (
          <div className="bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-4">
            <p className="text-slate-400 text-sm font-medium mb-1">🚧 {t("unsupported_note")}</p>
            <p className="text-slate-600 text-xs leading-relaxed">
              Estamos expandiendo corredores. Por ahora cubrimos 41 países vía Bridge.
            </p>
          </div>
        )}

        {/* ══ BRIDGE FORM (USD) ══════════════════════════════════════════════ */}
        {rail === "bridge" && (
          <>
            {/* Cuenta bancaria */}
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                {country === "MX" ? t("clabe_label")
                  : SEPA_COUNTRIES.has(country) ? t("iban_label")
                  : country === "BR" ? t("pix_label")
                  : country === "GB" ? `${t("uk_label")} (00-00-00 / 12345678)`
                  : country === "US" ? `${t("us_label")} (021000021 / 12345678)`
                  : country === "CO" ? t("co_label")
                  : t("account_label")}
              </label>
              <input type="text" inputMode={country === "MX" ? "numeric" : "text"}
                value={account}
                onChange={(e) => setAccount(country === "MX" ? e.target.value.replace(/\D/g, "").slice(0, 18) : e.target.value)}
                placeholder={
                  country === "MX" ? t("clabe_placeholder")
                  : SEPA_COUNTRIES.has(country) ? "DE89 3704 0044 0532 0130 00"
                  : country === "BR" ? t("pix_placeholder")
                  : country === "GB" ? "20-00-00 / 55779911"
                  : country === "US" ? "021000021 / 12345678"
                  : country === "CO" ? t("co_label") : ""}
                className={`w-full bg-slate-800 border rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none text-sm font-mono transition-colors ${
                  country === "MX" && account.length > 0
                    ? clabeValid === false ? "border-red-500" : clabeValid === true ? "border-emerald-500" : "border-slate-700"
                    : "border-slate-700 focus:border-emerald-500"
                }`}
              />
              {country === "MX" && bankInfo && (
                <div className="flex items-center gap-2 mt-2">
                  <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold text-white" style={{ backgroundColor: bankInfo.color }}>
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
                <p className="text-xs text-slate-500 mt-1">ℹ️ {t("sepa_eur_note")}</p>
              )}
            </div>

            {/* BIC/SWIFT — required for SEPA */}
            {SEPA_COUNTRIES.has(country) && (
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  {t("bic_label")} <span className="text-red-400">*</span>{" "}
                  <span className="text-slate-600">({t("bic_sublabel")})</span>
                </label>
                <input
                  type="text"
                  value={bic}
                  onChange={(e) => setBic(e.target.value.replace(/\s+/g, "").toUpperCase())}
                  placeholder="DEUTDEDBXXX"
                  maxLength={11}
                  className={`w-full bg-slate-800 border rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none text-sm font-mono transition-colors ${
                    bic.trim() ? "border-emerald-500" : "border-amber-500/60 focus:border-emerald-500"
                  }`}
                />
                <p className="text-xs text-slate-600 mt-1">{t("bic_hint")}</p>
              </div>
            )}

            {/* CPF / CNPJ — required for Brazil (PIX) */}
            {country === "BR" && (
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  {t("cpf_label")} <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={cpf}
                  onChange={(e) => setCpf(e.target.value)}
                  placeholder={t("cpf_placeholder")}
                  maxLength={18}
                  className={`w-full bg-slate-800 border rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none text-sm font-mono transition-colors ${
                    cpf.trim() ? "border-emerald-500" : "border-amber-500/60 focus:border-emerald-500"
                  }`}
                />
                <p className="text-xs text-slate-600 mt-1">ℹ️ {t("cpf_hint")}</p>
              </div>
            )}

            {/* Monto a recibir */}
            <div>
              <label className="block text-xs text-slate-400 mb-1">{t("amount_receive_label")} ({currency})</label>
              <input type="number" inputMode="numeric" value={amountLocal} onChange={(e) => setAmountLocal(e.target.value)}
                placeholder={currency === "MXN" ? "5000" : currency === "USD" ? "300" : "500"} min="1"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-sm" />
            </div>

            {/* Fee breakdown — cálculo local, sin API call, instantáneo */}
            {fxRate && parseFloat(amountLocal) >= 1 && (() => {
              const f = calcBridgeFees(parseFloat(amountLocal), currency, fxRate);
              const amtUSD = currency === "USD" ? parseFloat(amountLocal) : parseFloat(amountLocal) * fxRate;
              const belowMin = amtUSD < 20;
              if (belowMin) {
                const minLocal = currency === "USD" ? 20
                  : currency === "MXN" ? 380 : currency === "BRL" ? 110
                  : currency === "EUR" ? 19 : currency === "GBP" ? 16
                  : currency === "COP" ? 85_000 : Math.ceil(20 / fxRate);
                return (
                  <div className="bg-red-900/20 border border-red-500/40 rounded-2xl p-4 text-center">
                    <p className="text-red-400 text-sm font-semibold">{t("min_amount_title", { min: minLocal.toLocaleString(), currency })}</p>
                    <p className="text-slate-500 text-xs mt-1">{t("min_amount_body")}</p>
                  </div>
                );
              }
              return (
                <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4 space-y-2">
                  <p className="text-xs text-slate-400 font-semibold uppercase tracking-widest mb-2">{t("fee_breakdown_title")}</p>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">{t("fee_recipient_gets")}</span>
                    <span className="text-white font-semibold">{parseFloat(amountLocal).toLocaleString()} {currency}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">{t("fee_usd_equiv")}</span>
                    <span className="text-slate-400">${f.usd.toFixed(2)} USD</span>
                  </div>
                  <div className="border-t border-slate-800 pt-1 mt-1" />
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">{t("fee_bridge_onramp")}</span>
                    <span className="text-blue-400">+${f.onramp.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">{t("fee_bridge_offramp")}</span>
                    <span className="text-blue-400">+${f.offramp.toFixed(2)}</span>
                  </div>
                  {f.fxFee > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">{t("fee_bridge_fx", { currency, pct: (f.fxPct * 100).toFixed(2) })}</span>
                      <span className="text-blue-400">+${f.fxFee.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">{t("fee_omnipay_service")}</span>
                    <span className="text-emerald-400">+${f.omniSvc.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">{t("fee_omnipay_flat")}</span>
                    <span className="text-emerald-400">+${f.omniFlat.toFixed(2)}</span>
                  </div>
                  <div className="border-t border-slate-700 pt-2 flex justify-between text-sm font-bold">
                    <span className="text-white">{t("fee_total_sender")}</span>
                    <span className="text-emerald-400">${f.total.toFixed(2)} USD</span>
                  </div>
                  <p className="text-[10px] text-slate-600 text-center mt-1">
                    {t("fee_fx_rate", { currency, rate: fxRate.toFixed(4) })}
                  </p>
                </div>
              );
            })()}

            {/* Teléfono (opcional) */}
            <div>
              <label className="block text-xs text-slate-400 mb-1">{t("label_recipient_phone")}</label>
              <input type="tel" inputMode="tel" value={recipientPhone} onChange={(e) => setRecipientPhone(e.target.value)}
                placeholder="+52 55 1234 5678"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-sm" />
            </div>

            <button onClick={generateLink} disabled={submitting || !bridgeReady}
              className="w-full bg-emerald-500 hover:bg-emerald-400 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-white py-4 rounded-2xl font-semibold text-lg mt-2">
              {submitting ? `${t("generate_button")}…` : t("pricing_card1_cta")}
            </button>
            <div className="mt-3">
              <TrustBanner variant="checkout" />
            </div>
          </>
        )}

        <p className="text-center text-xs text-slate-700 pb-6">
          {t("zero_data_note")}
        </p>

      </div>
    </main>
  );
}

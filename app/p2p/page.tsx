"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, Copy, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { getFXRate } from "@/lib/fx";
import { validateClabe, detectBank, type BankInfo } from "@/lib/clabe";

type Step    = "form" | "generating" | "share" | "error";
type SrcCur  = "USD" | "CAD";

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

// Destination country list — Bridge-native first, then common unsupported
const COUNTRY_OPTIONS = [
  // Americas (Bridge native)
  { code: "MX", label: "México",          currency: "MXN", flag: "🇲🇽" },
  { code: "US", label: "EE.UU.",          currency: "USD", flag: "🇺🇸" },
  { code: "BR", label: "Brasil",          currency: "BRL", flag: "🇧🇷" },
  { code: "CO", label: "Colombia",        currency: "COP", flag: "🇨🇴" },
  // Americas (próximamente)
  { code: "CA", label: "Canadá",          currency: "CAD", flag: "🇨🇦" },
  { code: "AR", label: "Argentina",       currency: "ARS", flag: "🇦🇷" },
  { code: "CL", label: "Chile",           currency: "CLP", flag: "🇨🇱" },
  { code: "PE", label: "Perú",            currency: "PEN", flag: "🇵🇪" },
  { code: "EC", label: "Ecuador",         currency: "USD", flag: "🇪🇨" },
  { code: "DO", label: "Rep. Dominicana", currency: "DOP", flag: "🇩🇴" },
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
  // Asia / África / Otros (próximamente)
  { code: "IN", label: "India",           currency: "INR", flag: "🇮🇳" },
  { code: "PH", label: "Filipinas",       currency: "PHP", flag: "🇵🇭" },
  { code: "NG", label: "Nigeria",         currency: "NGN", flag: "🇳🇬" },
  { code: "KE", label: "Kenia",           currency: "KES", flag: "🇰🇪" },
  { code: "MA", label: "Marruecos",       currency: "MAD", flag: "🇲🇦" },
  { code: "PK", label: "Pakistán",        currency: "PKR", flag: "🇵🇰" },
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
function calcBridgeFees(amtLocal: number, localCurrency: string, fxRate: number, isNew: boolean) {
  const usd     = amtLocal * fxRate;
  const onramp  = parseFloat((usd * 0.005).toFixed(2));
  const offramp = parseFloat((usd * 0.0025).toFixed(2));
  const fxPct   = BRIDGE_FX_RATES[localCurrency] ?? 0.005;
  const fxFee   = parseFloat((usd * fxPct).toFixed(2));
  const omniSvc = parseFloat(Math.max(usd * 0.005, 1.99).toFixed(2));
  const omniFlat = 0.99;
  const kyc      = isNew ? 2.00 : 0;
  const total    = parseFloat((usd + onramp + offramp + fxFee + omniSvc + omniFlat + kyc).toFixed(2));
  return { usd: parseFloat(usd.toFixed(2)), onramp, offramp, fxFee, fxPct, omniSvc, omniFlat, kyc, total };
}

// Wise fee helpers (Canada relay)
// Wise CAD→MXN ~1.08%+CA$1.93, CAD→USD ~0.37%+CA$0.50, CAD→EUR ~0.58%+CA$0.50
// Usamos 1.10% + CA$3 mínimo como estimado conservador para todos los corredores
function calcWiseFees(cadAmount: number) {
  const wiseFeeTotal = parseFloat(Math.max(cadAmount * 0.011, 3.00).toFixed(2));
  const wiseFxIn     = parseFloat((wiseFeeTotal * 0.55).toFixed(2)); // FX entrada CAD→intermedio (~0.60%)
  const wiseFxOut    = parseFloat((wiseFeeTotal - wiseFxIn).toFixed(2)); // FX salida intermedio→local (~0.50%)
  const omniSvc      = parseFloat(Math.max(cadAmount * 0.005, 1.99).toFixed(2));
  const omniFlat     = 0.99;
  const total        = parseFloat((cadAmount + wiseFeeTotal + omniSvc + omniFlat).toFixed(2));
  return { wiseFeeTotal, wiseFxIn, wiseFxOut, omniSvc, omniFlat, total };
}

export default function P2PPage() {
  const t      = useTranslations("p2p");
  const router = useRouter();

  // Source currency determines rail: USD → Bridge, CAD → Wise Canada relay
  const [srcCurrency,    setSrcCurrency]    = useState<SrcCur>("USD");
  const [step,           setStep]           = useState<Step>("form");
  const [nombre,         setNombre]         = useState("");
  const [email,          setEmail]          = useState("");
  const [country,        setCountry]        = useState("MX");
  const [account,        setAccount]        = useState("");
  const [bankInfo,       setBankInfo]       = useState<BankInfo | null>(null);
  const [clabeValid,     setClabeValid]     = useState<boolean | null>(null);
  const [amountLocal,    setAmountLocal]    = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [shareLink,      setShareLink]      = useState("");
  const [copied,         setCopied]         = useState(false);
  const [errorMsg,       setErrorMsg]       = useState("");
  const [submitting,       setSubmitting]       = useState(false);
  const [isNew,            setIsNew]            = useState(true);
  const [fxRate,           setFxRate]           = useState<number | null>(null);
  const [kycUrl,           setKycUrl]           = useState<string | null>(null);
  const [realSenderTotal,  setRealSenderTotal]  = useState<string | null>(null);
  // Canada relay: tracks whether instruction screen is shown after submit
  const [caSubmitted,    setCaSubmitted]    = useState(false);
  const [caRef,          setCaRef]          = useState("");

  const selectedCountry = COUNTRY_OPTIONS.find((c) => c.code === country) ?? COUNTRY_OPTIONS[0];
  const currency        = selectedCountry.currency;

  // Rail auto-detection: CAD always → Wise Canada; USD → Bridge if country supported, else unavailable
  const rail = srcCurrency === "CAD" ? "wise-canada"
             : BANK_RAIL_COUNTRIES.has(country) ? "bridge"
             : "unavailable";

  // Pre-populate from URL query params (uses window to avoid useSearchParams reload)
  useEffect(() => {
    const p   = new URLSearchParams(window.location.search);
    const amt = p.get("amount");
    const cur = p.get("currency");
    const cty = p.get("country");
    if (amt && !isNaN(parseFloat(amt))) setAmountLocal(amt);
    if (cty && COUNTRY_OPTIONS.some(c => c.code === cty.toUpperCase())) {
      setCountry(cty.toUpperCase());
    }
    if (cur === "CAD") setSrcCurrency("CAD");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clear account when country or srcCurrency changes
  useEffect(() => {
    setAccount("");
    setBankInfo(null);
    setClabeValid(null);
    setCaSubmitted(false);
  }, [country, srcCurrency]);

  // CLABE bank detection
  useEffect(() => {
    if (country !== "MX" || srcCurrency !== "USD") {
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
  }, [account, country, srcCurrency]);

  // Fetch FX rate when country/currency changes — lightweight, no Bridge API call
  useEffect(() => {
    if (rail !== "bridge") return;
    getFXRate(currency, "USD").then(r => { if (r) setFxRate(r); }).catch(() => {});
  }, [currency, country, rail]);

  // Bridge link generation — gets real fees from Bridge at submit time
  const generateLink = useCallback(async () => {
    const amt = parseFloat(amountLocal);
    if (!nombre.trim() || !email.includes("@") || !account.trim() || !amt) return;

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
      else if (SEPA_COUNTRIES.has(country)) body.iban           = account;
      else if (country === "BR")            body.pix_key        = account;
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
        setStep("share"); // share step shows KYC banner when kycUrl is set and pay_link is empty
      } else {
        setShareLink(data.pay_link);
        if (data.kyc_url) setKycUrl(data.kyc_url);
        setStep("share");
      }
    } catch (err) {
      setErrorMsg((err as Error).message);
      setStep("error");
    } finally {
      setSubmitting(false);
    }
  }, [nombre, email, country, account, amountLocal, recipientPhone, fxRate]);

  // Canada relay submit — sends WhatsApp to admin and shows instructions
  const submitCanada = useCallback(() => {
    const amt   = parseFloat(amountLocal) || 0;
    const { wiseFxIn, wiseFxOut, omniSvc, omniFlat, total } = calcWiseFees(amt);
    const adminNumber = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "").replace(/\D/g, "");
    const ref   = `OP-${Date.now().toString(36).toUpperCase()}`;
    setCaRef(ref);

    const destLabel = COUNTRY_OPTIONS.find(c => c.code === country)?.label ?? country;
    const msg = `🇨🇦 NUEVO P2P CANADÁ\n\nReceptor: ${nombre}\nDestino: ${destLabel} (${country})\nCuenta: ${account}\nPrincipal: CA$${amt.toFixed(2)}\nWise FX entrada: CA$${wiseFxIn.toFixed(2)}\nWise FX salida: CA$${wiseFxOut.toFixed(2)}\nOmniPay servicio: CA$${omniSvc.toFixed(2)}\nOmniPay flat: CA$${omniFlat.toFixed(2)}\nEmisor paga: CA$${total.toFixed(2)}${recipientPhone ? `\nTel receptor: ${recipientPhone}` : ""}\nRef: ${ref}\n\nProcesar vía Wise relay`;
    if (adminNumber) window.open(`https://wa.me/${adminNumber}?text=${encodeURIComponent(msg)}`, "_blank");
    setCaSubmitted(true);
  }, [nombre, country, account, amountLocal, recipientPhone]);

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
  const bridgeReady  = !!nombre.trim() && email.includes("@") && accountValid && parseFloat(amountLocal) >= 1 && rail === "bridge";
  const canadaReady  = !!nombre.trim() && accountValid && parseFloat(amountLocal) >= 1;

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
          {kycUrl && (
            <div className="w-full bg-amber-900/30 border border-amber-500/40 rounded-2xl p-4 text-left">
              <p className="text-amber-400 text-xs font-semibold mb-1">⚠️ {t("kyc_pending_title")}</p>
              <p className="text-slate-400 text-xs mb-2">{t("kyc_pending_body")}</p>
              <a href={kycUrl} target="_blank" rel="noopener noreferrer"
                className="inline-block mt-1 w-full bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold py-2 px-4 rounded-lg text-center transition-colors">
                {t("kyc_complete_link")} →
              </a>
              <p className="text-slate-500 text-[10px] mt-2">Después de completar la verificación, vuelve aquí y genera el link de pago de nuevo.</p>
            </div>
          )}
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
          <button onClick={() => { setStep("form"); setNombre(""); setEmail(""); setAccount(""); setAmountLocal(""); setRecipientPhone(""); setRealSenderTotal(null); setKycUrl(null); }}
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

        {/* ── Moneda de envío — determina el riel automáticamente ── */}
        <div>
          <label className="block text-xs text-slate-400 mb-2">¿En qué moneda envías?</label>
          <div className="flex gap-2">
            <button
              onClick={() => setSrcCurrency("USD")}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                srcCurrency === "USD"
                  ? "bg-emerald-500 text-white"
                  : "bg-slate-800 text-slate-400 border border-slate-700 hover:text-white"
              }`}
            >
              🇺🇸 USD · Bridge
            </button>
            <button
              onClick={() => setSrcCurrency("CAD")}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                srcCurrency === "CAD"
                  ? "bg-red-600 text-white"
                  : "bg-slate-800 text-slate-400 border border-slate-700 hover:text-white"
              }`}
            >
              🇨🇦 CAD · Wise
            </button>
          </div>
          <p className="text-slate-600 text-[10px] mt-1.5 text-center">
            {srcCurrency === "USD" ? "Riel: Bridge — entrega en minutos" : "Riel: Wise Canada relay — 1-2 días hábiles"}
          </p>
        </div>

        {/* Nombre receptor */}
        <div>
          <label className="block text-xs text-slate-400 mb-1">{t("label_recipient")}</label>
          <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)}
            placeholder={t("name_placeholder")}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-sm" />
        </div>

        {/* Email (solo Bridge) */}
        {srcCurrency === "USD" && (
          <div>
            <label className="block text-xs text-slate-400 mb-1">{t("email_label")}</label>
            <input type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-sm" />
          </div>
        )}

        {/* País destino */}
        <div>
          <label className="block text-xs text-slate-400 mb-1">{t("country_label")}</label>
          <select value={country} onChange={(e) => setCountry(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-emerald-500">
            {COUNTRY_OPTIONS.map((c) => (
              <option key={c.code} value={c.code}>{c.flag} {c.label} — {c.currency}</option>
            ))}
          </select>
        </div>

        {/* USD: país no soportado por Bridge */}
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
                  : SEPA_COUNTRIES.has(country) ? "IBAN · Recibirás EUR (SEPA)"
                  : country === "BR" ? "Chave PIX"
                  : country === "GB" ? "Sort Code / Account (00-00-00 / 12345678)"
                  : country === "US" ? "Routing / Account (123456789 / 12345678)"
                  : country === "CO" ? "Número de cuenta Bre-B"
                  : "Número de cuenta"}
              </label>
              <input type="text" inputMode={country === "MX" ? "numeric" : "text"}
                value={account}
                onChange={(e) => setAccount(country === "MX" ? e.target.value.replace(/\D/g, "").slice(0, 18) : e.target.value)}
                placeholder={
                  country === "MX" ? t("clabe_placeholder")
                  : SEPA_COUNTRIES.has(country) ? "DE89 3704 0044 0532 0130 00"
                  : country === "BR" ? "CPF, email, celular o llave aleatoria"
                  : country === "GB" ? "20-00-00 / 55779911"
                  : country === "US" ? "021000021 / 123456789"
                  : country === "CO" ? "Número de cuenta" : ""}
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
                <p className="text-xs text-slate-500 mt-1">ℹ️ El pago se acredita en Euros (EUR) independientemente de la moneda local</p>
              )}
            </div>

            {/* Monto a recibir */}
            <div>
              <label className="block text-xs text-slate-400 mb-1">{t("amount_receive_label")} ({currency})</label>
              <input type="number" inputMode="numeric" value={amountLocal} onChange={(e) => setAmountLocal(e.target.value)}
                placeholder={currency === "MXN" ? "5000" : currency === "USD" ? "300" : "500"} min="1"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-sm" />
            </div>

            {/* Primera vez toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={isNew} onChange={e => setIsNew(e.target.checked)}
                className="w-4 h-4 accent-emerald-500" />
              <span className="text-slate-400 text-xs">Primera transacción (incluye verificación KYC $2)</span>
            </label>

            {/* Fee breakdown — cálculo local, sin API call, instantáneo */}
            {fxRate && parseFloat(amountLocal) >= 1 && (() => {
              const f = calcBridgeFees(parseFloat(amountLocal), currency, fxRate, isNew);
              return (
                <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4 space-y-2">
                  <p className="text-xs text-slate-400 font-semibold uppercase tracking-widest mb-2">Desglose de tarifas</p>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Receptor recibe</span>
                    <span className="text-white font-semibold">{parseFloat(amountLocal).toLocaleString()} {currency}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">≈ equivalente USD</span>
                    <span className="text-slate-400">${f.usd.toFixed(2)} USD</span>
                  </div>
                  <div className="border-t border-slate-800 pt-1 mt-1" />
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Bridge on-ramp (USD→USDC · 0.50%)</span>
                    <span className="text-blue-400">+${f.onramp.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Bridge off-ramp (USDC→local · 0.25%)</span>
                    <span className="text-blue-400">+${f.offramp.toFixed(2)}</span>
                  </div>
                  {f.fxFee > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Bridge FX (→{currency} · {(f.fxPct * 100).toFixed(2)}%)</span>
                      <span className="text-blue-400">+${f.fxFee.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">OmniPay servicio (0.50%)</span>
                    <span className="text-emerald-400">+${f.omniSvc.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">OmniPay flat</span>
                    <span className="text-emerald-400">+${f.omniFlat.toFixed(2)}</span>
                  </div>
                  {f.kyc > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-amber-500">KYC verificación (única vez)</span>
                      <span className="text-amber-400">+${f.kyc.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="border-t border-slate-700 pt-2 flex justify-between text-sm font-bold">
                    <span className="text-white">Emisor paga en total</span>
                    <span className="text-emerald-400">${f.total.toFixed(2)} USD</span>
                  </div>
                  <p className="text-[10px] text-slate-600 text-center mt-1">
                    1 {currency} = {fxRate.toFixed(4)} USD · Tipo de cambio live
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
          </>
        )}

        {/* ══ WISE CANADA FORM (CAD) ════════════════════════════════════════ */}
        {rail === "wise-canada" && !caSubmitted && (
          <>
            <p className="text-slate-500 text-xs bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 leading-relaxed">
              {t("canada_info")}
            </p>

            {/* Cuenta destino */}
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                {country === "MX" ? t("clabe_label")
                  : country === "BR" ? "Chave PIX"
                  : country === "GB" ? "Sort Code / Account (00-00-00 / 12345678)"
                  : country === "CO" ? "Cuenta Bre-B"
                  : country === "US" ? "Routing / Account"
                  : SEPA_COUNTRIES.has(country) ? "IBAN (SEPA)"
                  : "IBAN o número de cuenta"}
              </label>
              <input type="text" inputMode={country === "MX" ? "numeric" : "text"}
                value={account} onChange={(e) => setAccount(e.target.value)}
                placeholder={country === "MX" ? "646180528000000001" : country === "BR" ? "CPF, email o celular" : country === "GB" ? "20-00-00 / 55779911" : "IBAN o número de cuenta"}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-red-500 text-sm font-mono" />
            </div>

            {/* Monto en CAD */}
            <div>
              <label className="block text-xs text-slate-400 mb-1">{t("canada_amount_label")}</label>
              <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3">
                <span className="text-slate-400 text-sm">CA$</span>
                <input type="number" inputMode="decimal" min="1" value={amountLocal}
                  onChange={(e) => setAmountLocal(e.target.value)} placeholder="500"
                  className="flex-1 bg-transparent text-white text-lg font-semibold outline-none" />
                <span className="text-slate-500 text-sm">CAD</span>
              </div>
            </div>

            {/* Wise fee breakdown — 2 FX splits */}
            {parseFloat(amountLocal) > 0 && (() => {
              const { wiseFxIn, wiseFxOut, omniSvc, omniFlat, total } = calcWiseFees(parseFloat(amountLocal));
              return (
                <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4 space-y-2">
                  <p className="text-xs text-slate-400 font-semibold uppercase tracking-widest mb-2">{t("fee_breakdown_title")}</p>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">{t("fee_principal")}</span>
                    <span className="text-white font-semibold">CA${parseFloat(amountLocal).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Wise FX entrada (CAD→intermedio ~0.60%)</span>
                    <span className="text-green-400">+CA${wiseFxIn.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Wise FX salida (→moneda local ~0.50%)</span>
                    <span className="text-green-400">+CA${wiseFxOut.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">OmniPay servicio (0.50%, mín CA$1.99)</span>
                    <span className="text-emerald-400">+CA${omniSvc.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">OmniPay flat (fijo)</span>
                    <span className="text-emerald-400">+CA${omniFlat.toFixed(2)}</span>
                  </div>
                  <div className="border-t border-slate-700 pt-2 flex justify-between text-sm font-bold">
                    <span className="text-white">{t("fee_total_to_send")}</span>
                    <span className="text-red-400">CA${total.toFixed(2)}</span>
                  </div>
                  <p className="text-[10px] text-slate-600 text-center">
                    Wise publica: CAD→MXN ~1.08% · CAD→USD ~0.37% · CAD→EUR ~0.58%
                  </p>
                </div>
              );
            })()}

            {/* Teléfono receptor */}
            <div>
              <label className="block text-xs text-slate-400 mb-1">{t("canada_phone_label")}</label>
              <input type="tel" inputMode="tel" value={recipientPhone} onChange={(e) => setRecipientPhone(e.target.value)}
                placeholder="+52 55 1234 5678"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-red-500 text-sm" />
            </div>

            <button onClick={submitCanada} disabled={!canadaReady}
              className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl py-3 transition-colors">
              {t("canada_submit")}
            </button>
          </>
        )}

        {/* Canada: instrucciones post-envío */}
        {rail === "wise-canada" && caSubmitted && (() => {
          const amt = parseFloat(amountLocal) || 0;
          const { wiseFxIn, wiseFxOut, omniSvc, omniFlat, total } = calcWiseFees(amt);
          return (
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
                    <span className="text-white font-semibold">CA${total.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Wise FX entrada</span>
                    <span className="text-slate-400">+CA${wiseFxIn.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Wise FX salida</span>
                    <span className="text-slate-400">+CA${wiseFxOut.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">OmniPay</span>
                    <span className="text-slate-400">+CA${(omniSvc + omniFlat).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">{t("canada_reference")}</span>
                    <span className="text-emerald-400 font-mono font-semibold">{caRef}</span>
                  </div>
                </div>
                <div className="border-t border-slate-700 pt-3">
                  <p className="text-slate-500 text-xs">{t("canada_wise_note")}</p>
                </div>
              </div>
              <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-xl px-4 py-3">
                <p className="text-emerald-400 text-xs">
                  ✅ {t("canada_recipient_name")}: <span className="font-semibold">{nombre}</span><br/>
                  {COUNTRY_OPTIONS.find(c => c.code === country)?.flag} {COUNTRY_OPTIONS.find(c => c.code === country)?.label} · <span className="font-mono">{account}</span>
                </p>
                <p className="text-slate-500 text-xs mt-2">{t("canada_processing_note")}</p>
              </div>
              <button onClick={() => { setCaSubmitted(false); setNombre(""); setAccount(""); setAmountLocal(""); setRecipientPhone(""); setCaRef(""); }}
                className="w-full border border-slate-600 text-slate-400 hover:text-white rounded-xl py-3 text-sm transition-colors">
                {t("canada_new_request")}
              </button>
            </div>
          );
        })()}

        <p className="text-center text-xs text-slate-700 pb-6">
          {t("zero_data_note")}
        </p>

      </div>
    </main>
  );
}

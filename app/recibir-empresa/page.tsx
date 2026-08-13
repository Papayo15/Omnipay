"use client";

import { useState, useCallback, useEffect, Suspense } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { Zap, ArrowLeft, Building2, CheckCircle2, AlertCircle, Clock, ExternalLink } from "lucide-react";
import { SEPA_COUNTRIES } from "@/lib/wise-accounts";

const BRIDGE_COUNTRIES = [
  { code: "MX", flag: "🇲🇽", rail: "SPEI" },
  { code: "US", flag: "🇺🇸", rail: "ACH" },
  { code: "GB", flag: "🇬🇧", rail: "FPS" },
  { code: "CO", flag: "🇨🇴", rail: "COP" },
  { code: "DE", flag: "🇩🇪", rail: "SEPA" },
  { code: "FR", flag: "🇫🇷", rail: "SEPA" },
  { code: "ES", flag: "🇪🇸", rail: "SEPA" },
  { code: "IT", flag: "🇮🇹", rail: "SEPA" },
  { code: "NL", flag: "🇳🇱", rail: "SEPA" },
  { code: "PT", flag: "🇵🇹", rail: "SEPA" },
  { code: "BE", flag: "🇧🇪", rail: "SEPA" },
  { code: "AT", flag: "🇦🇹", rail: "SEPA" },
  { code: "IE", flag: "🇮🇪", rail: "SEPA" },
  { code: "CH", flag: "🇨🇭", rail: "SEPA" },
  { code: "SE", flag: "🇸🇪", rail: "SEPA" },
];

type Step = "form" | "submitting" | "kyb" | "kyb_polling" | "ready" | "error";

type KybStatus = "pending" | "in_progress" | "approved" | "rejected";

function StatusBadge({ status, t }: { status: KybStatus; t: ReturnType<typeof useTranslations> }) {
  const configs = {
    pending:     { bg: "bg-amber-900/20",  border: "border-amber-500/30",  text: "text-amber-300",  label: t("status_pending"),     icon: <Clock className="w-3.5 h-3.5" /> },
    in_progress: { bg: "bg-blue-900/20",   border: "border-blue-500/30",   text: "text-blue-300",   label: t("status_in_progress"), icon: <Clock className="w-3.5 h-3.5 animate-spin" /> },
    approved:    { bg: "bg-emerald-900/20",border: "border-emerald-500/30",text: "text-emerald-300",label: t("status_approved"),    icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
    rejected:    { bg: "bg-red-900/20",    border: "border-red-500/30",    text: "text-red-300",    label: t("status_rejected"),    icon: <AlertCircle className="w-3.5 h-3.5" /> },
  };
  const c = configs[status];
  return (
    <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border ${c.bg} ${c.border} ${c.text} text-xs font-semibold`}>
      {c.icon} {c.label}
    </div>
  );
}

function RecibirEmpresaContent() {
  const t  = useTranslations("recibir_empresa");
  const tF = useTranslations("p2p");
  const router = useRouter();
  const searchParams = useSearchParams();

  const [step, setStep] = useState<Step>("form");
  const [error, setError] = useState("");
  const [kybUrl, setKybUrl] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [payLink, setPayLink] = useState("");
  const [kybStatus, setKybStatus] = useState<KybStatus>("pending");
  const [pollCount, setPollCount] = useState(0);
  const [waLink, setWaLink] = useState("");

  // Form
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState("MX");
  const [accountField, setAccountField] = useState("");
  const [bicField, setBicField] = useState("");
  const [amount, setAmount] = useState("");

  const isSepa = SEPA_COUNTRIES.has(country);

  const accountLabel = country === "MX" ? tF("clabe_label")
    : isSepa        ? tF("iban_label")
    : country === "GB" ? tF("uk_label")
    : country === "CO" ? tF("co_label")
    : tF("account_label");

  const accountHint = isSepa ? tF("hint_sepa")
    : country === "GB" ? tF("hint_uk")
    : country === "US" ? tF("hint_us")
    : null;
  const currency = country === "MX" ? "MXN" : country === "GB" ? "GBP"
    : country === "CO" ? "COP" : country === "US" ? "USD" : "EUR";

  // Minimum equivalent to $50 USD per currency (approximate, API enforces exact)
  const minLocalAmount: Record<string, number> = {
    USD: 50, MXN: 900, EUR: 47, GBP: 40, COP: 210000, BRL: 280,
  };
  const minLocal = minLocalAmount[currency] ?? 50;

  // Detect return from KYB
  useEffect(() => {
    const kybDone = searchParams.get("kyb_done") === "1";
    const cid = searchParams.get("customer_id");
    if (kybDone && cid) {
      setCustomerId(cid);
      setStep("kyb_polling");
    }
  }, [searchParams]);

  // Poll KYB status every 6s (max 10 polls)
  useEffect(() => {
    if (step !== "kyb_polling" || !customerId) return;
    if (pollCount >= 10) {
      setKybStatus("in_progress");
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/bridge/customer/status?email=${encodeURIComponent(email || searchParams.get("email") || "")}`);
        const data = await res.json() as { status: string };
        if (data.status === "active") {
          setKybStatus("approved");
          // Re-submit to get pay link
          await retryCheckout();
        } else if (data.status === "under_review") {
          setKybStatus("in_progress");
          setPollCount(c => c + 1);
        } else {
          setPollCount(c => c + 1);
        }
      } catch { setPollCount(c => c + 1); }
    }, 6000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, pollCount, customerId, email, searchParams]);

  const retryCheckout = useCallback(async () => {
    try {
      const res = await fetch("/api/bridge/b2b/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_name:  businessName.trim(),
          email:          email.trim().toLowerCase(),
          country,
          receive_method: "bank",
          ...(country === "MX" ? { clabe: accountField.trim() } : {}),
          ...(isSepa ? { iban: accountField.trim(), bic: bicField.trim() } : {}),
          amount_target: parseFloat(amount),
        }),
      });
      const data = await res.json() as { pay_link?: string; error?: string; needs_kyb?: boolean };
      if (data.pay_link) {
        setPayLink(data.pay_link);
        const waText = encodeURIComponent(
          `Hola, soy ${businessName}. Te comparto el link para que nos puedas pagar vía OmniPay Wire: ${data.pay_link}`
        );
        setWaLink(`https://wa.me/?text=${waText}`);
        setStep("ready");
      }
    } catch { /* silent — user can retry manually */ }
  }, [businessName, email, country, accountField, bicField, isSepa, amount]);

  const handleSubmit = useCallback(async () => {
    setStep("submitting");
    setError("");
    try {
      const res = await fetch("/api/bridge/b2b/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_name:  businessName.trim(),
          email:          email.trim().toLowerCase(),
          country,
          receive_method: "bank",
          ...(country === "MX" ? { clabe: accountField.trim() } : {}),
          ...(country === "GB" ? { sort_code: accountField.split("/")[0]?.trim(), account_number: accountField.split("/")[1]?.trim() } : {}),
          ...(isSepa ? { iban: accountField.trim(), bic: bicField.trim() } : {}),
          ...(country === "US" ? { routing_number: accountField.split("/")[0]?.trim(), account_number: accountField.split("/")[1]?.trim() } : {}),
          amount_target: parseFloat(amount),
        }),
      });
      const data = await res.json() as {
        pay_link?: string; needs_kyb?: boolean; kyb_url?: string;
        customer_id?: string; error?: string;
      };

      if (data.needs_kyb) {
        setKybUrl(data.kyb_url ?? "");
        setCustomerId(data.customer_id ?? "");
        setKybStatus("pending");
        setStep("kyb");
        return;
      }
      if (!res.ok || data.error) throw new Error(data.error ?? "Error generando link");

      setPayLink(data.pay_link!);
      const waText = encodeURIComponent(
        `Hola, soy ${businessName}. Te comparto el link para que nos puedas pagar vía OmniPay Wire: ${data.pay_link}`
      );
      setWaLink(`https://wa.me/?text=${waText}`);
      setStep("ready");
    } catch (e) {
      setError((e as Error).message);
      setStep("error");
    }
  }, [businessName, email, country, accountField, bicField, isSepa, amount]);

  const isValid = businessName && email && accountField && amount && parseFloat(amount) >= minLocal;

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
          <span className="ml-auto text-[10px] text-slate-500 uppercase tracking-widest">Wire · Bridge</span>
        </div>

        {/* FORM */}
        {step === "form" && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-white mb-1">{t("title")}</h1>
              <p className="text-slate-400 text-sm">{t("subtitle")}</p>
            </div>

            <div className="space-y-3">
              <p className="text-slate-400 text-xs uppercase tracking-widest">{t("section_your_company")}</p>
              <input type="text" placeholder={t("your_business")} value={businessName} onChange={e => setBusinessName(e.target.value)}
                className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-[#00C9C8]/60" />
              <input type="email" placeholder={t("your_email")} value={email} onChange={e => setEmail(e.target.value)}
                className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-[#00C9C8]/60" />

              <select value={country} onChange={e => { setCountry(e.target.value); setAccountField(""); setBicField(""); }}
                className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#00C9C8]/60">
                {BRIDGE_COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.flag} {tF(`country_${c.code}`)} ({c.rail})</option>)}
              </select>

              <input type="text" placeholder={accountLabel} value={accountField} onChange={e => setAccountField(e.target.value)}
                className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-[#00C9C8]/60 font-mono" />
              {isSepa && (
                <input type="text" placeholder={tF("bic_label")} value={bicField} onChange={e => setBicField(e.target.value)}
                  className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-[#00C9C8]/60 font-mono" />
              )}
              {accountHint && <p className="text-slate-500 text-[10px] px-1">{accountHint}</p>}
            </div>

            <div className="space-y-2">
              <p className="text-slate-400 text-xs uppercase tracking-widest">{t("section_amount")}</p>
              <div className="relative">
                <input type="number" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)}
                  className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 pr-16 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-emerald-500/60" />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-mono">{currency}</span>
              </div>
              <p className="text-slate-500 text-[10px] px-1">
                {t("amount_hint")} · Mínimo {minLocal.toLocaleString()} {currency} (~$50 USD)
              </p>
            </div>

            <button onClick={handleSubmit} disabled={!isValid}
              className="w-full bg-[#00C9C8] hover:bg-[#00b8b7] disabled:bg-slate-700 disabled:text-slate-500 text-[#0f172a] font-bold py-4 rounded-2xl transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2">
              <Building2 className="w-4 h-4" />
              {t("cta")}
            </button>
          </div>
        )}

        {/* SUBMITTING */}
        {step === "submitting" && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
            <Zap className="w-8 h-8 text-[#00C9C8] animate-pulse" />
            <p className="text-white font-semibold">{t("creating")}</p>
          </div>
        )}

        {/* KYB REQUIRED */}
        {step === "kyb" && (
          <div className="space-y-6">
            <div className="flex items-start gap-3">
              <StatusBadge status={kybStatus} t={t} />
            </div>

            <div className="bg-amber-900/20 border border-amber-500/30 rounded-2xl p-5 space-y-3">
              <p className="text-amber-300 font-semibold text-sm">🏢 {t("kyb_title")}</p>
              <p className="text-slate-300 text-sm leading-relaxed">{t("kyb_body")}</p>
              <ul className="space-y-1.5">
                {[t("kyb_li1"), t("kyb_li2"), t("kyb_li3")].map((li, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-slate-400">
                    <span className="text-amber-400 mt-0.5">→</span> {li}
                  </li>
                ))}
              </ul>
            </div>

            {kybUrl && (
              <a href={kybUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full bg-amber-600 hover:bg-amber-500 text-white font-bold py-4 rounded-2xl transition-all">
                <ExternalLink className="w-4 h-4" />
                {t("kyb_cta")}
              </a>
            )}

            <p className="text-slate-500 text-xs text-center leading-relaxed">{t("kyb_after")}</p>
            <button onClick={() => setStep("form")} className="w-full text-slate-500 text-sm hover:text-slate-300 transition-colors py-2">
              ← {t("back")}
            </button>
          </div>
        )}

        {/* KYB POLLING */}
        {step === "kyb_polling" && (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <StatusBadge status={kybStatus} t={t} />
            </div>
            <div className="flex flex-col items-center gap-4 py-8">
              <Clock className="w-10 h-10 text-[#00C9C8] animate-spin" style={{ animationDuration: "3s" }} />
              <p className="text-white font-semibold text-center">{t("polling_title")}</p>
              <p className="text-slate-400 text-sm text-center">{t("polling_body")}</p>
            </div>
            <p className="text-slate-500 text-xs text-center leading-relaxed">{t("polling_wait")}</p>
          </div>
        )}

        {/* READY — link de cobro generado */}
        {step === "ready" && (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <StatusBadge status="approved" t={t} />
            </div>

            <div>
              <h1 className="text-xl font-bold text-white mb-1">{t("ready_title")}</h1>
              <p className="text-slate-400 text-sm">{t("ready_body")}</p>
            </div>

            {waLink && (
              <a href={waLink} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-3 w-full bg-[#25D366] hover:bg-[#20ba58] text-white font-bold py-4 rounded-2xl transition-all duration-200 active:scale-[0.98]">
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                {t("share_whatsapp")}
              </a>
            )}

            {payLink && (
              <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-4">
                <p className="text-slate-500 text-[10px] uppercase tracking-wide mb-2">{t("pay_link_label")}</p>
                <p className="text-white text-xs font-mono break-all">{payLink}</p>
              </div>
            )}

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

export default function RecibirEmpresaPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <Zap className="w-8 h-8 text-[#00C9C8] animate-pulse" />
      </main>
    }>
      <RecibirEmpresaContent />
    </Suspense>
  );
}

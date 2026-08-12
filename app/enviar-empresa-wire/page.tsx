"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Zap, ArrowLeft, Building2, Copy, Check, AlertCircle, Clock, CheckCircle2, RefreshCw } from "lucide-react";
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

type Step = "form" | "submitting" | "kyb" | "wire" | "tracking" | "done" | "error";

interface VirtualAccount {
  routing_number?: string;
  account_number?: string;
  iban?:           string;
  bank_name?:      string;
  swift_bic?:      string;
  beneficiary?:    string;
  reference?:      string;
  currency?:       string;
}

interface TrackStatus {
  state:   string;
  updated: string;
}

export default function EnviarEmpresaWirePage() {
  const t  = useTranslations("enviar_empresa_wire");
  const tF = useTranslations("p2p");
  const router = useRouter();

  const [step, setStep] = useState<Step>("form");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [kybUrl, setKybUrl] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [orderId, setOrderId] = useState("");
  const [va, setVa] = useState<VirtualAccount>({});
  const [amountTarget, setAmountTarget] = useState(0);
  const [track, setTrack] = useState<TrackStatus | null>(null);

  // Form
  const [senderBusinessName, setSenderBusinessName] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [recipientBusinessName, setRecipientBusinessName] = useState("");
  const [recipientCountry, setRecipientCountry] = useState("MX");
  const [accountField, setAccountField] = useState("");
  const [bicField, setBicField] = useState("");
  const [amount, setAmount] = useState("");

  const isSepa = SEPA_COUNTRIES.has(recipientCountry);

  const accountLabel = recipientCountry === "MX" ? tF("clabe_label")
    : isSepa              ? tF("iban_label")
    : recipientCountry === "GB" ? tF("uk_label")
    : recipientCountry === "CO" ? tF("co_label")
    : tF("account_label");

  const accountHint = isSepa ? tF("hint_sepa")
    : recipientCountry === "GB" ? tF("hint_uk")
    : recipientCountry === "US" ? tF("hint_us")
    : null;
  const currency = recipientCountry === "MX" ? "MXN" : recipientCountry === "GB" ? "GBP"
    : recipientCountry === "CO" ? "COP" : recipientCountry === "US" ? "USD" : "EUR";

  const handleSubmit = useCallback(async () => {
    setStep("submitting");
    setError("");
    try {
      // 1. Create B2B checkout (recipient business gets liq address)
      const checkoutRes = await fetch("/api/bridge/b2b/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_name:  recipientBusinessName.trim(),
          email:          senderEmail.trim().toLowerCase(),
          country:        recipientCountry,
          receive_method: "bank",
          ...(recipientCountry === "MX"  ? { clabe:          accountField.trim() } : {}),
          ...(recipientCountry === "GB"  ? { sort_code:      accountField.split("/")[0]?.trim(), account_number: accountField.split("/")[1]?.trim() } : {}),
          ...(isSepa                     ? { iban:           accountField.trim(), bic: bicField.trim() } : {}),
          ...(recipientCountry === "US"  ? { routing_number: accountField.split("/")[0]?.trim(), account_number: accountField.split("/")[1]?.trim() } : {}),
          ...(recipientCountry === "CO"  ? { account_number: accountField.trim() } : {}),
          amount_target: parseFloat(amount),
        }),
      });
      const checkoutData = await checkoutRes.json() as {
        needs_kyb?: boolean; kyb_url?: string; customer_id?: string;
        pay_link?: string; token?: string; error?: string;
      };

      if (checkoutData.needs_kyb) {
        setKybUrl(checkoutData.kyb_url ?? "");
        setCustomerId(checkoutData.customer_id ?? "");
        setStep("kyb");
        return;
      }
      if (!checkoutRes.ok || checkoutData.error) throw new Error(checkoutData.error ?? "Error creando checkout");

      // 2. Now create Virtual Account for the sender (emission side)
      if (!checkoutData.token) throw new Error("No payment token");
      await createVA(checkoutData.token);
    } catch (e) {
      setError((e as Error).message);
      setStep("error");
    }
  }, [recipientBusinessName, senderEmail, recipientCountry, accountField, bicField, isSepa, amount]);

  const createVA = useCallback(async (token: string) => {
    const payRes = await fetch("/api/bridge/b2b/pay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        business_name:   senderBusinessName.trim(),
        email:           senderEmail.trim().toLowerCase(),
        source_currency: "USD",
      }),
    });
    const payData = await payRes.json() as {
      virtual_account?: VirtualAccount; order_id?: string;
      needs_kyb?: boolean; kyb_url?: string; customer_id?: string;
      error?: string;
    };

    if (payData.needs_kyb) {
      setKybUrl(payData.kyb_url ?? "");
      setCustomerId(payData.customer_id ?? "");
      setStep("kyb");
      return;
    }
    if (!payRes.ok || payData.error) throw new Error(payData.error ?? "Error creando cuenta virtual");

    setVa(payData.virtual_account ?? {});
    setOrderId(payData.order_id ?? "");
    setAmountTarget(parseFloat(amount));
    setStep("wire");
  }, [senderBusinessName, senderEmail, amount]);

  const pollStatus = useCallback(async () => {
    if (!orderId) return;
    try {
      const res = await fetch(`/api/bridge/track?order_id=${encodeURIComponent(orderId)}`);
      const data = await res.json() as { state?: string; updated_at?: string };
      setTrack({ state: data.state ?? "pending", updated: data.updated_at ?? new Date().toISOString() });
      if (data.state === "completed") setStep("done");
    } catch { /* best-effort */ }
  }, [orderId]);

  const copy = useCallback((value: string, key: string) => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  }, []);

  const isValid = senderBusinessName && senderEmail && recipientBusinessName && accountField && amount && parseFloat(amount) >= 100;

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

            {/* Sender */}
            <div className="space-y-3">
              <p className="text-slate-400 text-xs uppercase tracking-widest">{t("section_sender")}</p>
              <input type="text" placeholder={t("sender_business")} value={senderBusinessName} onChange={e => setSenderBusinessName(e.target.value)}
                className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-emerald-500/60" />
              <input type="email" placeholder={t("sender_email")} value={senderEmail} onChange={e => setSenderEmail(e.target.value)}
                className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-emerald-500/60" />
            </div>

            {/* Recipient */}
            <div className="space-y-3">
              <p className="text-slate-400 text-xs uppercase tracking-widest">{t("section_recipient")}</p>
              <input type="text" placeholder={t("recipient_business")} value={recipientBusinessName} onChange={e => setRecipientBusinessName(e.target.value)}
                className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-[#00C9C8]/60" />

              <select value={recipientCountry} onChange={e => { setRecipientCountry(e.target.value); setAccountField(""); setBicField(""); }}
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

            {/* Amount */}
            <div className="space-y-2">
              <p className="text-slate-400 text-xs uppercase tracking-widest">{t("section_amount")}</p>
              <div className="relative">
                <input type="number" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)}
                  className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 pr-16 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-emerald-500/60" />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-mono">{currency}</span>
              </div>
              <p className="text-slate-500 text-[10px] px-1">{t("amount_hint")}</p>
            </div>

            <button onClick={handleSubmit} disabled={!isValid}
              className="w-full bg-[#00C9C8] hover:bg-[#00b8b7] disabled:bg-slate-700 disabled:text-slate-500 text-[#0f172a] font-bold py-4 rounded-2xl transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2">
              <Building2 className="w-4 h-4" />
              {t("cta")}
            </button>

            <p className="text-slate-500 text-xs text-center">{t("delivery_note")}</p>
          </div>
        )}

        {/* SUBMITTING */}
        {step === "submitting" && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
            <Zap className="w-10 h-10 text-[#00C9C8] animate-pulse" />
            <p className="text-white font-semibold">{t("creating_account")}</p>
            <p className="text-slate-400 text-sm text-center">{t("creating_account_sub")}</p>
          </div>
        )}

        {/* KYB required */}
        {step === "kyb" && (
          <div className="space-y-6">
            <div className="bg-amber-900/20 border border-amber-500/30 rounded-2xl p-5 space-y-3">
              <p className="text-amber-300 font-semibold text-sm">🏢 {t("kyb_title")}</p>
              <p className="text-slate-300 text-sm leading-relaxed">{t("kyb_body")}</p>
            </div>
            {kybUrl && (
              <a href={kybUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full bg-amber-600 hover:bg-amber-500 text-white font-bold py-4 rounded-2xl transition-all">
                {t("kyb_cta")}
              </a>
            )}
            <p className="text-slate-500 text-xs text-center leading-relaxed">{t("kyb_after")}</p>
            <button onClick={() => setStep("form")} className="w-full text-slate-500 text-sm hover:text-slate-300 transition-colors py-2">
              ← {t("back")}
            </button>
          </div>
        )}

        {/* WIRE INSTRUCTIONS */}
        {step === "wire" && (
          <div className="space-y-5">
            <div>
              <h1 className="text-xl font-bold text-white mb-1">{t("wire_title")}</h1>
              <p className="text-slate-400 text-sm">{t("wire_subtitle")}</p>
            </div>

            <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-5 space-y-3">
              {[
                { label: t("wire_bank"), value: va.bank_name },
                { label: t("wire_routing"), value: va.routing_number },
                { label: t("wire_account"), value: va.account_number },
                { label: t("wire_iban"), value: va.iban },
                { label: t("wire_swift"), value: va.swift_bic },
                { label: t("wire_beneficiary"), value: va.beneficiary },
                { label: t("wire_reference"), value: va.reference },
                { label: t("wire_currency"), value: va.currency ?? "USD" },
              ].filter(f => f.value).map(field => (
                <div key={field.label} className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-slate-500 text-[10px] uppercase tracking-wide">{field.label}</p>
                    <p className="text-white text-sm font-mono mt-0.5">{field.value}</p>
                  </div>
                  <button onClick={() => copy(field.value!, field.label)}
                    className="text-slate-500 hover:text-[#00C9C8] transition-colors flex-shrink-0">
                    {copied === field.label ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              ))}
            </div>

            <div className="bg-[#00C9C8]/10 border border-[#00C9C8]/20 rounded-xl p-4">
              <p className="text-[#00C9C8] text-xs font-semibold mb-1">{t("wire_amount_label")}</p>
              <p className="text-white font-mono font-bold text-lg">{amountTarget.toLocaleString()} {currency}</p>
            </div>

            <button onClick={() => { setStep("tracking"); pollStatus(); }}
              className="w-full bg-slate-700 hover:bg-slate-600 text-white font-medium py-3 rounded-xl transition-all flex items-center justify-center gap-2 text-sm">
              <RefreshCw className="w-4 h-4" />
              {t("check_status")}
            </button>

            <p className="text-slate-500 text-xs text-center leading-relaxed">{t("wire_note")}</p>
          </div>
        )}

        {/* TRACKING */}
        {step === "tracking" && (
          <div className="space-y-6">
            <div className="flex flex-col items-center gap-4">
              <Clock className="w-10 h-10 text-[#00C9C8] animate-spin" style={{ animationDuration: "3s" }} />
              <div className="text-center">
                <p className="text-white font-semibold">{t("tracking_title")}</p>
                {track && <p className="text-slate-400 text-sm mt-1">{t("tracking_state")}: {track.state}</p>}
              </div>
            </div>
            <button onClick={pollStatus}
              className="w-full bg-slate-700 hover:bg-slate-600 text-white font-medium py-3 rounded-xl transition-all flex items-center justify-center gap-2 text-sm">
              <RefreshCw className="w-4 h-4" />
              {t("refresh")}
            </button>
            <button onClick={() => setStep("wire")} className="w-full text-slate-500 text-sm hover:text-slate-300 transition-colors py-2">
              ← {t("back_to_wire")}
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

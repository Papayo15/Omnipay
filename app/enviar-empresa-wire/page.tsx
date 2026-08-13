"use client";

import { useState, useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { Zap, ArrowLeft, Building2, Copy, Check, AlertCircle, Share2 } from "lucide-react";
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

type Step = "form" | "submitting" | "kyb" | "link_ready" | "error";

interface FormSnapshot {
  recipientBusinessName: string;
  recipientEmail:        string;
  recipientCountry:      string;
  accountField:          string;
  bicField:              string;
  amount:                string;
}

export default function EnviarEmpresaWirePage() {
  const t  = useTranslations("enviar_empresa_wire");
  const tF = useTranslations("p2p");
  const router       = useRouter();
  const searchParams = useSearchParams();

  const [step, setStep]   = useState<Step>("form");
  const [error, setError] = useState("");
  const [copied, setCopied]   = useState(false);
  const [kybUrl, setKybUrl]   = useState("");
  const [payLink, setPayLink] = useState("");
  const [autoRetry, setAutoRetry] = useState(false);

  // Recipient form fields
  const [recipientBusinessName, setRecipientBusinessName] = useState("");
  const [recipientEmail, setRecipientEmail]               = useState("");
  const [recipientCountry, setRecipientCountry]           = useState("MX");
  const [accountField, setAccountField] = useState("");
  const [bicField, setBicField]         = useState("");
  const [amount, setAmount]             = useState("");

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

  const minLocalAmount: Record<string, number> = {
    USD: 50, MXN: 900, EUR: 47, GBP: 40, COP: 210000, BRL: 280,
  };
  const minLocal = minLocalAmount[currency] ?? 50;

  // Detect return from Bridge KYB — restore form + auto-retry
  useEffect(() => {
    if (searchParams.get("kyb_done") !== "1") return;
    const savedRaw = sessionStorage.getItem("b2b_checkout_form");
    if (!savedRaw) return;
    const snap = JSON.parse(savedRaw) as FormSnapshot;
    setRecipientBusinessName(snap.recipientBusinessName);
    setRecipientEmail(snap.recipientEmail);
    setRecipientCountry(snap.recipientCountry ?? "MX");
    setAccountField(snap.accountField);
    setBicField(snap.bicField ?? "");
    setAmount(snap.amount);
    sessionStorage.removeItem("b2b_checkout_form");
    setAutoRetry(true);
    window.history.replaceState({}, "", "/enviar-empresa-wire");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fire auto-retry after state is populated
  useEffect(() => {
    if (!autoRetry) return;
    setAutoRetry(false);
    handleSubmit();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRetry]);

  const handleSubmit = useCallback(async () => {
    setStep("submitting");
    setError("");
    const snap: FormSnapshot = {
      recipientBusinessName, recipientEmail, recipientCountry, accountField, bicField, amount,
    };
    const sepa = SEPA_COUNTRIES.has(recipientCountry);
    const appUrl = window.location.origin;
    const redirectUri = `${appUrl}/enviar-empresa-wire?kyb_done=1`;
    try {
      const res = await fetch("/api/bridge/b2b/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_name:  recipientBusinessName.trim(),
          email:          recipientEmail.trim().toLowerCase(),
          country:        recipientCountry,
          receive_method: "bank",
          redirect_uri:   redirectUri,
          ...(recipientCountry === "MX" ? { clabe:          accountField.trim() } : {}),
          ...(recipientCountry === "GB" ? { sort_code:      accountField.split("/")[0]?.trim(), account_number: accountField.split("/")[1]?.trim() } : {}),
          ...(sepa                      ? { iban:           accountField.trim(), bic: bicField.trim() } : {}),
          ...(recipientCountry === "US" ? { routing_number: accountField.split("/")[0]?.trim(), account_number: accountField.split("/")[1]?.trim() } : {}),
          ...(recipientCountry === "CO" ? { account_number: accountField.trim() } : {}),
          amount_target: parseFloat(amount),
        }),
      });
      const data = await res.json() as {
        needs_kyb?: boolean; kyb_url?: string; customer_id?: string;
        pay_link?: string; token?: string; error?: string;
      };

      if (data.needs_kyb) {
        sessionStorage.setItem("b2b_checkout_form", JSON.stringify(snap));
        setKybUrl(data.kyb_url ?? "");
        setStep("kyb");
        return;
      }
      if (!res.ok || data.error) throw new Error(data.error ?? "Error creando checkout");

      setPayLink(data.pay_link ?? "");
      setStep("link_ready");
    } catch (e) {
      setError((e as Error).message);
      setStep("error");
    }
  }, [recipientBusinessName, recipientEmail, recipientCountry, accountField, bicField, amount]);

  const copyLink = useCallback(() => {
    navigator.clipboard.writeText(payLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [payLink]);

  const shareLink = useCallback(async () => {
    if (!payLink) return;
    const shareData = { title: "OmniPay B2B — Link de pago", text: `Realiza el pago empresarial a través de este link: ${payLink}`, url: payLink };
    if (typeof navigator !== "undefined" && "share" in navigator && navigator.canShare?.(shareData)) {
      try { await navigator.share(shareData); } catch { /* cancelled */ }
    } else {
      copyLink();
    }
  }, [payLink, copyLink]);

  const isValid = recipientBusinessName && recipientEmail.includes("@") && accountField && amount && parseFloat(amount) >= minLocal;

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

            {/* Recipient */}
            <div className="space-y-3">
              <p className="text-slate-400 text-xs uppercase tracking-widest">{t("section_recipient")}</p>
              <input type="text" placeholder={t("recipient_business")} value={recipientBusinessName} onChange={e => setRecipientBusinessName(e.target.value)}
                className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-[#00C9C8]/60" />
              <input type="email" placeholder={t("recipient_email")} value={recipientEmail} onChange={e => setRecipientEmail(e.target.value)}
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
              <p className="text-slate-500 text-[10px] px-1">
                {t("amount_hint")} · Mínimo {minLocal.toLocaleString()} {currency} (~$50 USD)
              </p>
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

        {/* LINK READY — share with sender */}
        {step === "link_ready" && (
          <div className="space-y-6">
            <div className="flex flex-col items-center gap-3 pt-4">
              <div className="w-14 h-14 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <Building2 className="w-7 h-7 text-emerald-400" />
              </div>
              <div className="text-center">
                <h1 className="text-xl font-bold text-white mb-1">{t("link_ready_title")}</h1>
                <p className="text-slate-400 text-sm">{t("link_ready_subtitle")}</p>
              </div>
            </div>

            <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4">
              <p className="text-slate-500 text-[10px] uppercase tracking-wide mb-2">{t("link_label")}</p>
              <p className="text-[#00C9C8] text-xs font-mono break-all leading-relaxed">{payLink}</p>
            </div>

            <button onClick={shareLink}
              className="w-full bg-[#00C9C8] hover:bg-[#00b8b7] text-[#0f172a] font-bold py-4 rounded-2xl transition-all active:scale-[0.98] flex items-center justify-center gap-2">
              <Share2 className="w-4 h-4" />
              {t("share_link")}
            </button>

            <button onClick={copyLink}
              className="w-full bg-slate-800 hover:bg-slate-700 text-white font-medium py-3 rounded-xl transition-all flex items-center justify-center gap-2 text-sm">
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              {copied ? t("copied") : t("copy_link")}
            </button>

            <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-4 space-y-2">
              <p className="text-slate-400 text-xs font-semibold">{t("link_instructions_title")}</p>
              <p className="text-slate-500 text-xs leading-relaxed">{t("link_instructions_body")}</p>
            </div>

            <button onClick={() => setStep("form")} className="w-full text-slate-500 text-sm hover:text-slate-300 transition-colors py-2">
              {t("new_link")}
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

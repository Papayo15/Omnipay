"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Zap, ArrowLeft, Send, Copy, Check, AlertCircle } from "lucide-react";
import { SEPA_COUNTRIES } from "@/lib/wise-accounts";

type Step = "form" | "sending" | "invite" | "ready" | "error";

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
  { code: "NO", flag: "🇳🇴", rail: "SEPA" },
  { code: "PL", flag: "🇵🇱", rail: "SEPA" },
];

export default function EnviarPage() {
  const t    = useTranslations("enviar");
  const tF   = useTranslations("p2p");   // shared field labels + country names
  const router = useRouter();

  const [step, setStep] = useState<Step>("form");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  // Datos del emisor
  const [senderName, setSenderName] = useState("");
  const [senderEmail, setSenderEmail] = useState("");

  // Datos del receptor
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [recipientCountry, setRecipientCountry] = useState("MX");
  const [accountField, setAccountField] = useState("");
  const [bicField, setBicField] = useState("");
  const [amountTarget, setAmountTarget] = useState("");

  // Resultado
  const [waLink, setWaLink] = useState("");
  const [payLink, setPayLink] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  const isSepa   = SEPA_COUNTRIES.has(recipientCountry);
  const needsBic = isSepa;

  // Translated account field label (reuses p2p namespace — already in 19 languages)
  const accountLabel = recipientCountry === "MX" ? tF("clabe_label")
    : isSepa            ? tF("iban_label")
    : recipientCountry === "GB" ? tF("uk_label")
    : recipientCountry === "CO" ? tF("co_label")
    : tF("account_label");

  const accountHint = isSepa ? tF("hint_sepa")
    : recipientCountry === "GB" ? tF("hint_uk")
    : recipientCountry === "US" ? tF("hint_us")
    : null;

  const buildBody = useCallback(() => {
    const base = {
      sender_name:       senderName.trim(),
      sender_email:      senderEmail.trim().toLowerCase(),
      recipient_name:    recipientName.trim(),
      recipient_email:   recipientEmail.trim().toLowerCase(),
      recipient_phone:   recipientPhone.trim(),
      recipient_country: recipientCountry,
      amount_target:     parseFloat(amountTarget),
    };
    if (recipientCountry === "MX") return { ...base, clabe: accountField.trim() };
    if (recipientCountry === "GB") return { ...base, sort_code: accountField.split("/")[0]?.trim(), account_number: accountField.split("/")[1]?.trim() };
    if (isSepa) return { ...base, iban: accountField.trim(), bic: bicField.trim() };
    return { ...base, routing_number: accountField.split("/")[0]?.trim(), account_number: accountField.split("/")[1]?.trim() };
  }, [senderName, senderEmail, recipientName, recipientEmail, recipientPhone, recipientCountry, accountField, bicField, amountTarget, isSepa]);

  const handleSubmit = useCallback(async () => {
    setError("");
    setStep("sending");
    try {
      const res = await fetch("/api/bridge/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBody()),
      });
      const data = await res.json() as {
        status?: string; wa_link?: string; pay_link?: string;
        invite_url?: string; expires_at?: string; error?: string;
      };
      if (!res.ok || data.error) { setError(data.error ?? "Error desconocido"); setStep("error"); return; }

      setWaLink(data.wa_link ?? "");
      setPayLink(data.pay_link ?? "");
      setInviteUrl(data.invite_url ?? "");
      setExpiresAt(data.expires_at ?? "");
      setStep(data.status === "ready" ? "ready" : "invite");
    } catch {
      setError("Error de conexión. Verifica tu internet.");
      setStep("error");
    }
  }, [buildBody]);

  const copyLink = useCallback((link: string) => {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);

  const currency = recipientCountry === "MX" ? "MXN"
    : recipientCountry === "GB" ? "GBP"
    : recipientCountry === "CO" ? "COP"
    : recipientCountry === "US" ? "USD"
    : "EUR";

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
        </div>

        {/* FORM */}
        {step === "form" && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-white mb-1">{t("title")}</h1>
              <p className="text-slate-400 text-sm">{t("subtitle")}</p>
            </div>

            {/* Datos del emisor */}
            <div className="space-y-3">
              <p className="text-slate-400 text-xs uppercase tracking-widest">{t("section_you")}</p>
              <input
                type="text"
                placeholder={t("your_name")}
                value={senderName}
                onChange={e => setSenderName(e.target.value)}
                className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-emerald-500/60"
              />
              <input
                type="email"
                placeholder={t("your_email")}
                value={senderEmail}
                onChange={e => setSenderEmail(e.target.value)}
                className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-emerald-500/60"
              />
            </div>

            {/* Datos del receptor */}
            <div className="space-y-3">
              <p className="text-slate-400 text-xs uppercase tracking-widest">{t("section_recipient")}</p>

              <input
                type="text"
                placeholder={t("recipient_name")}
                value={recipientName}
                onChange={e => setRecipientName(e.target.value)}
                className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-[#00C9C8]/60"
              />
              <input
                type="email"
                placeholder={t("recipient_email")}
                value={recipientEmail}
                onChange={e => setRecipientEmail(e.target.value)}
                className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-[#00C9C8]/60"
              />
              <input
                type="tel"
                placeholder={t("recipient_whatsapp")}
                value={recipientPhone}
                onChange={e => setRecipientPhone(e.target.value)}
                className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-[#00C9C8]/60"
              />
              <p className="text-slate-500 text-[10px] -mt-1 px-1">{t("whatsapp_hint")}</p>

              {/* País destino */}
              <select
                value={recipientCountry}
                onChange={e => { setRecipientCountry(e.target.value); setAccountField(""); setBicField(""); }}
                className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#00C9C8]/60"
              >
                {BRIDGE_COUNTRIES.map(c => (
                  <option key={c.code} value={c.code}>{c.flag} {tF(`country_${c.code}`)} ({c.rail})</option>
                ))}
              </select>

              {/* Campo de cuenta según país */}
              <input
                type="text"
                placeholder={accountLabel}
                value={accountField}
                onChange={e => setAccountField(e.target.value)}
                className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-[#00C9C8]/60 font-mono"
              />
              {needsBic && (
                <input
                  type="text"
                  placeholder={tF("bic_label")}
                  value={bicField}
                  onChange={e => setBicField(e.target.value)}
                  className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-[#00C9C8]/60 font-mono"
                />
              )}
              {accountHint && (
                <p className="text-slate-500 text-[10px] px-1">{accountHint}</p>
              )}
            </div>

            {/* Monto */}
            <div className="space-y-2">
              <p className="text-slate-400 text-xs uppercase tracking-widest">{t("section_amount")}</p>
              <div className="relative">
                <input
                  type="number"
                  placeholder="0.00"
                  value={amountTarget}
                  onChange={e => setAmountTarget(e.target.value)}
                  className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 pr-16 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-emerald-500/60"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-mono">{currency}</span>
              </div>
              <p className="text-slate-500 text-[10px] px-1">{t("amount_hint")}</p>
            </div>

            <button
              onClick={handleSubmit}
              disabled={!senderName || !senderEmail || !recipientName || !recipientEmail || !recipientPhone || !accountField || !amountTarget}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-4 rounded-2xl transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2"
            >
              <Send className="w-4 h-4" />
              {t("cta")}
            </button>
          </div>
        )}

        {/* SENDING */}
        {step === "sending" && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
            <Zap className="w-10 h-10 text-[#00C9C8] animate-pulse" />
            <p className="text-white font-semibold">{t("checking")}</p>
            <p className="text-slate-400 text-sm text-center">{t("checking_sub")}</p>
          </div>
        )}

        {/* INVITE SENT — receptor necesita KYC */}
        {step === "invite" && (
          <div className="space-y-6">
            <div className="bg-amber-900/20 border border-amber-500/30 rounded-2xl p-5 space-y-3">
              <p className="text-amber-300 font-semibold text-sm">📲 {t("invite_title")}</p>
              <p className="text-slate-300 text-sm leading-relaxed">
                {t("invite_body", { name: recipientName })}
              </p>
              {expiresAt && (
                <p className="text-slate-500 text-xs">
                  {t("invite_expires", { date: new Date(expiresAt).toLocaleDateString() })}
                </p>
              )}
            </div>

            {/* Botón WhatsApp */}
            {waLink && (
              <a
                href={waLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-3 w-full bg-[#25D366] hover:bg-[#20ba58] text-white font-bold py-4 rounded-2xl transition-all duration-200 active:scale-[0.98]"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                {t("send_whatsapp")}
              </a>
            )}

            {/* Copiar link */}
            {inviteUrl && (
              <button
                onClick={() => copyLink(inviteUrl)}
                className="flex items-center justify-center gap-2 w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-3 rounded-xl transition-all text-sm"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                {copied ? t("copied") : t("copy_link")}
              </button>
            )}

            <p className="text-slate-500 text-xs text-center leading-relaxed">
              {t("invite_next", { name: recipientName })}
            </p>

            <button onClick={() => setStep("form")} className="w-full text-slate-500 text-sm hover:text-slate-300 transition-colors py-2">
              ← {t("back")}
            </button>
          </div>
        )}

        {/* READY — receptor ya verificado, link de pago listo */}
        {step === "ready" && (
          <div className="space-y-6">
            <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-2xl p-5 space-y-2">
              <p className="text-emerald-400 font-semibold text-sm">✓ {t("ready_title")}</p>
              <p className="text-slate-300 text-sm leading-relaxed">
                {t("ready_body", { name: recipientName })}
              </p>
            </div>

            {waLink && (
              <a
                href={waLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-3 w-full bg-[#25D366] hover:bg-[#20ba58] text-white font-bold py-4 rounded-2xl transition-all duration-200 active:scale-[0.98]"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                {t("send_pay_link")}
              </a>
            )}

            {payLink && (
              <button
                onClick={() => copyLink(payLink)}
                className="flex items-center justify-center gap-2 w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-3 rounded-xl transition-all text-sm"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                {copied ? t("copied") : t("copy_pay_link")}
              </button>
            )}
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

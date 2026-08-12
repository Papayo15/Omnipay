"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Zap, ArrowLeft, Send, Copy, Check, AlertCircle, Loader2, CheckCircle } from "lucide-react";
import { SEPA_COUNTRIES } from "@/lib/wise-accounts";

type Step = "form" | "sending" | "waiting" | "sender_kyc" | "instructions" | "error";

interface VaInfo {
  bank_name?:      string | null;
  beneficiary?:    string | null;
  routing_number?: string | null;
  account_number?: string | null;
  iban?:           string | null;
  bic?:            string | null;
  sort_code?:      string | null;
  clabe?:          string | null;
  pix?:            string | null;
  currency?:       string | null;
  payment_rail?:   string | null;
}

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

const WA_SVG = (
  <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

export default function EnviarPage() {
  const t    = useTranslations("enviar");
  const tF   = useTranslations("p2p");
  const router = useRouter();

  const [step, setStep] = useState<Step>("form");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  // Datos del emisor
  const [senderName, setSenderName]   = useState("");
  const [senderEmail, setSenderEmail] = useState("");

  // Datos del receptor
  const [recipientName, setRecipientName]       = useState("");
  const [recipientEmail, setRecipientEmail]     = useState("");
  const [recipientPhone, setRecipientPhone]     = useState("");
  const [recipientCountry, setRecipientCountry] = useState("MX");
  const [accountField, setAccountField]         = useState("");
  const [bicField, setBicField]                 = useState("");
  const [amountTarget, setAmountTarget]         = useState("");

  // Post-submit state
  const [inviteToken, setInviteToken]       = useState("");
  const [waLink, setWaLink]                 = useState("");
  const [inviteUrl, setInviteUrl]           = useState("");
  const [expiresAt, setExpiresAt]           = useState("");
  const [senderKycUrl, setSenderKycUrl]     = useState("");
  const [vaInfo, setVaInfo]                 = useState<VaInfo | null>(null);
  const [orderId, setOrderId]               = useState("");
  const [payToken, setPayToken]             = useState("");
  const [confirmedAmount, setConfirmedAmount] = useState(0);
  const [targetCurrency, setTargetCurrency]   = useState("MXN"); // moneda que recibe el receptor
  const [sandboxDone, setSandboxDone]             = useState(false);
  const [sandboxAdvancing, setSandboxAdvancing]   = useState(false);
  const [sandboxSimulating, setSandboxSimulating] = useState(false);
  const [sandboxSimulated, setSandboxSimulated]   = useState(false);
  const [showSandboxBtn, setShowSandboxBtn]       = useState(false); // hidden until confirmed sandbox

  const [pollCounter, setPollCounter] = useState(0);
  const pollRef        = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sandboxChecked = useRef(false);
  const pollRetries    = useRef(0);

  const isSepa   = SEPA_COUNTRIES.has(recipientCountry);
  const needsBic = isSepa;
  const isSandbox = typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      document.cookie.includes("__sandbox") ||
      (process.env.NEXT_PUBLIC_BRIDGE_API_BASE ?? "").includes("sandbox"));

  const accountLabel = recipientCountry === "MX" ? tF("clabe_label")
    : isSepa             ? tF("iban_label")
    : recipientCountry === "GB" ? tF("uk_label")
    : recipientCountry === "CO" ? tF("co_label")
    : tF("account_label");

  const accountHint = isSepa ? tF("hint_sepa")
    : recipientCountry === "GB" ? tF("hint_uk")
    : recipientCountry === "US" ? tF("hint_us")
    : null;

  const currency = recipientCountry === "MX" ? "MXN"
    : recipientCountry === "GB" ? "GBP"
    : recipientCountry === "CO" ? "COP"
    : recipientCountry === "US" ? "USD"
    : "EUR";

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

  // Detect sandbox once when entering waiting step (ping sandbox advance; 403 = production)
  useEffect(() => {
    if (step !== "waiting" || sandboxChecked.current) return;
    sandboxChecked.current = true;
    fetch("/api/bridge/sandbox/advance?order_id=OP-PING")
      .then(r => { if (r.status !== 403) setShowSandboxBtn(true); })
      .catch(() => { /* network error — keep hidden */ });
  }, [step]);

  // Polling: llama al status endpoint hasta que el receptor complete KYC
  useEffect(() => {
    if (step !== "waiting" || !inviteToken) return;
    let cancelled = false;

    const doPoll = async () => {
      if (cancelled) return;
      try {
        const res  = await fetch(`/api/bridge/invite/status?i=${encodeURIComponent(inviteToken)}`);
        const data = await res.json() as {
          ready?: boolean; reason?: string; kyc_url?: string; error?: string;
          va?: VaInfo; amount_target?: number; order_id?: string;
          token?: string;
        };
        if (cancelled) return;

        if (data.ready && data.va) {
          setVaInfo(data.va);
          setConfirmedAmount(data.amount_target ?? parseFloat(amountTarget));
          setTargetCurrency((data as Record<string, unknown>).target_currency as string ?? "MXN");
          setOrderId(data.order_id ?? "");
          setPayToken(data.token ?? "");
          setStep("instructions");
          return;
        }

        if (data.reason === "sender_needs_kyc" && data.kyc_url) {
          setSenderKycUrl(data.kyc_url);
          setStep("sender_kyc");
          return;
        }

        // Surface real errors after a couple retries (avoid false alarms on first check)
        if (data.reason === "error" && data.error) {
          pollRetries.current += 1;
          if (pollRetries.current >= 2) {
            setError(`Error preparando instrucciones: ${data.error}`);
            setStep("error");
            return;
          }
        }

        // Hard stop after 40 retries (~5 min) — avoid infinite loop
        if (pollRetries.current >= 40) {
          setError("La verificación está tardando demasiado. Recarga la página e intenta de nuevo.");
          setStep("error");
          return;
        }
        pollRetries.current += 1;
      } catch { /* network error — retry silently */ }

      if (!cancelled) {
        pollRef.current = setTimeout(doPoll, 8000);
      }
    };

    // Use shorter delay when triggered by the sandbox simulate button
    const initialDelay = pollCounter > 0 ? 1500 : 3000;
    pollRef.current = setTimeout(doPoll, initialDelay);
    return () => {
      cancelled = true;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [step, inviteToken, amountTarget, pollCounter]);

  const handleSubmit = useCallback(async () => {
    setError("");
    setStep("sending");
    try {
      const res = await fetch("/api/bridge/invite", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(buildBody()),
      });
      const data = await res.json() as {
        status?: string; wa_link?: string; pay_link?: string;
        invite_url?: string; expires_at?: string; error?: string;
        va?: VaInfo; amount_target?: number; order_id?: string; token?: string;
      };
      if (!res.ok || data.error) { setError(data.error ?? "Error desconocido"); setStep("error"); return; }

      if (data.status === "ready" && data.va) {
        // Receptor ya verificado: mostrar instrucciones directamente
        setVaInfo(data.va);
        setConfirmedAmount(data.amount_target ?? parseFloat(amountTarget));
        setTargetCurrency((data as Record<string, unknown>).target_currency as string ?? "MXN");
        setOrderId(data.order_id ?? "");
        setPayToken(data.token ?? "");
        setStep("instructions");
        return;
      }

      // Receptor necesita KYC: iniciar polling
      const url = data.invite_url ?? "";
      const token = url ? new URL(url, "https://x.com").searchParams.get("i") ?? "" : "";
      setInviteToken(token);
      setWaLink(data.wa_link ?? "");
      setInviteUrl(url);
      setExpiresAt(data.expires_at ?? "");
      setStep("waiting");
    } catch {
      setError("Error de conexión. Verifica tu internet.");
      setStep("error");
    }
  }, [buildBody, amountTarget]);

  const copyText = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  }, []);

  const simulateRecipient = useCallback(async () => {
    if (!inviteToken) return;
    setSandboxSimulating(true);
    try {
      const res  = await fetch(`/api/bridge/sandbox/simulate-recipient?i=${encodeURIComponent(inviteToken)}`);
      if (res.status === 403) { setShowSandboxBtn(false); return; } // production — hide button
      const data = await res.json() as { ok?: boolean; error?: string };
      if (data.ok) {
        setSandboxSimulated(true);
        pollRetries.current = 0; // reset counter for fresh start
        setPollCounter(c => c + 1); // triggers immediate re-poll (1.5s delay)
      } else {
        setError(data.error ?? "Error simulando receptor");
      }
    } catch {
      setError("Error de conexión al simular");
    } finally {
      setSandboxSimulating(false);
    }
  }, [inviteToken]);

  const advanceSandbox = useCallback(async () => {
    if (!orderId) return;
    setSandboxAdvancing(true);
    try {
      const res  = await fetch(`/api/bridge/sandbox/advance?order_id=${orderId}`);
      const data = await res.json() as { ok?: boolean; error?: string };
      if (data.ok) setSandboxDone(true);
      else setError(data.error ?? "Error sandbox");
    } finally {
      setSandboxAdvancing(false);
    }
  }, [orderId]);

  const CopyButton = ({ text, id, label }: { text: string; id: string; label: string }) => (
    <button
      onClick={() => copyText(text, id)}
      className="flex items-center gap-1 text-[#00C9C8] hover:text-white transition-colors text-xs"
    >
      {copied === id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied === id ? t("copied") : label}
    </button>
  );

  const VaRow = ({ label, value, copyId }: { label: string; value: string; copyId: string }) => (
    <div className="flex items-start justify-between gap-2 py-2 border-b border-slate-700/50 last:border-0">
      <span className="text-slate-400 text-xs shrink-0">{label}</span>
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-white text-sm font-mono text-right break-all">{value}</span>
        <CopyButton text={value} id={copyId} label={t("copy")} />
      </div>
    </div>
  );

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
              <p className="text-slate-500 text-[10px] -mt-1 px-1">{t("whatsapp_hint_optional")}</p>

              <select
                value={recipientCountry}
                onChange={e => { setRecipientCountry(e.target.value); setAccountField(""); setBicField(""); }}
                className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#00C9C8]/60"
              >
                {BRIDGE_COUNTRIES.map(c => (
                  <option key={c.code} value={c.code}>{c.flag} {tF(`country_${c.code}`)} ({c.rail})</option>
                ))}
              </select>

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
              disabled={!senderName || !senderEmail || !recipientName || !recipientEmail || !accountField || !amountTarget}
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

        {/* WAITING — receptor necesita KYC, emisor espera polling */}
        {step === "waiting" && (
          <div className="space-y-6">
            <div className="bg-amber-900/20 border border-amber-500/30 rounded-2xl p-5 space-y-3">
              <p className="text-amber-300 font-semibold text-sm">📲 {t("waiting_title")}</p>
              <p className="text-slate-300 text-sm leading-relaxed">
                {t("waiting_body", { name: recipientName })}
              </p>
              {expiresAt && (
                <p className="text-slate-500 text-xs">
                  {t("invite_expires", { date: new Date(expiresAt).toLocaleDateString() })}
                </p>
              )}
            </div>

            {/* Compartir el link con el receptor */}
            {inviteUrl && (
              <div className="space-y-2">
                {/* Botón principal: WhatsApp directo si hay teléfono, Web Share si no */}
                {waLink && recipientPhone ? (
                  <a
                    href={waLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-3 w-full bg-[#25D366] hover:bg-[#20ba58] text-white font-bold py-4 rounded-2xl transition-all duration-200 active:scale-[0.98]"
                  >
                    {WA_SVG}
                    {t("send_whatsapp")}
                  </a>
                ) : (
                  <button
                    onClick={async () => {
                      const shareData = {
                        title: "OmniPay — Verificación de identidad",
                        text: `Hola ${recipientName} 👋, necesitas verificar tu identidad para recibir tu dinero (2 min):`,
                        url: inviteUrl,
                      };
                      if (typeof navigator !== "undefined" && "share" in navigator && navigator.canShare?.(shareData)) {
                        try { await navigator.share(shareData); } catch { /* user cancelled */ }
                      } else {
                        copyText(inviteUrl, "invite");
                      }
                    }}
                    className="flex items-center justify-center gap-2 w-full bg-[#00C9C8] hover:bg-[#00b5b4] text-slate-900 font-bold py-4 rounded-2xl transition-all duration-200 active:scale-[0.98]"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                    </svg>
                    {t("share_invite")}
                  </button>
                )}

                {/* Siempre: también opción de copiar el link */}
                <button
                  onClick={() => copyText(inviteUrl, "invite")}
                  className="flex items-center justify-center gap-2 w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-3 rounded-xl transition-all text-sm"
                >
                  {copied === "invite" ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  {copied === "invite" ? t("copied") : t("copy_link")}
                </button>
              </div>
            )}

            {/* Sandbox: simular KYC del receptor sin abrir otra pestaña */}
            {showSandboxBtn && !sandboxSimulated && (
              <button
                onClick={simulateRecipient}
                disabled={sandboxSimulating}
                className="w-full bg-purple-900/40 hover:bg-purple-800/60 border border-purple-500/30 disabled:opacity-50 text-purple-300 font-semibold py-3 rounded-xl transition-all text-sm flex items-center justify-center gap-2"
              >
                {sandboxSimulating
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Zap className="w-4 h-4" />}
                {t("sandbox_simulate_recipient")}
              </button>
            )}
            {sandboxSimulated && (
              <div className="text-center text-purple-400 text-xs py-1">
                ✓ {t("sandbox_recipient_simulated")}
              </div>
            )}

            {/* Polling indicator */}
            <div className="flex items-center justify-center gap-2 py-3">
              <Loader2 className="w-4 h-4 text-slate-500 animate-spin" />
              <p className="text-slate-500 text-xs">{t("waiting_polling")}</p>
            </div>

            <p className="text-slate-600 text-xs text-center leading-relaxed">
              {t("waiting_note", { name: recipientName })}
            </p>

            <button onClick={() => setStep("form")} className="w-full text-slate-500 text-sm hover:text-slate-300 transition-colors py-2">
              ← {t("back")}
            </button>
          </div>
        )}

        {/* SENDER KYC — producción: emisor necesita verificar identidad */}
        {step === "sender_kyc" && (
          <div className="space-y-6">
            <div className="bg-blue-900/20 border border-blue-500/30 rounded-2xl p-5 space-y-3">
              <p className="text-blue-300 font-semibold text-sm">🔒 {t("sender_kyc_title")}</p>
              <p className="text-slate-300 text-sm leading-relaxed">{t("sender_kyc_body")}</p>
              <ul className="space-y-1 text-slate-400 text-xs">
                <li>✓ {t("kyc_li1")}</li>
                <li>✓ {t("kyc_li2")}</li>
                <li>✓ {t("kyc_li3")}</li>
              </ul>
            </div>
            {senderKycUrl && (
              <a
                href={senderKycUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-2xl transition-all duration-200 active:scale-[0.98]"
              >
                {t("sender_kyc_cta")}
              </a>
            )}
            <button onClick={() => setStep("form")} className="w-full text-slate-500 text-sm hover:text-slate-300 transition-colors py-2">
              ← {t("back")}
            </button>
          </div>
        )}

        {/* INSTRUCTIONS — VA bancario listo para depositar */}
        {step === "instructions" && vaInfo && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-white mb-1">{t("instructions_title")}</h1>
              <p className="text-slate-400 text-sm">{t("instructions_body", { name: recipientName })}</p>
            </div>

            {/* Tarjeta VA */}
            <div className="bg-slate-800/60 border border-emerald-500/20 rounded-2xl p-5 space-y-0">
              {vaInfo.bank_name && (
                <VaRow label={t("va_bank")} value={vaInfo.bank_name} copyId="bank" />
              )}
              {vaInfo.beneficiary && (
                <VaRow label={t("va_beneficiary")} value={vaInfo.beneficiary} copyId="bene" />
              )}
              {vaInfo.routing_number && (
                <VaRow label={t("va_routing")} value={vaInfo.routing_number} copyId="routing" />
              )}
              {vaInfo.account_number && (
                <VaRow label={t("va_account")} value={vaInfo.account_number} copyId="account" />
              )}
              {vaInfo.iban && (
                <VaRow label={t("va_iban")} value={vaInfo.iban} copyId="iban" />
              )}
              {vaInfo.bic && (
                <VaRow label="BIC / SWIFT" value={vaInfo.bic} copyId="bic" />
              )}
              {vaInfo.sort_code && (
                <VaRow label="Sort Code" value={vaInfo.sort_code} copyId="sort" />
              )}
              {vaInfo.clabe && (
                <VaRow label="CLABE" value={vaInfo.clabe} copyId="clabe" />
              )}
              {vaInfo.pix && (
                <VaRow label="PIX" value={vaInfo.pix} copyId="pix" />
              )}

              {/* Monto */}
              <div className="mt-3 pt-3 border-t border-slate-700/50 space-y-2">
                {/* Monto que recibirá el receptor */}
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-xs">{t("va_recipient_gets")}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-400 font-bold text-lg font-mono">
                      {confirmedAmount.toLocaleString()} {targetCurrency.toUpperCase()}
                    </span>
                    <CopyButton text={String(confirmedAmount)} id="amount" label={t("copy")} />
                  </div>
                </div>
                {/* Moneda de depósito del emisor */}
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-xs">{t("va_deposit_currency")}</span>
                  <span className="text-slate-300 text-sm font-mono">
                    {(vaInfo.currency ?? "USD").toUpperCase()}
                  </span>
                </div>
              </div>
            </div>

            <p className="text-slate-500 text-xs text-center leading-relaxed px-2">
              {t("instructions_note")}
            </p>

            {/* Sandbox: botón para simular el pago */}
            {isSandbox && orderId && !sandboxDone && (
              <button
                onClick={advanceSandbox}
                disabled={sandboxAdvancing}
                className="w-full bg-purple-800 hover:bg-purple-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-all text-sm flex items-center justify-center gap-2"
              >
                {sandboxAdvancing && <Loader2 className="w-4 h-4 animate-spin" />}
                {t("sandbox_advance")}
              </button>
            )}
            {sandboxDone && (
              <div className="space-y-4">
                {/* Comprobante estilo bancario */}
                <div className="bg-slate-800/80 border border-emerald-500/40 rounded-2xl overflow-hidden">
                  <div className="bg-emerald-600/20 px-5 py-3 border-b border-emerald-500/20 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                    <span className="text-emerald-400 font-semibold text-sm">{t("receipt_title")}</span>
                  </div>
                  <div className="px-5 py-4 space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">{t("receipt_to")}</span>
                      <span className="text-white font-medium">{recipientName}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">{t("receipt_country")}</span>
                      <span className="text-white">{BRIDGE_COUNTRIES.find(c => c.code === recipientCountry)?.flag} {recipientCountry}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">{t("receipt_amount")}</span>
                      <span className="text-white font-mono font-bold">{confirmedAmount.toLocaleString()} {targetCurrency.toUpperCase()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">{t("receipt_ref")}</span>
                      <span className="text-white font-mono text-xs">{orderId}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">{t("receipt_date")}</span>
                      <span className="text-white text-xs">{new Date().toLocaleString()}</span>
                    </div>
                    <div className="pt-2 border-t border-slate-700">
                      <p className="text-emerald-400 text-xs text-center font-medium">{t("receipt_status_complete")}</p>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => copyText(JSON.stringify({ orderId, recipient: recipientName, amount: confirmedAmount, currency: vaInfo?.currency }), "receipt")}
                  className="flex items-center justify-center gap-2 w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-2.5 rounded-xl transition-all text-xs"
                >
                  {copied === "receipt" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  {t("receipt_copy")}
                </button>
              </div>
            )}

            {error && (
              <div className="bg-red-900/20 border border-red-500/30 rounded-xl px-4 py-3 text-red-300 text-sm">
                {error}
              </div>
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

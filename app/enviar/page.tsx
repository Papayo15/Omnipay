"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { Zap, ArrowLeft, Send, Copy, Check, AlertCircle, Loader2, CheckCircle } from "lucide-react";
import { SEPA_COUNTRIES } from "@/lib/wise-accounts";

type Step = "form" | "sending" | "tos" | "kyc" | "instructions" | "error";

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


export default function EnviarPage() {
  const t    = useTranslations("enviar");
  const tF   = useTranslations("p2p");
  const router       = useRouter();
  const searchParams = useSearchParams();

  const [step, setStep] = useState<Step>("form");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [autoRetry, setAutoRetry] = useState(false);

  // Datos del emisor
  const [senderName, setSenderName]       = useState("");
  const [senderEmail, setSenderEmail]     = useState("");
  const [senderCurrency, setSenderCurrency] = useState("USD");

  // Datos del receptor — solo nombre y banco (sin KYC)
  const [recipientName, setRecipientName]       = useState("");
  const [recipientCountry, setRecipientCountry] = useState("MX");
  const [accountField, setAccountField]         = useState("");
  const [routingField, setRoutingField]         = useState("");
  const [bicField, setBicField]                 = useState("");
  const [amountTarget, setAmountTarget]         = useState("");

  // Post-submit state
  const [tosUrl, setTosUrl]               = useState("");
  const [tosCustomerId, setTosCustomerId] = useState("");
  const tosPopup     = useRef<Window | null>(null);
  const tosPollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [kycUrl, setKycUrl]               = useState("");
  const [kycCustomerId, setKycCustomerId] = useState("");
  const [isSandboxKyc, setIsSandboxKyc]   = useState(false);
  const [sandboxSimKyc, setSandboxSimKyc] = useState(false);
  const [kycPolling, setKycPolling]       = useState(false);
  const [kycLongReview, setKycLongReview] = useState(false);
  const kycPollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const kycPopup     = useRef<Window | null>(null);
  const [vaInfo, setVaInfo]               = useState<VaInfo | null>(null);
  const [orderId, setOrderId]             = useState("");
  const [confirmedAmount, setConfirmedAmount]   = useState(0);
  const [targetCurrency, setTargetCurrency]     = useState("MXN");
  const [destinationRail, setDestinationRail]   = useState("");

  const [feeQuote, setFeeQuote] = useState<{
    fx_rate: number; from_currency: string; target_currency: string;
    recipient_gets: number; bridge_fee: number; omnipay_fee: number;
    total_fee: number; sender_deposits: number;
  } | null>(null);
  const [feeLoading, setFeeLoading] = useState(false);
  const feeDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [sandboxDone, setSandboxDone]         = useState(false);
  const [sandboxAdvancing, setSandboxAdvancing] = useState(false);
  const [showSandboxBtn, setShowSandboxBtn]   = useState(false);
  const [railInfo, setRailInfo]               = useState<{ rail: string; eta_key: string } | null>(null);

  // Fetch active rail for selected destination country (respects BRIDGE_USE_FEDNOW etc.)
  useEffect(() => {
    if (!recipientCountry) return;
    fetch(`/api/bridge/rail-info?country=${recipientCountry}`)
      .then(r => r.json())
      .then(d => setRailInfo(d as { rail: string; eta_key: string }))
      .catch(() => {});
  }, [recipientCountry]);

  const isSepa   = SEPA_COUNTRIES.has(recipientCountry);
  const needsBic = isSepa;
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

  const MIN_LOCAL: Record<string, number> = {
    USD: 20, MXN: 380, BRL: 110, EUR: 19, GBP: 16,
    COP: 85_000, ARS: 20_000, CLP: 19_000, PEN: 75,
  };
  const quoteMinLocal  = feeQuote ? (MIN_LOCAL[feeQuote.target_currency] ?? 20) : 20;
  const quoteBelowMin  = feeQuote ? feeQuote.recipient_gets < quoteMinLocal : true;
  const quoteReady     = !!feeQuote && !feeLoading && !quoteBelowMin;

  const buildBody = useCallback(() => {
    const base: Record<string, unknown> = {
      sender_name:       senderName.trim(),
      sender_email:      senderEmail.trim().toLowerCase(),
      source_currency:   senderCurrency.toLowerCase(),
      recipient_name:    recipientName.trim(),
      recipient_country: recipientCountry,
      amount_target:     parseFloat(amountTarget),
      redirect_uri:      `${window.location.origin}/enviar?kyc_done=1`,
    };
    // Pass existing customer ID on retries so the route skips Bridge's eventually-consistent
    // email lookup — prevents a duplicate customer creation that re-triggers the ToS gate.
    if (tosCustomerId) base.existing_customer_id = tosCustomerId;
    else if (kycCustomerId) base.existing_customer_id = kycCustomerId;
    if (recipientCountry === "MX") return { ...base, clabe: accountField.trim() };
    if (recipientCountry === "GB") return { ...base, sort_code: accountField.split("/")[0]?.trim(), account_number: accountField.split("/")[1]?.trim() };
    if (isSepa) return { ...base, iban: accountField.trim(), bic: bicField.trim() };
    if (recipientCountry === "US") return { ...base, routing_number: routingField.trim(), account_number: accountField.trim() };
    return { ...base, routing_number: routingField.trim(), account_number: accountField.trim() };
  }, [senderName, senderEmail, senderCurrency, recipientName, recipientCountry, accountField, routingField, bicField, amountTarget, isSepa, tosCustomerId, kycCustomerId]);

  // Fee preview: debounce 600ms — fetch when amount/country/senderCurrency changes
  useEffect(() => {
    const val = parseFloat(amountTarget);
    if (!val || val <= 0) { setFeeQuote(null); return; }
    if (feeDebounce.current) clearTimeout(feeDebounce.current);
    feeDebounce.current = setTimeout(async () => {
      setFeeLoading(true);
      try {
        const qs = new URLSearchParams({
          from: senderCurrency, to: currency, amount: String(val), country: recipientCountry,
        });
        const res = await fetch(`/api/bridge/fx-quote?${qs}`);
        if (res.ok) setFeeQuote(await res.json());
        else setFeeQuote(null);
      } catch { setFeeQuote(null); }
      finally { setFeeLoading(false); }
    }, 600);
    return () => { if (feeDebounce.current) clearTimeout(feeDebounce.current); };
  }, [amountTarget, recipientCountry, currency, senderCurrency]);

  // Detect KYC return (?kyc_done=1) — restore form from sessionStorage and auto-retry
  useEffect(() => {
    if (searchParams.get("kyc_done") !== "1") return;
    if (kycPollTimer.current) clearInterval(kycPollTimer.current);
    setKycPolling(false);
    const saved = sessionStorage.getItem("enviar_form_state");
    if (!saved) return;
    try {
      const snap = JSON.parse(saved) as {
        senderName: string; senderEmail: string; senderCurrency: string;
        recipientName: string; recipientCountry: string;
        accountField: string; routingField: string; bicField: string; amountTarget: string;
      };
      setSenderName(snap.senderName ?? "");
      setSenderEmail(snap.senderEmail ?? "");
      setSenderCurrency(snap.senderCurrency ?? "USD");
      setRecipientName(snap.recipientName ?? "");
      setRecipientCountry(snap.recipientCountry ?? "MX");
      setAccountField(snap.accountField ?? "");
      setRoutingField(snap.routingField ?? "");
      setBicField(snap.bicField ?? "");
      setAmountTarget(snap.amountTarget ?? "");
      sessionStorage.removeItem("enviar_form_state");
      setAutoRetry(true);
    } catch { /* malformed snapshot — ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-retry after form restore or ToS/KYC completion
  useEffect(() => {
    if (!autoRetry) return;
    setAutoRetry(false);
    handleSubmit(true); // isAutoRetry=true: no popup opened (no user gesture here)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRetry]);

  // ToS polling — polls /api/bridge/tos-status every 3 s; when accepted, closes popup and retries.
  // Also detects when the popup navigates back to our domain (Bridge redirects after acceptance).
  useEffect(() => {
    if (step !== "tos") return;
    const finish = () => {
      if (tosPollTimer.current) { clearInterval(tosPollTimer.current); tosPollTimer.current = null; }
      if (tosPopup.current && !tosPopup.current.closed) { tosPopup.current.close(); tosPopup.current = null; }
      setAutoRetry(true);
    };
    tosPollTimer.current = setInterval(async () => {
      // Secondary check: if the popup has navigated to our origin (same-origin after Bridge redirect),
      // we know Bridge accepted the ToS and redirected back. Reading location is safe on same origin.
      try {
        const href = tosPopup.current?.location?.href ?? "";
        if (href && href !== "about:blank" && new URL(href).origin === window.location.origin) {
          finish(); return;
        }
      } catch { /* still on Bridge's cross-origin page — ignore */ }

      // Primary check: poll Bridge's tos_status via our API
      if (!tosCustomerId) return;
      try {
        const res  = await fetch(`/api/bridge/tos-status?customer_id=${tosCustomerId}`);
        const data = await res.json() as { accepted?: boolean; not_found?: boolean };
        if (data.accepted) { finish(); return; }
        if (data.not_found) {
          // Bridge eventual consistency — customer may not be propagated yet; keep polling silently.
          // Don't clear tosCustomerId — the backend uses email-fallback when this ID 404s.
        }
      } catch { /* keep polling */ }
    }, 2000);
    return () => { if (tosPollTimer.current) clearInterval(tosPollTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, tosCustomerId]);

  // KYC polling — checks Bridge every 2 s while user does KYC in a separate tab
  useEffect(() => {
    if (!kycPolling || !kycCustomerId) return;
    setKycLongReview(false);
    kycPollTimer.current = setInterval(async () => {
      // Same-origin detection: Bridge redirects popup to our domain after KYC
      try {
        const href = kycPopup.current?.location?.href ?? "";
        if (href && href !== "about:blank" && new URL(href).origin === window.location.origin) {
          if (kycPollTimer.current) { clearInterval(kycPollTimer.current); kycPollTimer.current = null; }
          if (kycPopup.current && !kycPopup.current.closed) { kycPopup.current.close(); kycPopup.current = null; }
          setKycPolling(false);
          setAutoRetry(true);
          return;
        }
      } catch { /* still cross-origin — ignore */ }

      try {
        const res  = await fetch(`/api/bridge/kyc-status?customer_id=${kycCustomerId}`);
        const data = await res.json() as { approved?: boolean; status?: string; not_found?: boolean };
        if (data.approved) {
          if (kycPollTimer.current) clearInterval(kycPollTimer.current);
          if (kycPopup.current && !kycPopup.current.closed) { kycPopup.current.close(); kycPopup.current = null; }
          setKycPolling(false);
          setAutoRetry(true);
        } else if (data.status === "under_review" || data.status === "pending") {
          if (kycPopup.current && !kycPopup.current.closed) { kycPopup.current.close(); kycPopup.current = null; }
          setKycLongReview(true);
        } else if (data.not_found) {
          // Bridge eventual consistency — keep polling silently; don't reset to form.
        }
      } catch { /* ignore — keep polling */ }
    }, 2000);
    return () => { if (kycPollTimer.current) clearInterval(kycPollTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kycPolling, kycCustomerId]);

  // Detect sandbox when entering instructions step
  useEffect(() => {
    if (step !== "instructions") return;
    fetch("/api/bridge/sandbox/advance?order_id=OP-PING")
      .then(r => { if (r.status !== 403) setShowSandboxBtn(true); })
      .catch(() => {});
  }, [step]);

  // Track: poll order status every 10s to detect completion
  useEffect(() => {
    if (step !== "instructions" || !orderId || sandboxDone) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      if (!active) return;
      try {
        const res = await fetch(`/api/bridge/track?order_id=${encodeURIComponent(orderId)}`);
        if (!res.ok || !active) return;
        const d = await res.json() as { status?: string };
        if (!active) return;
        if (d.status === "COMPLETED") { setSandboxDone(true); return; }
      } catch { /* silent — retry next tick */ }
      if (active) timer = setTimeout(poll, 10_000);
    };

    poll();
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [step, orderId, sandboxDone]);

  const handleSubmit = useCallback(async (isAutoRetry = false) => {
    setError("");
    setStep("sending");
    // Open placeholder popup BEFORE the fetch only when we're already mid-flow (resuming
    // after ToS/KYC — tosCustomerId or kycCustomerId is set). This avoids a blank popup
    // flash for already-registered users whose request succeeds on the first try.
    // Auto-retry calls (isAutoRetry=true) come from useEffect — no user gesture, skip it.
    let prePopup: Window | null = null;
    if (!isAutoRetry && (!tosPopup.current || tosPopup.current.closed)) {
      prePopup = window.open(
        "about:blank", "bridge_kyc_tos",
        "width=520,height=680,left=200,top=100,resizable=yes,scrollbars=yes",
      );
    }
    try {
      const res = await fetch("/api/bridge/send", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(buildBody()),
      });
      const data = await res.json() as {
        needs_tos?: boolean; tos_url?: string; customer_id?: string;
        needs_kyc?: boolean; kyc_url?: string;
        order_id?: string; deposit_instructions?: Record<string, unknown>;
        amount_target?: number; target_currency?: string; error?: string;
      };

      if (data.needs_tos && data.tos_url) {
        sessionStorage.setItem("enviar_form_state", JSON.stringify({
          senderName, senderEmail, senderCurrency,
          recipientName, recipientCountry, accountField, routingField, bicField, amountTarget,
        }));
        setTosUrl(data.tos_url);
        if (data.customer_id) setTosCustomerId(data.customer_id);
        // Navigate pre-popup to ToS URL (or open from button if auto-retry — see ToS step JSX)
        if (prePopup && !prePopup.closed) {
          prePopup.location.href = data.tos_url;
          tosPopup.current = prePopup;
          prePopup = null;
        } else if (!tosPopup.current || tosPopup.current.closed) {
          // This will be blocked on auto-retry — that's OK, the ToS step has a button for it
          tosPopup.current = window.open(
            data.tos_url, "bridge_kyc_tos",
            "width=520,height=680,left=200,top=100,resizable=yes,scrollbars=yes",
          );
        }
        setStep("tos");
        return;
      }
      // ToS confirmed by tos-status poll — popup already closed by polling useEffect
      if (tosPollTimer.current) { clearInterval(tosPollTimer.current); tosPollTimer.current = null; }
      if (tosPopup.current && !tosPopup.current.closed) { tosPopup.current.close(); tosPopup.current = null; }
      if (prePopup && !prePopup.closed) { prePopup.close(); prePopup = null; }

      if (data.needs_kyc) {
        sessionStorage.setItem("enviar_form_state", JSON.stringify({
          senderName, senderEmail, senderCurrency,
          recipientName, recipientCountry, accountField, routingField, bicField, amountTarget,
        }));
        const kycUrl2 = data.kyc_url ?? "";
        setKycUrl(kycUrl2);
        setKycCustomerId((data as Record<string, unknown>).customer_id as string ?? "");
        setIsSandboxKyc(!!(data as Record<string, unknown>).is_sandbox);
        // Navigate pre-popup to KYC URL only if we actually have one open (user gesture context).
        // On auto-retry there's no pre-popup; the KYC step JSX shows an "Abrir KYC" button instead.
        let kycPopupOpened = false;
        if (prePopup && !prePopup.closed && kycUrl2) {
          prePopup.location.href = kycUrl2;
          kycPopup.current = prePopup;
          prePopup = null;
          kycPopupOpened = true;
        }
        // Start polling if popup is open OR if this is an auto-retry (user just finished
        // Persona — same-origin detection fired, Bridge may take a moment to mark approved)
        if (kycPopupOpened || isAutoRetry) setKycPolling(true);
        setStep("kyc");
        return;
      }

      if (!res.ok || data.error) {
        if (prePopup && !prePopup.closed) prePopup.close();
        setError(data.error ?? "Error desconocido"); setStep("error"); return;
      }

      // Success — map deposit_instructions to VaInfo shape
      const di = (data.deposit_instructions ?? {}) as Record<string, string | null>;
      setVaInfo({
        bank_name:      di.bank_name ?? null,
        beneficiary:    di.beneficiary_name ?? null,
        routing_number: di.routing_number ?? null,
        account_number: di.account_number ?? null,
        iban:           di.iban ?? null,
        bic:            di.bic ?? null,
        sort_code:      di.sort_code ?? null,
        clabe:          di.clabe ?? null,
        pix:            di.br_code ?? null,
        currency:       di.currency ?? senderCurrency,
        payment_rail:   di.rail ?? null,
      });
      setConfirmedAmount(data.amount_target ?? parseFloat(amountTarget));
      setTargetCurrency(data.target_currency ?? "MXN");
      setDestinationRail((data as Record<string, unknown>).destination_rail as string ?? "");
      setOrderId(data.order_id ?? "");
      setStep("instructions");
      if (prePopup && !prePopup.closed) prePopup.close();
    } catch {
      if (prePopup && !prePopup.closed) prePopup.close();
      setError("Error de conexión. Verifica tu internet.");
      setStep("error");
    }
  }, [buildBody, senderName, senderEmail, senderCurrency, recipientName, recipientCountry, accountField, bicField, amountTarget]);

  const copyText = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  }, []);

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
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.back()} className="text-slate-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <Zap className="w-5 h-5 text-[#00C9C8]" />
          <span className="text-white font-bold">OmniPay</span>
        </div>

        {/* Macro step bar — visible desde el inicio */}
        {step !== "error" && (
          <div className="flex items-center mb-8">
            {[
              { key: "form",         label: t("step_datos") },
              { key: "kyc",          label: t("step_verificacion") },
              { key: "instructions", label: t("step_deposito") },
              { key: "done",         label: t("step_listo") },
            ].map(({ key, label }, i) => {
              const done   = (key === "form"         && (step === "kyc" || step === "instructions"))
                          || (key === "kyc"          && step === "instructions")
                          || (key === "instructions" && sandboxDone);
              const active = (key === "form"         && (step === "form" || step === "sending"))
                          || (key === "kyc"          && step === "kyc")
                          || (key === "instructions" && step === "instructions" && !sandboxDone)
                          || (key === "done"         && sandboxDone);
              return (
                <div key={key} className="flex items-center flex-1 last:flex-none">
                  <div className="flex flex-col items-center gap-1">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-500 ${
                      done   ? "bg-emerald-500"
                      : active ? "bg-[#00C9C8]"
                      : "bg-slate-800 border border-slate-700"
                    }`}>
                      {done
                        ? <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        : <span className={`text-[9px] font-bold ${active ? "text-slate-900" : "text-slate-500"}`}>{i + 1}</span>
                      }
                    </div>
                    <span className={`text-[9px] font-medium leading-none whitespace-nowrap ${
                      done ? "text-emerald-400" : active ? "text-white" : "text-slate-600"
                    }`}>{label}</span>
                  </div>
                  {i < 3 && (
                    <div className={`flex-1 h-px mx-1 mb-3.5 transition-all duration-500 ${done ? "bg-emerald-500" : "bg-slate-700"}`} />
                  )}
                </div>
              );
            })}
          </div>
        )}

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
              {/* Moneda de origen — en qué moneda depositará el emisor */}
              <div>
                <p className="text-slate-500 text-[10px] px-1 mb-1">{t("sender_currency_label")}</p>
                <select
                  value={senderCurrency}
                  onChange={e => setSenderCurrency(e.target.value)}
                  className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-emerald-500/60"
                >
                  <option value="USD">🇺🇸 USD — ACH / Wire</option>
                  <option value="EUR">🇪🇺 EUR — SEPA</option>
                  <option value="GBP">🇬🇧 GBP — Faster Payments</option>
                  <option value="MXN">🇲🇽 MXN — SPEI</option>
                  <option value="COP">🇨🇴 COP — Bre-B</option>
                  <option value="BRL" disabled>🇧🇷 BRL — PIX (próximamente)</option>
                </select>
              </div>
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
              <select
                value={recipientCountry}
                onChange={e => { setRecipientCountry(e.target.value); setAccountField(""); setRoutingField(""); setBicField(""); }}
                className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#00C9C8]/60"
              >
                {BRIDGE_COUNTRIES.map(c => (
                  <option key={c.code} value={c.code}>{c.flag} {tF(`country_${c.code}`)}</option>
                ))}
              </select>

              {/* Rail ETA hint — shows active rail incl. FedNow/SEPA Instant if enabled */}
              {railInfo && (
                <div className="flex items-center justify-between bg-slate-800/40 border border-slate-700/40 rounded-xl px-3 py-2">
                  <span className="text-slate-500 text-xs">{t("eta_label")}</span>
                  <span className="text-xs font-medium" style={{ color: ["spei","pix","fednow","sepa_instant"].includes(railInfo.rail) ? "#34d399" : ["fps","cop","wire"].includes(railInfo.rail) ? "#fbbf24" : "#94a3b8" }}>
                    {t(railInfo.eta_key as "eta_ach")}
                  </span>
                </div>
              )}

              {recipientCountry === "US" ? (
                <>
                  <input
                    type="text"
                    placeholder={tF("routing_label")}
                    value={routingField}
                    onChange={e => setRoutingField(e.target.value)}
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-[#00C9C8]/60 font-mono"
                  />
                  <input
                    type="text"
                    placeholder={tF("account_number_label")}
                    value={accountField}
                    onChange={e => setAccountField(e.target.value)}
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-[#00C9C8]/60 font-mono"
                  />
                </>
              ) : (
                <>
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
                </>
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

              {/* Fee calculator */}
              {feeLoading && (
                <div className="flex items-center gap-2 text-slate-500 text-xs px-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {t("fee_calculating")}
                </div>
              )}
              {feeQuote && !feeLoading && quoteBelowMin && (
                <div className="bg-red-900/20 border border-red-500/40 rounded-xl p-4 text-center">
                  <p className="text-red-400 text-sm font-semibold">
                    Monto mínimo: {quoteMinLocal.toLocaleString()} {feeQuote.target_currency}
                  </p>
                  <p className="text-slate-500 text-xs mt-1">Equivale a ≈ $20 USD</p>
                </div>
              )}
              {quoteReady && feeQuote && (
                <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4 space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">{t("fee_recipient_gets")}</span>
                    <span className="text-emerald-400 font-mono font-semibold">
                      {feeQuote.recipient_gets.toLocaleString()} {feeQuote.target_currency}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">{t("fee_fx_rate")}</span>
                    <span className="text-slate-300 font-mono">
                      1 {feeQuote.from_currency} = {feeQuote.fx_rate.toFixed(2)} {feeQuote.target_currency}
                    </span>
                  </div>
                  <div className="border-t border-slate-700/50 pt-2 space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">{t("fee_bridge")}</span>
                      <span className="text-slate-400 font-mono">
                        {feeQuote.bridge_fee.toFixed(2)} {feeQuote.from_currency}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">{t("fee_omnipay")}</span>
                      <span className="text-slate-400 font-mono">
                        {feeQuote.omnipay_fee.toFixed(2)} {feeQuote.from_currency}
                      </span>
                    </div>
                  </div>
                  <div className="border-t border-slate-700/50 pt-2 flex justify-between">
                    <span className="text-slate-300 text-xs font-medium">{t("fee_sender_deposits")}</span>
                    <span className="text-white font-bold font-mono text-sm">
                      {feeQuote.sender_deposits.toFixed(2)} {feeQuote.from_currency}
                    </span>
                  </div>
                  <p className="text-slate-600 text-[10px] leading-snug">{t("fee_note")}</p>
                </div>
              )}
            </div>

            {quoteReady && (
              <button
                onClick={() => handleSubmit(false)}
                disabled={!senderName || !senderEmail || !recipientName || !accountField || !amountTarget || (recipientCountry === "US" && !routingField)}
                className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-4 rounded-2xl transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4" />
                {t("cta")}
              </button>
            )}
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

        {/* ToS — Bridge terms of service */}
        {step === "tos" && (
          <div className="space-y-4">
            <div className="bg-blue-900/20 border border-blue-500/30 rounded-2xl p-5 space-y-3">
              <p className="text-blue-300 font-semibold text-sm">📋 Acepta los Términos de Bridge</p>
              <p className="text-slate-300 text-sm leading-relaxed">
                Bridge (el proveedor financiero que procesa la transferencia) requiere que aceptes sus Términos una sola vez.
              </p>
              <p className="text-slate-400 text-xs">Solo se hace una vez. Después de aceptar esta pantalla avanzará sola.</p>
            </div>
            <div className="flex items-center gap-2 text-slate-500 text-xs">
              <Loader2 className="w-3 h-3 animate-spin shrink-0" />
              <span>Verificando automáticamente…</span>
            </div>
            {/* Fallback: only shown if popup was blocked by the browser */}
            {(!tosPopup.current || tosPopup.current.closed) && tosUrl && (
              <button
                onClick={() => {
                  tosPopup.current = window.open(
                    tosUrl, "bridge_kyc_tos",
                    "width=520,height=680,left=200,top=100,resizable=yes,scrollbars=yes",
                  );
                }}
                className="text-blue-400 text-sm underline text-center"
              >
                ¿El popup fue bloqueado? Haz clic aquí para abrirlo
              </button>
            )}
            <button
              onClick={() => {
                if (tosPollTimer.current) { clearInterval(tosPollTimer.current); tosPollTimer.current = null; }
                if (tosPopup.current && !tosPopup.current.closed) { tosPopup.current.close(); tosPopup.current = null; }
                // Direct button click = user gesture → call handleSubmit(false) so KYC popup
                // can auto-open from this gesture context (avoids the isAutoRetry path)
                handleSubmit(false);
              }}
              className="w-full text-slate-400 text-sm hover:text-slate-200 transition-colors py-2 border border-slate-700/40 rounded-xl"
            >
              Ya acepté los términos → Continuar
            </button>
            <button onClick={() => {
              if (tosPollTimer.current) clearInterval(tosPollTimer.current);
              if (tosPopup.current && !tosPopup.current.closed) tosPopup.current.close();
              setStep("form");
            }} className="w-full text-slate-500 text-sm hover:text-slate-300 transition-colors py-2">
              ← Volver al formulario
            </button>
          </div>
        )}

        {/* KYC — emisor debe verificar identidad */}
        {step === "kyc" && (
          <div className="space-y-6">
            <div className="bg-blue-900/20 border border-blue-500/30 rounded-2xl p-5 space-y-3">
              <p className="text-blue-300 font-semibold text-sm">🔒 {t("kyc_title")}</p>
              <p className="text-slate-300 text-sm leading-relaxed">{t("kyc_body")}</p>
              <ul className="space-y-1 text-slate-400 text-xs">
                <li>✓ {t("kyc_li1")}</li>
                <li>✓ {t("kyc_li2")}</li>
                <li>✓ {t("kyc_li3")}</li>
              </ul>
            </div>

            {/* Sandbox: simulate KYC without a real Bridge redirect */}
            {isSandboxKyc ? (
              <button
                onClick={async () => {
                  if (!kycCustomerId) return;
                  setSandboxSimKyc(true);
                  try {
                    const res = await fetch("/api/bridge/sandbox/simulate-kyc", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ customer_id: kycCustomerId }),
                    });
                    const d = await res.json() as { ok?: boolean; error?: string };
                    if (d.ok) {
                      sessionStorage.setItem("enviar_form_state", sessionStorage.getItem("enviar_form_state") ?? "{}");
                      setAutoRetry(true);
                    } else {
                      setError(d.error ?? "Error simulando KYC");
                      setStep("error");
                    }
                  } catch {
                    setError("Error de conexión al simular KYC");
                    setStep("error");
                  } finally {
                    setSandboxSimKyc(false);
                  }
                }}
                disabled={sandboxSimKyc}
                className="w-full bg-purple-900/40 hover:bg-purple-800/60 border border-purple-500/30 disabled:opacity-50 text-purple-300 font-semibold py-4 rounded-2xl transition-all flex items-center justify-center gap-2"
              >
                {sandboxSimKyc ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                {t("sandbox_simulate_kyc")}
              </button>
            ) : kycPolling ? (
              /* Polling screen — shown while user is in Bridge KYC tab */
              <div className="space-y-4">
                {!kycLongReview ? (
                  <div className="bg-slate-800/60 border border-slate-600/40 rounded-2xl p-5 text-center space-y-3">
                    <Loader2 className="w-8 h-8 text-[#00C9C8] animate-spin mx-auto" />
                    <p className="text-white font-semibold text-sm">Verificando tu identidad en tiempo real...</p>
                    <p className="text-slate-400 text-xs">Completa la verificación en la ventana que se abrió. Esta pantalla avanzará sola cuando Bridge confirme tu identidad.</p>
                  </div>
                ) : (
                  <div className="bg-amber-900/20 border border-amber-500/30 rounded-2xl p-5 text-center space-y-2">
                    <p className="text-amber-300 font-semibold text-sm">Tu documento está en validación</p>
                    <p className="text-slate-300 text-xs leading-relaxed">Bridge está revisando tu identidad. Esta pantalla avanzará sola cuando quede aprobado.<br/>No cierres esta pestaña.</p>
                  </div>
                )}
                <button
                  onClick={() => { setKycPolling(false); setKycLongReview(false); }}
                  className="w-full text-slate-500 text-sm hover:text-slate-300 transition-colors py-2"
                >
                  ← Volver al formulario
                </button>
                <button
                  onClick={() => {
                    setKycPolling(false); setKycLongReview(false);
                    setTosCustomerId(""); setKycCustomerId(""); setKycUrl(""); setTosUrl("");
                    setSenderEmail(""); setStep("form");
                  }}
                  className="w-full text-red-500/60 text-xs hover:text-red-400 transition-colors py-1"
                >
                  Reiniciar prueba (nuevo usuario)
                </button>
              </div>
            ) : kycUrl ? (
              <button
                onClick={() => {
                  kycPopup.current = window.open(kycUrl, "bridge_kyc", "width=520,height=700,left=200,top=80,resizable=yes,scrollbars=yes");
                  setKycPolling(true);
                }}
                className="flex items-center justify-center gap-2 w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-2xl transition-all duration-200 active:scale-[0.98]"
              >
                {t("kyc_cta")}
              </button>
            ) : null}

            {!kycPolling && (
            <p className="text-slate-500 text-xs text-center leading-relaxed">
              {t("kyc_after")}
            </p>
            )}
            <button onClick={() => setStep("form")} className="w-full text-slate-500 text-sm hover:text-slate-300 transition-colors py-2">
              ← {t("back")}
            </button>
          </div>
        )}

        {/* INSTRUCTIONS — VA bancario listo para depositar */}
        {step === "instructions" && vaInfo && (
          <div className="space-y-6">

            {/* Instrucciones de depósito — se ocultan cuando ya se completó */}
            {!sandboxDone && (
              <>
                <div>
                  <h1 className="text-2xl font-bold text-white mb-1">{t("instructions_title")}</h1>
                  <p className="text-slate-400 text-sm">{t("instructions_body", { name: recipientName })}</p>
                </div>

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
                  <div className="mt-3 pt-3 border-t border-slate-700/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 text-xs">{t("va_recipient_gets")}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-400 font-bold text-lg font-mono">
                          {confirmedAmount.toLocaleString()} {targetCurrency.toUpperCase()}
                        </span>
                        <CopyButton text={String(confirmedAmount)} id="amount" label={t("copy")} />
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 text-xs">{t("va_deposit_currency")}</span>
                      <span className="text-slate-300 text-sm font-mono">
                        {(vaInfo.currency ?? "USD").toUpperCase()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* ETA badge — cuánto tarda en llegar al banco del receptor */}
                {destinationRail && (
                  <div className="flex items-center justify-between bg-slate-800/40 border border-slate-700/50 rounded-xl px-4 py-2.5">
                    <span className="text-slate-400 text-xs">{t("eta_label")}</span>
                    <span className="text-sm font-medium" style={{ color: ["spei","pix","fednow","sepa_instant"].includes(destinationRail) ? "#34d399" : ["fps","cop","wire"].includes(destinationRail) ? "#fbbf24" : "#94a3b8" }}>
                      {t(`eta_${destinationRail}` as "eta_ach")}
                    </span>
                  </div>
                )}

                <p className="text-slate-500 text-xs text-center leading-relaxed px-2">
                  {t("instructions_note")}
                </p>

                {/* Sandbox: botón para simular el pago */}
                {showSandboxBtn && orderId && (
                  <button
                    onClick={advanceSandbox}
                    disabled={sandboxAdvancing}
                    className="w-full bg-purple-800 hover:bg-purple-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-all text-sm flex items-center justify-center gap-2"
                  >
                    {sandboxAdvancing && <Loader2 className="w-4 h-4 animate-spin" />}
                    {t("sandbox_advance")}
                  </button>
                )}
              </>
            )}

            {/* Comprobante — solo después de completarse */}
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
                <p className="text-slate-500 text-[10px] text-center">
                  ✉️ {t("receipt_emails_sent")}
                </p>
                <button
                  onClick={async () => {
                    const receiptUrl = `${window.location.origin}/seguimiento?order_id=${orderId}`;
                    const shareData = { title: "Comprobante OmniPay", text: `Comprobante de envío a ${recipientName} — ${confirmedAmount.toLocaleString()} ${targetCurrency}`, url: receiptUrl };
                    if (typeof navigator !== "undefined" && "share" in navigator && navigator.canShare?.(shareData)) {
                      try { await navigator.share(shareData); } catch { /* cancelado */ }
                    } else {
                      copyText(`${window.location.origin}/seguimiento?order_id=${orderId}`, "receipt");
                    }
                  }}
                  className="flex items-center justify-center gap-2 w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-2.5 rounded-xl transition-all text-sm"
                >
                  {copied === "receipt" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  {t("receipt_share")}
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

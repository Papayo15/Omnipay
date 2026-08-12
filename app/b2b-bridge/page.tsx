"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Building2, ArrowLeft, CheckCircle2, Copy, Check, AlertCircle, Zap } from "lucide-react";

type Step = "form" | "loading" | "instructions" | "error";

interface DepositInstructions {
  rail:                string;
  currency:            string;
  bank_name?:          string;
  bank_address?:       string;
  routing_number?:     string;
  account_number?:     string;
  beneficiary_name?:   string;
  beneficiary_address?:string;
  iban?:               string;
  bic?:                string;
  account_holder?:     string;
  clabe?:              string;
  sort_code?:          string;
  amount_to_deposit:   string;
  instructions:        string;
}

interface FeeBreakdown {
  amount_principal: number;
  omnipay_service:  number;
  omnipay_flat:     number;
  kyb_surcharge:    number;
  is_new_customer:  boolean;
  total_to_send:    number;
  recipient_gets:   string;
}

interface B2BPayResponse {
  order_id:             string;
  deposit_instructions: DepositInstructions;
  fee_breakdown:        FeeBreakdown;
  recipient:            { name: string; country: string; method: string };
  needs_kyb?:           boolean;
  kyb_url?:             string | null;
  needs_tos?:           boolean;
  tos_url?:             string | null;
  is_sandbox?:          boolean;
  error?:               string;
}

const BITSO_ENABLED = process.env.NEXT_PUBLIC_BITSO_ENABLED === "true";

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(value).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div className="flex items-center justify-between gap-2 py-2 border-b border-slate-800 last:border-0">
      <div className="min-w-0">
        <p className="text-slate-500 text-[10px] uppercase tracking-wide">{label}</p>
        <p className="text-white text-sm font-mono break-all leading-snug mt-0.5">{value}</p>
      </div>
      <button onClick={copy} className="flex-shrink-0 p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors">
        {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} className="text-slate-400" />}
      </button>
    </div>
  );
}

export default function B2BBridgePage() {
  const t  = useTranslations("enviar_empresa_wire");
  const tE = useTranslations("enviar");

  const CURRENCIES = [
    { code: "usd", flag: "🇺🇸", label: "USD — ACH / Wire",                        active: true  },
    { code: "eur", flag: "🇪🇺", label: "EUR — SEPA",                              active: true  },
    { code: "gbp", flag: "🇬🇧", label: "GBP — Faster Payments",                   active: true  },
    { code: "mxn", flag: "🇲🇽", label: "MXN — SPEI",                              active: true  },
    { code: "cop", flag: "🇨🇴", label: "COP — Bre-B",                             active: true  },
    { code: "brl", flag: "🇧🇷", label: `BRL — PIX (${t("brl_coming_soon")})`,    active: false },
  ];

  const [token, setToken]                   = useState<string | null>(null);
  const [step, setStep]                     = useState<Step>("form");
  const [businessName, setBusinessName]     = useState("");
  const [email, setEmail]                   = useState("");
  const [currency, setCurrency]             = useState("usd");
  const [result, setResult]                 = useState<B2BPayResponse | null>(null);
  const [errorMsg, setErrorMsg]             = useState("");
  const [copiedAll, setCopiedAll]           = useState(false);
  const [sandboxAdvancing, setSandboxAdvancing] = useState(false);
  const [sandboxDone,      setSandboxDone]      = useState(false);
  const [trackStep,        setTrackStep]        = useState(1);
  const router = useRouter();

  useEffect(() => {
    const p    = new URLSearchParams(window.location.search);
    const tok  = p.get("t");
    const type = p.get("type");
    if (!tok || type !== "b2b") {
      window.location.href = "/b2b";
      return;
    }
    setToken(tok);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!token || !businessName.trim() || !email.includes("@")) return;
    setStep("loading");
    try {
      const isBitsoMxn = currency === "mxn" && BITSO_ENABLED;
      const endpoint   = isBitsoMxn ? "/api/bitso/checkout" : "/api/bridge/b2b/pay";
      const reqBody    = isBitsoMxn
        ? { token, sender_name: businessName.trim(), sender_email: email.toLowerCase().trim() }
        : { token, business_name: businessName.trim(), sender_email: email.toLowerCase().trim(), source_currency: currency };

      const res  = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reqBody),
      });
      const data = await res.json() as B2BPayResponse;
      if (res.status === 202) { setResult(data); setStep("instructions"); return; }
      if (!res.ok || data.error) {
        setErrorMsg(data.error ?? "Error procesando el pago");
        setStep("error");
        return;
      }
      setResult(data);
      setStep("instructions");
    } catch {
      setErrorMsg("Error de conexión. Intenta de nuevo.");
      setStep("error");
    }
  }, [token, businessName, email, currency]);

  const handleSandboxAdvance = useCallback(async () => {
    if (!result?.order_id) return;
    setSandboxAdvancing(true);
    try {
      const res = await fetch(`/api/bridge/sandbox/advance?order_id=${result.order_id}`);
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setErrorMsg(d.error ?? "Sandbox advance failed");
        setStep("error");
      } else {
        setSandboxDone(true);
      }
    } catch {
      setErrorMsg("Error al simular el pago en sandbox");
      setStep("error");
    } finally {
      setSandboxAdvancing(false);
    }
  }, [result]);

  // Track: poll Bridge order status every 10s while instructions are open
  useEffect(() => {
    const orderId = result?.order_id;
    if (step !== "instructions" || !orderId || sandboxDone) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      if (!active) return;
      try {
        const res = await fetch(`/api/bridge/track?order_id=${encodeURIComponent(orderId)}`);
        if (!res.ok || !active) return;
        const d = await res.json() as { step?: number; status?: string };
        if (!active) return;
        if (typeof d.step === "number" && d.step > 0) setTrackStep(d.step);
        if (d.status === "COMPLETED") { setSandboxDone(true); return; }
      } catch { /* silent */ }
      if (active) timer = setTimeout(poll, 10_000);
    };
    poll();
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [step, result?.order_id, sandboxDone]);

  function copyAll() {
    if (!result) return;
    const di = result.deposit_instructions;
    const lines = [
      `${t("wire_amount_label")}: ${di.amount_to_deposit} ${di.currency.toUpperCase()}`,
      di.routing_number   ? `Routing: ${di.routing_number}`        : null,
      di.account_number   ? `Account: ${di.account_number}`        : null,
      di.bank_name        ? `${t("wire_bank")}: ${di.bank_name}`   : null,
      di.beneficiary_name ? `${t("wire_beneficiary")}: ${di.beneficiary_name}` : null,
      di.iban             ? `${t("wire_iban")}: ${di.iban}`        : null,
      di.bic              ? `${t("wire_swift")}: ${di.bic}`        : null,
      di.clabe            ? `CLABE: ${di.clabe}`                   : null,
      di.sort_code        ? `Sort code: ${di.sort_code}`           : null,
      `\nRef: ${result.order_id}`,
    ].filter(Boolean).join("\n");
    navigator.clipboard.writeText(lines).catch(() => {});
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  }

  if (!token) {
    return (
      <main className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <Zap className="w-8 h-8 text-[#00C9C8] animate-pulse" />
      </main>
    );
  }

  // ── ERROR ──────────────────────────────────────────────────────────────────
  if (step === "error") {
    return (
      <main className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center px-6 text-center gap-5">
        <AlertCircle className="w-14 h-14 text-red-400" />
        <h2 className="text-xl font-semibold text-white">Error</h2>
        <p className="text-slate-400 text-sm max-w-xs whitespace-pre-wrap">{errorMsg}</p>
        <button onClick={() => setStep("form")} className="text-[#00C9C8] text-sm underline mt-2">
          {t("error_back")}
        </button>
      </main>
    );
  }

  // ── LOADING ────────────────────────────────────────────────────────────────
  if (step === "loading") {
    return (
      <main className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center gap-4">
        <div className="w-10 h-10 border-2 border-[#00C9C8] border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-400 text-sm">{t("loading")}</p>
      </main>
    );
  }

  // ── INSTRUCTIONS ───────────────────────────────────────────────────────────
  if (step === "instructions" && result) {
    const di  = result.deposit_instructions;
    const fee = result.fee_breakdown;

    return (
      <main className="min-h-screen bg-[#0f172a] flex flex-col pb-10 max-w-sm mx-auto w-full px-5">
        <div className="pt-8 pb-4 flex items-center gap-2">
          <Building2 className="w-5 h-5 text-[#00C9C8]" />
          <span className="text-white font-bold">OmniPay B2B</span>
          <span className="ml-auto text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">via Bridge</span>
        </div>

        <div className="flex items-center gap-2 mb-4">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          <div>
            <p className="text-white font-semibold text-sm">{t("instructions_ready")}</p>
            <p className="text-slate-500 text-xs">{t("order_ref")} {result.order_id}</p>
          </div>
        </div>

        {/* KYB banner */}
        {result.needs_kyb && result.kyb_url && (
          <div className="bg-amber-900/30 border border-amber-500/40 rounded-xl p-4 mb-4">
            <p className="text-amber-400 text-xs font-semibold mb-1">{t("kyb_title")}</p>
            <p className="text-slate-400 text-xs mb-2">{t("kyb_body")}</p>
            <a href={result.kyb_url} target="_blank" rel="noopener noreferrer"
              className="block text-center bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold py-2 px-4 rounded-lg transition-colors">
              {t("kyb_verify_cta")}
            </a>
          </div>
        )}

        {/* ToS banner */}
        {result.needs_tos && result.tos_url && (
          <div className="bg-blue-900/30 border border-blue-500/40 rounded-xl p-4 mb-4">
            <p className="text-blue-400 text-xs font-semibold mb-1">{t("tos_title")}</p>
            <p className="text-slate-400 text-xs mb-2">{t("tos_body")}</p>
            <a href={result.tos_url} target="_blank" rel="noopener noreferrer"
              className="block text-center bg-blue-500 hover:bg-blue-400 text-white text-xs font-bold py-2 px-4 rounded-lg transition-colors">
              {t("tos_cta")}
            </a>
          </div>
        )}

        {/* Deposit instructions */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-slate-500 text-[10px] uppercase tracking-wide">{t("instructions_rail")} {di.rail}</p>
            <button onClick={copyAll}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors bg-slate-700 hover:bg-slate-600 px-2 py-1 rounded-lg">
              {copiedAll
                ? <><Check size={12} className="text-emerald-400" /> {t("copied")}</>
                : <><Copy size={12} /> {t("copy_all")}</>}
            </button>
          </div>

          <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-lg px-3 py-2 mb-3">
            <p className="text-slate-400 text-[10px] uppercase tracking-wide">{t("amount_transfer_label")}</p>
            <p className="text-emerald-400 text-xl font-bold font-mono">{di.amount_to_deposit} {di.currency.toUpperCase()}</p>
            <p className="text-slate-500 text-[10px] mt-0.5">{t("amount_exact_note")}</p>
          </div>

          {di.routing_number      && <CopyField label="Routing number (ABA)"  value={di.routing_number} />}
          {di.account_number      && <CopyField label="Account number"         value={di.account_number} />}
          {di.bank_name           && <CopyField label={t("wire_bank")}         value={di.bank_name} />}
          {di.beneficiary_name    && <CopyField label={t("wire_beneficiary")}  value={di.beneficiary_name} />}
          {di.beneficiary_address && <CopyField label="Dirección beneficiario" value={di.beneficiary_address} />}
          {di.iban                && <CopyField label={t("wire_iban")}         value={di.iban} />}
          {di.bic                 && <CopyField label={t("wire_swift")}        value={di.bic} />}
          {di.account_holder      && <CopyField label="Titular de cuenta"      value={di.account_holder} />}
          {di.clabe               && <CopyField label="CLABE"                  value={di.clabe} />}
          {di.sort_code           && <CopyField label="Sort code"              value={di.sort_code} />}
        </div>

        {/* Fee breakdown */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 mb-4 text-xs space-y-1.5">
          <p className="text-slate-500 uppercase tracking-wide text-[10px] mb-2">{t("fee_title")}</p>
          <div className="flex justify-between text-slate-300">
            <span>{t("fee_principal")}</span>
            <span className="font-mono">${fee.amount_principal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>{t("fee_service")}</span>
            <span className="font-mono">+ ${fee.omnipay_service.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>{t("fee_flat")}</span>
            <span className="font-mono">+ ${fee.omnipay_flat.toFixed(2)}</span>
          </div>
          {fee.kyb_surcharge > 0 && (
            <div className="flex justify-between text-slate-400">
              <span>{t("fee_kyb_label")}</span>
              <span className="font-mono">+ ${fee.kyb_surcharge.toFixed(2)}</span>
            </div>
          )}
          <div className="border-t border-slate-700 pt-1.5 flex justify-between font-semibold text-white">
            <span>{t("fee_total")}</span>
            <span className="font-mono text-[#00C9C8]">${fee.total_to_send.toFixed(2)} {di.currency.toUpperCase()}</span>
          </div>
          <div className="flex justify-between text-emerald-400 font-semibold pt-0.5">
            <span>{t("fee_recipient")}</span>
            <span className="font-mono">{fee.recipient_gets}</span>
          </div>
        </div>

        {/* Single-use CLABE notice (Bitso) vs Bridge timeline */}
        {di.beneficiary_name === "OmniPay / Bitso" ? (
          <div className="bg-amber-900/20 border border-amber-500/30 rounded-xl px-4 py-3 mb-4">
            <p className="text-amber-400 text-xs font-semibold mb-1">{t("clabe_notice_title")}</p>
            <p className="text-slate-400 text-xs leading-relaxed">{t("clabe_notice_body")}</p>
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-4 mb-4">
            <p className="text-white text-xs font-semibold mb-2">{t("delivery_title")}</p>
            <div className="flex items-center gap-2 text-slate-400 text-xs">
              <span className="text-[#00C9C8]">⚡</span>
              <span>{t("delivery_via")}</span>
            </div>
            <p className="text-slate-600 text-[10px] mt-2">{t("delivery_vs")}</p>
          </div>
        )}

        {/* Progress tracker — shown while transfer is pending */}
        {!sandboxDone && (() => {
          const steps = [tE("track_step1"), tE("track_step2"), tE("track_step3"), tE("track_step4")];
          return (
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4 space-y-2.5 mb-4">
              <p className="text-slate-400 text-[10px] font-medium uppercase tracking-widest mb-1">{tE("track_title")}</p>
              {steps.map((label, i) => {
                const s = i + 1;
                const done   = trackStep > s;
                const active = trackStep === s;
                return (
                  <div key={s} className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-500 ${done ? "bg-emerald-500" : active ? "bg-[#00C9C8]" : "bg-slate-700"}`}>
                      {done ? (
                        <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                          <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      ) : (
                        <span className="text-[8px] font-bold text-white">{s}</span>
                      )}
                    </div>
                    <span className={`text-xs transition-colors duration-300 ${done ? "text-emerald-400" : active ? "text-white font-medium" : "text-slate-500"}`}>
                      {label}
                      {active && <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-[#00C9C8] animate-pulse align-middle" />}
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* Inline receipt — shown when COMPLETED */}
        {sandboxDone && (
          <div className="space-y-3 mb-4">
            <div className="bg-slate-800/80 border border-emerald-500/40 rounded-2xl overflow-hidden">
              <div className="bg-emerald-600/20 px-5 py-3 border-b border-emerald-500/20 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="text-emerald-400 font-semibold text-sm">{tE("receipt_title")}</span>
              </div>
              <div className="px-5 py-4 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">{tE("receipt_to")}</span>
                  <span className="text-white font-medium">{result.recipient.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">{tE("receipt_country")}</span>
                  <span className="text-white">{result.recipient.country}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">{tE("receipt_amount")}</span>
                  <span className="text-white font-mono font-bold">{result.fee_breakdown.recipient_gets}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">{tE("receipt_ref")}</span>
                  <span className="text-white font-mono text-xs">{result.order_id}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">{tE("receipt_date")}</span>
                  <span className="text-white text-xs">{new Date().toLocaleString()}</span>
                </div>
                <div className="pt-2 border-t border-slate-700">
                  <p className="text-emerald-400 text-xs text-center font-medium">{tE("receipt_status_complete")}</p>
                </div>
              </div>
            </div>
            <p className="text-slate-500 text-[10px] text-center">✉️ {tE("receipt_emails_sent")}</p>
            <button
              onClick={async () => {
                const shareUrl = `${window.location.origin}/seguimiento?order_id=${result.order_id}`;
                const shareData = { title: "Comprobante OmniPay", text: `Comprobante B2B — ${result.fee_breakdown.recipient_gets}`, url: shareUrl };
                if (typeof navigator !== "undefined" && "share" in navigator && navigator.canShare?.(shareData)) {
                  try { await navigator.share(shareData); } catch { /* cancelled */ }
                } else {
                  navigator.clipboard.writeText(shareUrl).catch(() => {});
                }
              }}
              className="flex items-center justify-center gap-2 w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-2.5 rounded-xl transition-all text-sm"
            >
              <Copy className="w-3 h-3" />{tE("receipt_share")}
            </button>
          </div>
        )}

        {!sandboxDone && (
          <button
            onClick={() => router.push(`/seguimiento?order_id=${result.order_id}`)}
            className="w-full bg-emerald-600 hover:bg-emerald-500 active:scale-95 transition-all text-white font-bold py-4 rounded-2xl text-sm flex items-center justify-center gap-2 mb-4"
          >
            <CheckCircle2 className="w-5 h-5" />
            {t("transfer_done")}
          </button>
        )}

        {result.is_sandbox && !sandboxDone && (
          <button
            onClick={handleSandboxAdvance}
            disabled={sandboxAdvancing}
            className="w-full border border-yellow-500/50 bg-yellow-500/10 hover:bg-yellow-500/20 active:scale-95 disabled:opacity-40 transition-all text-yellow-400 font-semibold py-3 rounded-2xl text-xs mb-4"
          >
            {sandboxAdvancing ? t("sandbox_simulating") : t("sandbox_simulate")}
          </button>
        )}

        <p className="text-slate-600 text-[10px] text-center pb-2">
          {t("order_ref")} {result.order_id}
        </p>
        <p className="text-slate-700 text-[10px] text-center">
          {t("prefer_stripe")}{" "}
          <a href="/b2b" className="text-slate-500 underline">{t("stripe_link")}</a>
        </p>
      </main>
    );
  }

  // ── FORM ───────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-[#0f172a] flex flex-col pb-10 max-w-sm mx-auto w-full px-5">
      <div className="pt-8 pb-6">
        <button onClick={() => window.history.back()}
          className="flex items-center gap-1 text-slate-400 hover:text-white text-sm mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> {t("back")}
        </button>
        <div className="flex items-center gap-2 mb-1">
          <Building2 className="w-5 h-5 text-[#00C9C8]" />
          <span className="text-white font-bold">OmniPay B2B</span>
          <span className="ml-2 text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">via Bridge</span>
        </div>
        <h1 className="text-white font-bold text-xl mt-4 mb-1">{t("form_title")}</h1>
        <p className="text-slate-400 text-sm">{t("form_subtitle")}</p>
      </div>

      <div className="space-y-4 flex-1">
        <div>
          <label className="block text-xs text-slate-400 mb-1">{t("form_name_label")}</label>
          <input value={businessName} onChange={(e) => setBusinessName(e.target.value)}
            placeholder={t("form_name_placeholder")}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-[#00C9C8] text-sm" />
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1">{t("form_email_label")}</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="pagos@empresa.com" inputMode="email" type="email"
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-[#00C9C8] text-sm" />
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1">{t("form_currency_label")}</label>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#00C9C8] text-sm">
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code} disabled={!c.active}>{c.flag} {c.label}</option>
            ))}
          </select>
        </div>

        <button
          onClick={handleSubmit}
          disabled={!businessName.trim() || !email.includes("@")}
          className="w-full bg-[#00C9C8] hover:bg-[#00b3b2] active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-black font-bold py-4 rounded-2xl text-sm mt-2">
          {t("form_cta")}
        </button>

        <div className="bg-slate-800/40 border border-slate-700 rounded-xl px-4 py-3">
          <p className="text-slate-500 text-[11px] font-semibold mb-1.5">{t("form_why_title")}</p>
          <ul className="space-y-1">
            <li className="text-slate-500 text-[11px] flex gap-2"><span className="text-emerald-500">✓</span>{t("form_why_1")}</li>
            <li className="text-slate-500 text-[11px] flex gap-2"><span className="text-emerald-500">✓</span>{t("form_why_2")}</li>
            <li className="text-slate-500 text-[11px] flex gap-2"><span className="text-emerald-500">✓</span>{t("form_why_3")}</li>
          </ul>
        </div>

        <p className="text-center text-xs text-slate-600 pb-4">
          {t("prefer_stripe")}{" "}
          <a href="/b2b" className="text-slate-500 underline">{t("stripe_link")}</a>
        </p>
      </div>
    </main>
  );
}

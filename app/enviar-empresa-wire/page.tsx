"use client";

import { useState, useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { Zap, ArrowLeft, Building2, Copy, Check, AlertCircle, Loader2, CheckCircle } from "lucide-react";
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

type Step = "form" | "submitting" | "kyb" | "instructions" | "error";

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

interface FormSnapshot {
  senderBusinessName: string;
  senderEmail:        string;
  sourceCurrency:     string;
  recipientBusinessName: string;
  recipientCountry:   string;
  accountField:       string;
  bicField:           string;
  amount:             string;
}

export default function EnviarEmpresaWirePage() {
  const t  = useTranslations("enviar_empresa_wire");
  const tF = useTranslations("p2p");
  const router       = useRouter();
  const searchParams = useSearchParams();

  const [step, setStep]   = useState<Step>("form");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [autoRetry, setAutoRetry] = useState(false);

  // Sender (Bridge customer — KYB'd)
  const [senderBusinessName, setSenderBusinessName] = useState("");
  const [senderEmail, setSenderEmail]               = useState("");
  const [sourceCurrency, setSourceCurrency]         = useState("USD");

  // Recipient bank details (External Account only)
  const [recipientBusinessName, setRecipientBusinessName] = useState("");
  const [recipientCountry, setRecipientCountry]           = useState("MX");
  const [accountField, setAccountField] = useState("");
  const [bicField, setBicField]         = useState("");
  const [amount, setAmount]             = useState("");

  // KYB state
  const [kybUrl, setKybUrl]               = useState("");
  const [kybCustomerId, setKybCustomerId] = useState("");
  const [isSandboxKyb, setIsSandboxKyb]   = useState(false);
  const [sandboxSimKyb, setSandboxSimKyb] = useState(false);

  // Instructions state
  const [vaInfo, setVaInfo]               = useState<VaInfo | null>(null);
  const [confirmedAmount, setConfirmedAmount] = useState(0);
  const [targetCurrency, setTargetCurrency]   = useState("MXN");
  const [orderId, setOrderId]             = useState("");
  const [sandboxDone, setSandboxDone]         = useState(false);
  const [sandboxAdvancing, setSandboxAdvancing] = useState(false);
  const [showSandboxBtn, setShowSandboxBtn]   = useState(false);

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

  const recipientCurrency = recipientCountry === "MX" ? "MXN" : recipientCountry === "GB" ? "GBP"
    : recipientCountry === "CO" ? "COP" : recipientCountry === "US" ? "USD" : "EUR";

  const minLocalAmount: Record<string, number> = {
    USD: 50, MXN: 900, EUR: 47, GBP: 40, COP: 210000, BRL: 280,
  };
  const minLocal = minLocalAmount[recipientCurrency] ?? 50;

  // Detect return from Bridge KYB — restore form + auto-retry
  useEffect(() => {
    if (searchParams.get("kyb_done") !== "1") return;
    const savedRaw = sessionStorage.getItem("b2b_send_form");
    if (!savedRaw) return;
    try {
      const snap = JSON.parse(savedRaw) as FormSnapshot;
      setSenderBusinessName(snap.senderBusinessName ?? "");
      setSenderEmail(snap.senderEmail ?? "");
      setSourceCurrency(snap.sourceCurrency ?? "USD");
      setRecipientBusinessName(snap.recipientBusinessName ?? "");
      setRecipientCountry(snap.recipientCountry ?? "MX");
      setAccountField(snap.accountField ?? "");
      setBicField(snap.bicField ?? "");
      setAmount(snap.amount ?? "");
      sessionStorage.removeItem("b2b_send_form");
      setAutoRetry(true);
      window.history.replaceState({}, "", "/enviar-empresa-wire");
    } catch { /* malformed snapshot */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fire auto-retry after state is populated
  useEffect(() => {
    if (!autoRetry) return;
    setAutoRetry(false);
    handleSubmit();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRetry]);

  const buildBody = useCallback(() => {
    const base = {
      sender_business_name:    senderBusinessName.trim(),
      sender_email:            senderEmail.trim().toLowerCase(),
      source_currency:         sourceCurrency.toLowerCase(),
      recipient_business_name: recipientBusinessName.trim(),
      recipient_country:       recipientCountry,
      amount_target:           parseFloat(amount),
      redirect_uri:            `${window.location.origin}/enviar-empresa-wire?kyb_done=1`,
    };
    if (recipientCountry === "MX") return { ...base, clabe: accountField.trim() };
    if (recipientCountry === "GB") return { ...base, sort_code: accountField.split("/")[0]?.trim(), account_number: accountField.split("/")[1]?.trim() };
    if (isSepa) return { ...base, iban: accountField.trim(), bic: bicField.trim() };
    if (recipientCountry === "CO") return { ...base, account_number: accountField.trim() };
    return { ...base, routing_number: accountField.split("/")[0]?.trim(), account_number: accountField.split("/")[1]?.trim() };
  }, [senderBusinessName, senderEmail, sourceCurrency, recipientBusinessName, recipientCountry, accountField, bicField, amount, isSepa]);

  const handleSubmit = useCallback(async () => {
    setStep("submitting");
    setError("");
    try {
      const res = await fetch("/api/bridge/b2b/send", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(buildBody()),
      });
      const data = await res.json() as {
        needs_tos?: boolean; tos_url?: string;
        needs_kyb?: boolean; kyb_url?: string; customer_id?: string; is_sandbox?: boolean;
        deposit_instructions?: Record<string, string | null>;
        amount_target?: number; target_currency?: string;
        order_id?: string; error?: string;
      };

      if (data.needs_tos && data.tos_url) {
        sessionStorage.setItem("b2b_send_form", JSON.stringify({
          senderBusinessName, senderEmail, sourceCurrency,
          recipientBusinessName, recipientCountry, accountField, bicField, amount,
        }));
        window.location.href = data.tos_url;
        return;
      }

      if (data.needs_kyb) {
        sessionStorage.setItem("b2b_send_form", JSON.stringify({
          senderBusinessName, senderEmail, sourceCurrency,
          recipientBusinessName, recipientCountry, accountField, bicField, amount,
        }));
        setKybUrl(data.kyb_url ?? "");
        setKybCustomerId(data.customer_id ?? "");
        setIsSandboxKyb(!!data.is_sandbox);
        setStep("kyb");
        return;
      }

      if (!res.ok || data.error) { setError(data.error ?? "Error desconocido"); setStep("error"); return; }

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
        currency:       di.currency ?? sourceCurrency,
        payment_rail:   di.rail ?? null,
      });
      setConfirmedAmount(data.amount_target ?? parseFloat(amount));
      setTargetCurrency(data.target_currency ?? recipientCurrency);
      setOrderId(data.order_id ?? "");
      setStep("instructions");
    } catch (e) {
      setError((e as Error).message ?? "Error de conexión");
      setStep("error");
    }
  }, [buildBody, senderBusinessName, senderEmail, sourceCurrency, recipientBusinessName, recipientCountry, accountField, bicField, amount, recipientCurrency]);

  const simulateKyb = useCallback(async () => {
    if (!kybCustomerId) return;
    setSandboxSimKyb(true);
    try {
      const res = await fetch("/api/bridge/sandbox/simulate-kyc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customer_id: kybCustomerId, type: "business" }),
      });
      const d = await res.json() as { ok?: boolean; error?: string };
      if (d.ok) {
        setAutoRetry(true);
      } else {
        setError(d.error ?? "Error simulando KYB");
        setStep("error");
      }
    } catch {
      setError("Error de conexión al simular KYB");
      setStep("error");
    } finally {
      setSandboxSimKyb(false);
    }
  }, [kybCustomerId]);

  // Detect sandbox when entering instructions step
  useEffect(() => {
    if (step !== "instructions") return;
    fetch("/api/bridge/sandbox/advance?order_id=OP-PING")
      .then(r => { if (r.status !== 403) setShowSandboxBtn(true); })
      .catch(() => {});
  }, [step]);

  // Poll order status every 10s to detect completion
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
      } catch { /* silent */ }
      if (active) timer = setTimeout(poll, 10_000);
    };
    poll();
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [step, orderId, sandboxDone]);

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

  const copyText = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  }, []);

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

  const isValid = senderBusinessName && senderEmail.includes("@") && recipientBusinessName && accountField
    && amount && parseFloat(amount) >= minLocal;

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
          <span className="ml-auto text-[10px] text-slate-500 uppercase tracking-widest">Wire · B2B</span>
        </div>

        {/* FORM */}
        {step === "form" && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-white mb-1">{t("title")}</h1>
              <p className="text-slate-400 text-sm">{t("subtitle")}</p>
            </div>

            {/* Sender — tu empresa */}
            <div className="space-y-3">
              <p className="text-slate-400 text-xs uppercase tracking-widest">{t("section_sender")}</p>
              <input type="text" placeholder={t("sender_business")} value={senderBusinessName}
                onChange={e => setSenderBusinessName(e.target.value)}
                className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-emerald-500/60" />
              <input type="email" placeholder={t("sender_email")} value={senderEmail}
                onChange={e => setSenderEmail(e.target.value)}
                className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-emerald-500/60" />
              <div>
                <p className="text-slate-500 text-[10px] px-1 mb-1">{t("source_currency")}</p>
                <select value={sourceCurrency} onChange={e => setSourceCurrency(e.target.value)}
                  className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-emerald-500/60">
                  <option value="USD">🇺🇸 USD — ACH / Wire</option>
                  <option value="EUR">🇪🇺 EUR — SEPA</option>
                  <option value="GBP">🇬🇧 GBP — Faster Payments</option>
                  <option value="MXN">🇲🇽 MXN — SPEI</option>
                  <option value="COP">🇨🇴 COP — Bre-B</option>
                </select>
              </div>
            </div>

            {/* Recipient */}
            <div className="space-y-3">
              <p className="text-slate-400 text-xs uppercase tracking-widest">{t("section_recipient")}</p>
              <input type="text" placeholder={t("recipient_business")} value={recipientBusinessName}
                onChange={e => setRecipientBusinessName(e.target.value)}
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
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-mono">{recipientCurrency}</span>
              </div>
              <p className="text-slate-500 text-[10px] px-1">
                {t("min_amount", { amount: minLocal.toLocaleString(), currency: recipientCurrency })}
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

        {/* KYB — empresa emisora necesita verificación */}
        {step === "kyb" && (
          <div className="space-y-6">
            <div className="bg-blue-900/20 border border-blue-500/30 rounded-2xl p-5 space-y-3">
              <p className="text-blue-300 font-semibold text-sm">🔒 {t("kyb_title")}</p>
              <p className="text-slate-300 text-sm leading-relaxed">{t("kyb_body")}</p>
            </div>

            {/* Sandbox: simulate KYB with one click */}
            {isSandboxKyb ? (
              <button onClick={simulateKyb} disabled={sandboxSimKyb}
                className="w-full bg-purple-900/40 hover:bg-purple-800/60 border border-purple-500/30 disabled:opacity-50 text-purple-300 font-semibold py-4 rounded-2xl transition-all flex items-center justify-center gap-2">
                {sandboxSimKyb ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                {t("sandbox_simulate_kyb")}
              </button>
            ) : kybUrl ? (
              <a href={kybUrl}
                className="flex items-center justify-center gap-2 w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-2xl transition-all duration-200 active:scale-[0.98]">
                {t("kyb_cta")}
              </a>
            ) : null}

            <p className="text-slate-500 text-xs text-center leading-relaxed">{t("kyb_after")}</p>
            <button onClick={() => setStep("form")} className="w-full text-slate-500 text-sm hover:text-slate-300 transition-colors py-2">
              ← {t("back")}
            </button>
          </div>
        )}

        {/* INSTRUCTIONS — VA bancario listo */}
        {step === "instructions" && vaInfo && (
          <div className="space-y-6">
            <div className="flex flex-col items-center gap-3 pt-2">
              <div className="w-14 h-14 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <CheckCircle className="w-7 h-7 text-emerald-400" />
              </div>
              <div className="text-center">
                <h1 className="text-xl font-bold text-white mb-1">{t("instructions_title")}</h1>
                <p className="text-slate-400 text-sm">{t("instructions_subtitle", { name: recipientBusinessName })}</p>
              </div>
            </div>

            <div className="bg-slate-800/60 border border-emerald-500/20 rounded-2xl p-5 space-y-0">
              {vaInfo.bank_name    && <VaRow label={t("va_bank")}      value={vaInfo.bank_name}    copyId="bank" />}
              {vaInfo.beneficiary  && <VaRow label={t("va_beneficiary")} value={vaInfo.beneficiary} copyId="bene" />}
              {vaInfo.routing_number && <VaRow label={t("va_routing")} value={vaInfo.routing_number} copyId="routing" />}
              {vaInfo.account_number && <VaRow label={t("va_account")} value={vaInfo.account_number} copyId="account" />}
              {vaInfo.iban         && <VaRow label={t("va_iban")}      value={vaInfo.iban}          copyId="iban" />}
              {vaInfo.bic          && <VaRow label="BIC / SWIFT"       value={vaInfo.bic}          copyId="bic" />}
              {vaInfo.sort_code    && <VaRow label="Sort Code"          value={vaInfo.sort_code}    copyId="sort" />}
              {vaInfo.clabe        && <VaRow label="CLABE"              value={vaInfo.clabe}        copyId="clabe" />}
              <div className="mt-3 pt-3 border-t border-slate-700/50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-xs">{t("va_recipient_gets")}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-400 font-bold text-lg font-mono">
                      {confirmedAmount.toLocaleString()} {targetCurrency.toUpperCase()}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-xs">{t("va_deposit_currency")}</span>
                  <span className="text-slate-300 text-sm font-mono">{(vaInfo.currency ?? sourceCurrency).toUpperCase()}</span>
                </div>
                {orderId && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 text-xs">Ref</span>
                    <span className="text-slate-400 text-xs font-mono">{orderId}</span>
                  </div>
                )}
              </div>
            </div>

            <p className="text-slate-500 text-xs text-center leading-relaxed px-2">{t("instructions_note")}</p>

            {/* Sandbox: simulate payment button */}
            {showSandboxBtn && orderId && !sandboxDone && (
              <button
                onClick={advanceSandbox}
                disabled={sandboxAdvancing}
                className="w-full flex items-center justify-center gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 transition-colors rounded-xl py-3 text-sm font-medium disabled:opacity-50"
              >
                {sandboxAdvancing
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Zap className="w-4 h-4" />}
                {sandboxAdvancing ? t("sandbox_simulating") : t("sandbox_simulate_payment")}
              </button>
            )}

            {/* Sandbox receipt */}
            {sandboxDone && (
              <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-2xl p-5 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle className="w-5 h-5 text-emerald-400" />
                  <span className="text-emerald-400 font-semibold text-sm">{t("sandbox_payment_done")}</span>
                </div>
                <div className="space-y-2 text-xs font-mono">
                  <div className="flex justify-between">
                    <span className="text-slate-400">{t("va_beneficiary")}</span>
                    <span className="text-slate-200">{recipientBusinessName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">{t("va_recipient_gets")}</span>
                    <span className="text-emerald-400 font-bold">{confirmedAmount.toLocaleString()} {targetCurrency.toUpperCase()}</span>
                  </div>
                  {orderId && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Ref</span>
                      <span className="text-slate-400">{orderId}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-slate-400">{t("receipt_date")}</span>
                    <span className="text-slate-300">{new Date().toLocaleDateString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">{t("receipt_status")}</span>
                    <span className="text-emerald-400 font-semibold">{t("receipt_completed")}</span>
                  </div>
                </div>
              </div>
            )}

            <button onClick={() => setStep("form")}
              className="w-full text-slate-500 text-sm hover:text-slate-300 transition-colors py-2">
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

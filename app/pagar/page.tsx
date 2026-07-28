"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Zap, ArrowLeft, CheckCircle2, Copy, Check, AlertCircle } from "lucide-react";

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
  br_code?:            string;
  sort_code?:          string;
  amount_to_deposit:   string;
  instructions:        string;
}

interface FeeBreakdown {
  amount_principal: number;
  bridge_onramp:    number;
  bridge_offramp:   number;
  omnipay_service:  number;
  omnipay_flat:     number;
  kyc_surcharge:    number;
  is_new_customer:  boolean;
  total_to_send:    number;
  recipient_gets:   string;
}

interface PayResponse {
  order_id:             string;
  deposit_instructions: DepositInstructions;
  fee_breakdown:        FeeBreakdown;
  recipient:            { name: string; country: string; method: string };
  needs_kyc:            boolean;
  kyc_url?:             string | null;
  error?:               string;
  bridge_details?:      unknown;
}

interface RatePreview {
  source_currency: string;
  target_currency: string;
  recipient_gets:  number;
  amount_to_pay:   number;
  rate:            number | null;
}

// All Bridge Virtual Account source currencies. Labels resolved via t(`currency_${code}`).
// USD always available. EUR/GBP/MXN/BRL require Bridge account enablement (requested via support).
const CURRENCIES = [
  { code: "usd", flag: "🇺🇸" },
  { code: "eur", flag: "🇪🇺" },
  { code: "gbp", flag: "🇬🇧" },
  { code: "mxn", flag: "🇲🇽" },
  { code: "brl", flag: "🇧🇷" },
];

// Rail → i18n key suffix (normalized)
function railKey(rail: string): string {
  const r = rail.toLowerCase();
  if (r.includes("spei"))  return "spei";
  if (r.includes("pix"))   return "pix";
  if (r.includes("sepa"))  return "sepa";
  if (r.includes("faster") || r.includes("fps")) return "fps";
  return "ach";
}

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


export default function PagarPage() {
  const t = useTranslations("pagar_bridge");
  const [token, setToken]             = useState<string | null>(null);
  const [step,  setStep]              = useState<Step>("form");
  const [name,  setName]              = useState("");
  const [email, setEmail]             = useState("");
  const [phone, setPhone]             = useState("");
  const [currency, setCurrency]       = useState("usd");
  const [result, setResult]           = useState<PayResponse | null>(null);
  const [errorMsg, setErrorMsg]       = useState("");
  const [copiedAll, setCopiedAll]     = useState(false);
  const [ratePreview, setRatePreview] = useState<RatePreview | null>(null);
  const [rateLoading, setRateLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const t = p.get("t");
    const type = p.get("type");
    if (!t || type !== "p2p") {
      window.location.href = "/";
      return;
    }
    setToken(t);
  }, []);

  // Fetch rate preview whenever token + currency changes
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setRateLoading(true);
    fetch(`/api/bridge/rate?token=${encodeURIComponent(token)}&currency=${currency}`)
      .then((r) => r.json())
      .then((d: RatePreview) => { if (!cancelled) setRatePreview(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setRateLoading(false); });
    return () => { cancelled = true; };
  }, [token, currency]);

  const handleSubmit = useCallback(async () => {
    if (!token || !name.trim() || !email.includes("@")) return;
    setStep("loading");
    try {
      const res = await fetch("/api/bridge/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          sender_name:     name.trim(),
          sender_email:    email.toLowerCase().trim(),
          source_currency: currency,
          sender_phone:    phone.trim() || undefined,
        }),
      });
      const data = await res.json() as PayResponse;
      // 202 = KYC required before VA can be created
      if (res.status === 202 && data.needs_kyc) {
        setResult(data);
        setStep("instructions"); // instructions screen shows KYC banner
        return;
      }
      if (!res.ok || data.error) {
        // Clean message for currency-not-enabled — no raw JSON
        const detail = (data as { currency_not_enabled?: string }).currency_not_enabled
          ? ""
          : data.bridge_details ? "\n" + JSON.stringify(data.bridge_details, null, 2) : "";
        setErrorMsg((data.error ?? t("error_payment")) + detail);
        setStep("error");
        return;
      }
      setResult(data);
      setStep("instructions");
    } catch {
      setErrorMsg(t("error_connection"));
      setStep("error");
    }
  }, [token, name, email, currency, phone]);

  function copyAll() {
    if (!result) return;
    const di = result.deposit_instructions;
    const lines = [
      `Monto a depositar: ${di.amount_to_deposit} ${di.currency.toUpperCase()}`,
      di.routing_number   ? `Routing number: ${di.routing_number}`  : null,
      di.account_number   ? `Account number: ${di.account_number}`  : null,
      di.bank_name        ? `Banco: ${di.bank_name}`                : null,
      di.beneficiary_name ? `Beneficiario: ${di.beneficiary_name}`  : null,
      di.iban             ? `IBAN: ${di.iban}`                      : null,
      di.bic              ? `BIC/SWIFT: ${di.bic}`                  : null,
      di.clabe            ? `CLABE: ${di.clabe}`                    : null,
      di.br_code          ? `PIX/BR Code: ${di.br_code}`            : null,
      di.sort_code        ? `Sort code: ${di.sort_code}`            : null,
      `\nRef de orden: ${result.order_id}`,
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
        <h2 className="text-xl font-semibold text-white">{t("error_title")}</h2>
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
    const rk  = railKey(di.rail);

    return (
      <main className="min-h-screen bg-[#0f172a] flex flex-col pb-10 max-w-sm mx-auto w-full px-5">
        <div className="pt-8 pb-4 flex items-center gap-2">
          <Zap className="w-5 h-5 text-[#00C9C8]" />
          <span className="text-white font-bold">OmniPay</span>
        </div>

        <div className="flex items-center gap-2 mb-4">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          <div>
            <p className="text-white font-semibold text-sm">{t("instructions_ready")}</p>
            <p className="text-slate-500 text-xs">Ref: {result.order_id}</p>
          </div>
        </div>

        {/* KYC banner */}
        {result.needs_kyc && result.kyc_url && (
          <div className="bg-amber-900/30 border border-amber-500/40 rounded-xl p-4 mb-4">
            <p className="text-amber-400 text-xs font-semibold mb-1">{t("kyc_required_title")}</p>
            <p className="text-slate-400 text-xs mb-2">{t("kyc_required_body")}</p>
            <a href={result.kyc_url} target="_blank" rel="noopener noreferrer"
              className="block text-center bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold py-2 px-4 rounded-lg transition-colors">
              {t("kyc_verify_button")}
            </a>
          </div>
        )}

        {/* Deposit instructions */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-slate-500 text-[10px] uppercase tracking-wide">{t("deposit_via").replace("{rail}", di.rail)}</p>
            <button onClick={copyAll}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors bg-slate-700 hover:bg-slate-600 px-2 py-1 rounded-lg">
              {copiedAll ? <><Check size={12} className="text-emerald-400" /> {t("copied")}</> : <><Copy size={12} /> {t("copy_all")}</>}
            </button>
          </div>

          {/* Amount */}
          <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-lg px-3 py-2 mb-3">
            <p className="text-slate-400 text-[10px] uppercase tracking-wide">{t("amount_label")}</p>
            <p className="text-emerald-400 text-xl font-bold font-mono">{di.amount_to_deposit} {di.currency.toUpperCase()}</p>
            <p className="text-slate-500 text-[10px] mt-0.5">{t("amount_note")}</p>
          </div>

          {di.routing_number      && <CopyField label="Routing number (ABA)"    value={di.routing_number} />}
          {di.account_number      && <CopyField label="Account number"           value={di.account_number} />}
          {di.bank_name           && <CopyField label={t("field_bank")}          value={di.bank_name} />}
          {di.beneficiary_name    && <CopyField label={t("field_beneficiary")}   value={di.beneficiary_name} />}
          {di.beneficiary_address && <CopyField label={t("field_beneficiary_address")} value={di.beneficiary_address} />}
          {di.iban                && <CopyField label="IBAN"                     value={di.iban} />}
          {di.bic                 && <CopyField label="BIC / SWIFT"              value={di.bic} />}
          {di.account_holder      && <CopyField label={t("field_account_holder")} value={di.account_holder} />}
          {di.clabe               && <CopyField label="CLABE"                    value={di.clabe} />}
          {di.br_code             && <CopyField label="Chave PIX / BR Code"      value={di.br_code} />}
          {di.sort_code           && <CopyField label="Sort code"                value={di.sort_code} />}
        </div>

        {/* Fee breakdown */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 mb-4 text-xs space-y-1.5">
          <p className="text-slate-500 uppercase tracking-wide text-[10px] mb-2">{t("fee_title")}</p>
          <div className="flex justify-between text-slate-300"><span>{t("fee_principal")}</span><span className="font-mono">${fee.amount_principal.toFixed(2)}</span></div>
          <div className="flex justify-between text-slate-400"><span>{t("fee_onramp")}</span><span className="font-mono">+ ${fee.bridge_onramp.toFixed(2)}</span></div>
          <div className="flex justify-between text-slate-400"><span>{t("fee_offramp")}</span><span className="font-mono">+ ${fee.bridge_offramp.toFixed(2)}</span></div>
          <div className="flex justify-between text-slate-400"><span>{t("fee_service")}</span><span className="font-mono">+ ${fee.omnipay_service.toFixed(2)}</span></div>
          <div className="flex justify-between text-slate-400"><span>{t("fee_flat")}</span><span className="font-mono">+ ${fee.omnipay_flat.toFixed(2)}</span></div>
          {fee.kyc_surcharge > 0 && (
            <div className="flex justify-between text-slate-400">
              <span>{t("fee_kyc")}</span>
              <span className="font-mono">+ ${fee.kyc_surcharge.toFixed(2)}</span>
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

        {/* Rail-specific instructions */}
        <div className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-4 mb-4 space-y-3">
          <p className="text-white text-xs font-semibold">{t("how_to_send")}</p>
          <div className="flex gap-3 items-start">
            <span className="text-[#00C9C8] font-bold text-sm w-5 flex-shrink-0">1</span>
            <div>
              <p className="text-slate-400 text-xs leading-relaxed">{t(`instructions_${rk}`)}</p>
              {rk === "ach" && (
                <p className="text-slate-600 text-xs mt-1">{t("canada_note")}</p>
              )}
            </div>
          </div>
          <div className="flex gap-3 items-start">
            <span className="text-[#00C9C8] font-bold text-sm w-5 flex-shrink-0">2</span>
            <p className="text-slate-400 text-xs leading-relaxed"
              dangerouslySetInnerHTML={{ __html: t("step2_exact")
                .replace("{amount}", `<strong class="text-white">${di.amount_to_deposit}</strong>`)
                .replace("{currency}", `<strong class="text-white">${di.currency.toUpperCase()}</strong>`) }} />
          </div>
          <div className="flex gap-3 items-start">
            <span className="text-[#00C9C8] font-bold text-sm w-5 flex-shrink-0">3</span>
            <p className="text-slate-400 text-xs leading-relaxed"
              dangerouslySetInnerHTML={{ __html: t("step3_recipient")
                .replace("{name}", `<strong class="text-white">${result.recipient.name}</strong>`)
                .replace("{amount}", `<strong class="text-white">${fee.recipient_gets}</strong>`) }} />
          </div>
        </div>

        {/* "Ya realicé la transferencia" button */}
        <button
          onClick={() => router.push(`/seguimiento?order_id=${result.order_id}`)}
          className="w-full bg-emerald-600 hover:bg-emerald-500 active:scale-95 transition-all text-white font-bold py-4 rounded-2xl text-sm flex items-center justify-center gap-2 mb-4"
        >
          <CheckCircle2 className="w-5 h-5" />
          {t("confirm_sent")}
        </button>

        <p className="text-slate-600 text-[10px] text-center pb-2">
          {t("footer_ref").replace("{order_id}", result.order_id)}
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
          <ArrowLeft className="w-4 h-4" /> {t("form_back")}
        </button>
        <div className="flex items-center gap-2 mb-1">
          <Zap className="w-5 h-5 text-[#00C9C8]" />
          <span className="text-white font-bold">OmniPay</span>
        </div>
        <h1 className="text-white font-bold text-xl mt-4 mb-1">{t("form_title")}</h1>
        <p className="text-slate-400 text-sm">{t("form_subtitle")}</p>
      </div>

      <div className="space-y-4 flex-1">
        <div>
          <label className="block text-xs text-slate-400 mb-1">{t("form_name_label")}</label>
          <input value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Juan Pérez"
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-[#00C9C8] text-sm" />
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1">{t("form_email_label")}</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@email.com" inputMode="email" type="email"
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-[#00C9C8] text-sm" />
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1">{t("form_currency_label")}</label>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#00C9C8] text-sm">
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>{c.flag} {t(`currency_${c.code}`)}</option>
            ))}
          </select>

          {/* Rate preview */}
          {ratePreview && !rateLoading && (
            <div className="mt-2 bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2">
              {ratePreview.rate && (
                <p className="text-slate-400 text-[11px]">
                  {t("rate_preview")
                    .replace("{src}", ratePreview.source_currency)
                    .replace("{rate}", ratePreview.rate.toLocaleString())
                    .replace("{tgt}", ratePreview.target_currency)}
                </p>
              )}
              <p className="text-[#00C9C8] text-xs font-semibold mt-0.5">
                {t("amount_preview")
                  .replace("{amount}", ratePreview.amount_to_pay.toFixed(2))
                  .replace("{src}", ratePreview.source_currency)
                  .replace("{target}", `${ratePreview.recipient_gets.toLocaleString()} ${ratePreview.target_currency}`)}
              </p>
            </div>
          )}
          {rateLoading && (
            <p className="mt-2 text-slate-500 text-[11px] px-1 animate-pulse">{t("form_rate_loading")}</p>
          )}
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1">{t("form_phone_label")}</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)}
            placeholder="+1 416 555 0123" inputMode="tel"
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-[#00C9C8] text-sm" />
        </div>

        <button
          onClick={handleSubmit}
          disabled={!name.trim() || !email.includes("@")}
          className="w-full bg-[#00C9C8] hover:bg-[#00b3b2] active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-black font-bold py-4 rounded-2xl text-sm mt-2">
          {t("submit")}
        </button>

        <p className="text-center text-xs text-slate-600 pb-4">
          {t("form_trust")}
        </p>
      </div>
    </main>
  );
}

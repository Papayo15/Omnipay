"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
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

// Bitso Canal 4 enabled when env var is set — MXN via SPEI to Bitso CLABE
const BITSO_ENABLED = process.env.NEXT_PUBLIC_BITSO_ENABLED === "true";

// MXN always shown — routes to Bitso when enabled, Bridge otherwise.
const CURRENCIES = [
  { code: "usd", flag: "🇺🇸", label: "USD — US Dollar" },
  { code: "eur", flag: "🇪🇺", label: "EUR — Euro" },
  { code: "gbp", flag: "🇬🇧", label: "GBP — British Pound" },
  { code: "mxn", flag: "🇲🇽", label: "MXN — Peso Mexicano" },
  { code: "brl", flag: "🇧🇷", label: "BRL — Real Brasileiro" },
];

// isSandbox is now read from the API response (result.is_sandbox) — not a client env var

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
  const [token, setToken]             = useState<string | null>(null);
  const [step, setStep]               = useState<Step>("form");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail]             = useState("");
  const [currency, setCurrency]       = useState("usd");
  const [result, setResult]           = useState<B2BPayResponse | null>(null);
  const [errorMsg, setErrorMsg]       = useState("");
  const [copiedAll, setCopiedAll]     = useState(false);
  const [sandboxAdvancing, setSandboxAdvancing] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const p    = new URLSearchParams(window.location.search);
    const t    = p.get("t");
    const type = p.get("type");
    if (!t || type !== "b2b") {
      window.location.href = "/b2b";
      return;
    }
    setToken(t);
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

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reqBody),
      });
      const data = await res.json() as B2BPayResponse;
      if (res.status === 202) {
        setResult(data);
        setStep("instructions");
        return;
      }
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
        router.push(`/seguimiento?order_id=${result.order_id}`);
      }
    } catch {
      setErrorMsg("Error al simular el pago en sandbox");
      setStep("error");
    } finally {
      setSandboxAdvancing(false);
    }
  }, [result, router]);

  function copyAll() {
    if (!result) return;
    const di = result.deposit_instructions;
    const lines = [
      `Monto: ${di.amount_to_deposit} ${di.currency.toUpperCase()}`,
      di.routing_number   ? `Routing: ${di.routing_number}`       : null,
      di.account_number   ? `Account: ${di.account_number}`       : null,
      di.bank_name        ? `Banco: ${di.bank_name}`              : null,
      di.beneficiary_name ? `Beneficiario: ${di.beneficiary_name}`: null,
      di.iban             ? `IBAN: ${di.iban}`                    : null,
      di.bic              ? `BIC/SWIFT: ${di.bic}`                : null,
      di.clabe            ? `CLABE: ${di.clabe}`                  : null,
      di.sort_code        ? `Sort code: ${di.sort_code}`          : null,
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
          Volver al formulario
        </button>
      </main>
    );
  }

  // ── LOADING ────────────────────────────────────────────────────────────────
  if (step === "loading") {
    return (
      <main className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center gap-4">
        <div className="w-10 h-10 border-2 border-[#00C9C8] border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-400 text-sm">Configurando cuenta empresarial…</p>
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
            <p className="text-white font-semibold text-sm">Instrucciones de transferencia listas</p>
            <p className="text-slate-500 text-xs">Ref: {result.order_id}</p>
          </div>
        </div>

        {/* KYB banner */}
        {result.needs_kyb && result.kyb_url && (
          <div className="bg-amber-900/30 border border-amber-500/40 rounded-xl p-4 mb-4">
            <p className="text-amber-400 text-xs font-semibold mb-1">Verificación empresarial requerida (KYB)</p>
            <p className="text-slate-400 text-xs mb-2">Tu empresa debe completar la verificación de Bridge antes de procesar pagos internacionales.</p>
            <a href={result.kyb_url} target="_blank" rel="noopener noreferrer"
              className="block text-center bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold py-2 px-4 rounded-lg transition-colors">
              Verificar empresa →
            </a>
          </div>
        )}

        {/* ToS banner */}
        {result.needs_tos && result.tos_url && (
          <div className="bg-blue-900/30 border border-blue-500/40 rounded-xl p-4 mb-4">
            <p className="text-blue-400 text-xs font-semibold mb-1">Acepta los Términos de Bridge</p>
            <p className="text-slate-400 text-xs mb-2">Tu empresa debe aceptar los términos antes de continuar.</p>
            <a href={result.tos_url} target="_blank" rel="noopener noreferrer"
              className="block text-center bg-blue-500 hover:bg-blue-400 text-white text-xs font-bold py-2 px-4 rounded-lg transition-colors">
              Aceptar Términos →
            </a>
          </div>
        )}

        {/* Deposit instructions */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-slate-500 text-[10px] uppercase tracking-wide">Instrucciones {di.rail}</p>
            <button onClick={copyAll}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors bg-slate-700 hover:bg-slate-600 px-2 py-1 rounded-lg">
              {copiedAll ? <><Check size={12} className="text-emerald-400" /> Copiado</> : <><Copy size={12} /> Copiar todo</>}
            </button>
          </div>

          <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-lg px-3 py-2 mb-3">
            <p className="text-slate-400 text-[10px] uppercase tracking-wide">Monto a transferir</p>
            <p className="text-emerald-400 text-xl font-bold font-mono">{di.amount_to_deposit} {di.currency.toUpperCase()}</p>
            <p className="text-slate-500 text-[10px] mt-0.5">Transfiere el monto exacto</p>
          </div>

          {di.routing_number      && <CopyField label="Routing number (ABA)"    value={di.routing_number} />}
          {di.account_number      && <CopyField label="Account number"           value={di.account_number} />}
          {di.bank_name           && <CopyField label="Banco"                    value={di.bank_name} />}
          {di.beneficiary_name    && <CopyField label="Beneficiario"             value={di.beneficiary_name} />}
          {di.beneficiary_address && <CopyField label="Dirección beneficiario"   value={di.beneficiary_address} />}
          {di.iban                && <CopyField label="IBAN"                     value={di.iban} />}
          {di.bic                 && <CopyField label="BIC / SWIFT"              value={di.bic} />}
          {di.account_holder      && <CopyField label="Titular de cuenta"        value={di.account_holder} />}
          {di.clabe               && <CopyField label="CLABE"                    value={di.clabe} />}
          {di.sort_code           && <CopyField label="Sort code"                value={di.sort_code} />}
        </div>

        {/* Fee breakdown */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 mb-4 text-xs space-y-1.5">
          <p className="text-slate-500 uppercase tracking-wide text-[10px] mb-2">Desglose de comisión</p>
          <div className="flex justify-between text-slate-300"><span>Principal</span><span className="font-mono">${fee.amount_principal.toFixed(2)}</span></div>
          <div className="flex justify-between text-slate-400"><span>Servicio OmniPay (0.50%)</span><span className="font-mono">+ ${fee.omnipay_service.toFixed(2)}</span></div>
          <div className="flex justify-between text-slate-400"><span>Tarifa fija</span><span className="font-mono">+ ${fee.omnipay_flat.toFixed(2)}</span></div>
          {fee.kyb_surcharge > 0 && (
            <div className="flex justify-between text-slate-400"><span>KYB empresarial (1ª vez)</span><span className="font-mono">+ ${fee.kyb_surcharge.toFixed(2)}</span></div>
          )}
          <div className="border-t border-slate-700 pt-1.5 flex justify-between font-semibold text-white">
            <span>Total a transferir</span>
            <span className="font-mono text-[#00C9C8]">${fee.total_to_send.toFixed(2)} {di.currency.toUpperCase()}</span>
          </div>
          <div className="flex justify-between text-emerald-400 font-semibold pt-0.5">
            <span>Receptor recibe</span>
            <span className="font-mono">{fee.recipient_gets}</span>
          </div>
        </div>

        {/* Single-use CLABE notice (Bitso) vs Bridge timeline */}
        {di.beneficiary_name === "OmniPay / Bitso" ? (
          <div className="bg-amber-900/20 border border-amber-500/30 rounded-xl px-4 py-3 mb-4">
            <p className="text-amber-400 text-xs font-semibold mb-1">CLABE de un solo uso</p>
            <p className="text-slate-400 text-xs leading-relaxed">Esta CLABE es exclusiva para esta transferencia. Para un nuevo envío, genera un nuevo link de pago.</p>
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-4 mb-4">
            <p className="text-white text-xs font-semibold mb-2">Tiempo estimado de entrega</p>
            <div className="flex items-center gap-2 text-slate-400 text-xs">
              <span className="text-[#00C9C8]">⚡</span>
              <span>1-2 días hábiles vía Bridge</span>
            </div>
            <p className="text-slate-600 text-[10px] mt-2">vs. 4-5 días con Stripe + Wise · Sin cargo de tarjeta</p>
          </div>
        )}

        <button
          onClick={() => router.push(`/seguimiento?order_id=${result.order_id}`)}
          className="w-full bg-emerald-600 hover:bg-emerald-500 active:scale-95 transition-all text-white font-bold py-4 rounded-2xl text-sm flex items-center justify-center gap-2 mb-4"
        >
          <CheckCircle2 className="w-5 h-5" />
          Ya realicé la transferencia
        </button>

        {result.is_sandbox && (
          <button
            onClick={handleSandboxAdvance}
            disabled={sandboxAdvancing}
            className="w-full border border-yellow-500/50 bg-yellow-500/10 hover:bg-yellow-500/20 active:scale-95 disabled:opacity-40 transition-all text-yellow-400 font-semibold py-3 rounded-2xl text-xs mb-4"
          >
            {sandboxAdvancing ? "Simulando…" : "⚡ Simular pago (sandbox)"}
          </button>
        )}

        <p className="text-slate-600 text-[10px] text-center pb-2">
          Ref. orden: {result.order_id}
        </p>
        <p className="text-slate-700 text-[10px] text-center">
          ¿Prefieres pagar con tarjeta?{" "}
          <a href="/b2b" className="text-slate-500 underline">B2B Stripe →</a>
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
          <ArrowLeft className="w-4 h-4" /> Volver
        </button>
        <div className="flex items-center gap-2 mb-1">
          <Building2 className="w-5 h-5 text-[#00C9C8]" />
          <span className="text-white font-bold">OmniPay B2B</span>
          <span className="ml-2 text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">via Bridge</span>
        </div>
        <h1 className="text-white font-bold text-xl mt-4 mb-1">Pago empresarial internacional</h1>
        <p className="text-slate-400 text-sm">Transferencia wire directa · 1-2 días · Sin cargo de tarjeta</p>
      </div>

      <div className="space-y-4 flex-1">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Nombre de la empresa</label>
          <input value={businessName} onChange={(e) => setBusinessName(e.target.value)}
            placeholder="Acme Corp S.A. de C.V."
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-[#00C9C8] text-sm" />
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1">Email de la empresa</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="pagos@empresa.com" inputMode="email" type="email"
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-[#00C9C8] text-sm" />
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1">Moneda de origen</label>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#00C9C8] text-sm">
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>{c.flag} {c.label}</option>
            ))}
          </select>
        </div>

        <button
          onClick={handleSubmit}
          disabled={!businessName.trim() || !email.includes("@")}
          className="w-full bg-[#00C9C8] hover:bg-[#00b3b2] active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-black font-bold py-4 rounded-2xl text-sm mt-2">
          Obtener instrucciones de wire
        </button>

        <div className="bg-slate-800/40 border border-slate-700 rounded-xl px-4 py-3">
          <p className="text-slate-500 text-[11px] font-semibold mb-1.5">¿Por qué Bridge en lugar de Stripe?</p>
          <ul className="space-y-1">
            <li className="text-slate-500 text-[11px] flex gap-2"><span className="text-emerald-500">✓</span>1-2 días (vs 4-5 con Wise)</li>
            <li className="text-slate-500 text-[11px] flex gap-2"><span className="text-emerald-500">✓</span>Sin cargo de tarjeta (2.9%)</li>
            <li className="text-slate-500 text-[11px] flex gap-2"><span className="text-emerald-500">✓</span>Tasa de cambio real (sin markup FX)</li>
          </ul>
        </div>

        <p className="text-center text-xs text-slate-600 pb-4">
          ¿Prefieres pagar con tarjeta?{" "}
          <a href="/b2b" className="text-slate-500 underline">B2B Stripe →</a>
        </p>
      </div>
    </main>
  );
}

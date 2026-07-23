"use client";

import { useEffect, useState, useCallback } from "react";
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

const CURRENCIES = [
  { code: "usd", label: "USD — Dólares americanos",    flag: "🇺🇸" },
  { code: "eur", label: "EUR — Euros",                  flag: "🇪🇺" },
  { code: "gbp", label: "GBP — Libras esterlinas",     flag: "🇬🇧" },
  { code: "mxn", label: "MXN — Pesos mexicanos",       flag: "🇲🇽" },
  { code: "brl", label: "BRL — Reales brasileños",     flag: "🇧🇷" },
];

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
  const [token, setToken]           = useState<string | null>(null);
  const [step,  setStep]            = useState<Step>("form");
  const [name,  setName]            = useState("");
  const [email, setEmail]           = useState("");
  const [phone, setPhone]           = useState("");
  const [currency, setCurrency]     = useState("usd");
  const [result, setResult]         = useState<PayResponse | null>(null);
  const [errorMsg, setErrorMsg]     = useState("");
  const [copiedAll, setCopiedAll]   = useState(false);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const t = p.get("t");
    const type = p.get("type");
    if (!t || type !== "p2p") {
      // Not a P2P link — redirect to home
      window.location.href = "/";
      return;
    }
    setToken(t);
  }, []);

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
      if (!res.ok || data.error) {
        const detail = data.bridge_details ? "\n" + JSON.stringify(data.bridge_details, null, 2) : "";
        setErrorMsg((data.error ?? "Error al procesar el pago") + detail);
        setStep("error");
        return;
      }
      setResult(data);
      setStep("instructions");
    } catch {
      setErrorMsg("Error de conexión. Intenta de nuevo.");
      setStep("error");
    }
  }, [token, name, email, currency, phone]);

  function copyAll() {
    if (!result) return;
    const di = result.deposit_instructions;
    const lines = [
      `Monto a depositar: ${di.amount_to_deposit} ${di.currency.toUpperCase()}`,
      di.routing_number  ? `Routing number: ${di.routing_number}` : null,
      di.account_number  ? `Account number: ${di.account_number}` : null,
      di.bank_name       ? `Banco: ${di.bank_name}` : null,
      di.beneficiary_name ? `Beneficiario: ${di.beneficiary_name}` : null,
      di.iban            ? `IBAN: ${di.iban}` : null,
      di.bic             ? `BIC/SWIFT: ${di.bic}` : null,
      di.clabe           ? `CLABE: ${di.clabe}` : null,
      di.br_code         ? `PIX/BR Code: ${di.br_code}` : null,
      di.sort_code       ? `Sort code: ${di.sort_code}` : null,
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
        <h2 className="text-xl font-semibold text-white">Algo salió mal</h2>
        <p className="text-slate-400 text-sm max-w-xs">{errorMsg}</p>
        <button onClick={() => setStep("form")} className="text-[#00C9C8] text-sm underline mt-2">
          ← Volver al formulario
        </button>
      </main>
    );
  }

  // ── LOADING ────────────────────────────────────────────────────────────────
  if (step === "loading") {
    return (
      <main className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center gap-4">
        <div className="w-10 h-10 border-2 border-[#00C9C8] border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-400 text-sm">Generando instrucciones de pago…</p>
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
          <Zap className="w-5 h-5 text-[#00C9C8]" />
          <span className="text-white font-bold">OmniPay</span>
        </div>

        <div className="flex items-center gap-2 mb-6">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          <div>
            <p className="text-white font-semibold text-sm">Instrucciones generadas</p>
            <p className="text-slate-500 text-xs">Ref: {result.order_id}</p>
          </div>
        </div>

        {/* KYC banner */}
        {result.needs_kyc && result.kyc_url && (
          <div className="bg-amber-900/30 border border-amber-500/40 rounded-xl p-4 mb-4">
            <p className="text-amber-400 text-xs font-semibold mb-1">⚠️ Verificación requerida</p>
            <p className="text-slate-400 text-xs mb-2">Completa tu verificación de identidad antes de enviar el depósito.</p>
            <a href={result.kyc_url} target="_blank" rel="noopener noreferrer"
              className="block text-center bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold py-2 px-4 rounded-lg transition-colors">
              Verificar identidad →
            </a>
          </div>
        )}

        {/* Who receives */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 mb-4">
          <p className="text-slate-500 text-[10px] uppercase tracking-wide mb-1">Receptor</p>
          <p className="text-white font-semibold">{result.recipient.name}</p>
          <p className="text-slate-400 text-xs">{result.recipient.country} · vía Bridge</p>
        </div>

        {/* Deposit instructions */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-slate-500 text-[10px] uppercase tracking-wide">Deposita via {di.rail}</p>
            <button onClick={copyAll}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors bg-slate-700 hover:bg-slate-600 px-2 py-1 rounded-lg">
              {copiedAll ? <><Check size={12} className="text-emerald-400" /> Copiado</> : <><Copy size={12} /> Copiar todo</>}
            </button>
          </div>

          {/* Amount — always first */}
          <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-lg px-3 py-2 mb-3">
            <p className="text-slate-400 text-[10px] uppercase tracking-wide">Monto exacto a depositar</p>
            <p className="text-emerald-400 text-xl font-bold font-mono">{di.amount_to_deposit} {di.currency.toUpperCase()}</p>
            <p className="text-slate-500 text-[10px] mt-0.5">Envía exactamente este monto — Bridge no acepta montos parciales</p>
          </div>

          {di.routing_number  && <CopyField label="Routing number (ABA)"  value={di.routing_number} />}
          {di.account_number  && <CopyField label="Account number"         value={di.account_number} />}
          {di.bank_name       && <CopyField label="Banco"                  value={di.bank_name} />}
          {di.beneficiary_name && <CopyField label="Beneficiario"          value={di.beneficiary_name} />}
          {di.beneficiary_address && <CopyField label="Dirección beneficiario" value={di.beneficiary_address} />}
          {di.iban            && <CopyField label="IBAN"                   value={di.iban} />}
          {di.bic             && <CopyField label="BIC / SWIFT"            value={di.bic} />}
          {di.account_holder  && <CopyField label="Titular de cuenta"      value={di.account_holder} />}
          {di.clabe           && <CopyField label="CLABE"                  value={di.clabe} />}
          {di.br_code         && <CopyField label="Chave PIX / BR Code"    value={di.br_code} />}
          {di.sort_code       && <CopyField label="Sort code"              value={di.sort_code} />}
        </div>

        {/* Fee breakdown */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 mb-4 text-xs space-y-1.5">
          <p className="text-slate-500 uppercase tracking-wide text-[10px] mb-2">Desglose de tarifas</p>
          <div className="flex justify-between text-slate-300"><span>Principal</span><span className="font-mono">${fee.amount_principal.toFixed(2)}</span></div>
          <div className="flex justify-between text-slate-400"><span>Bridge on-ramp (0.50%)</span><span className="font-mono">+ ${fee.bridge_onramp.toFixed(2)}</span></div>
          <div className="flex justify-between text-slate-400"><span>Bridge off-ramp (0.25%)</span><span className="font-mono">+ ${fee.bridge_offramp.toFixed(2)}</span></div>
          <div className="flex justify-between text-slate-400"><span>OmniPay servicio</span><span className="font-mono">+ ${fee.omnipay_service.toFixed(2)}</span></div>
          <div className="flex justify-between text-slate-400"><span>OmniPay flat</span><span className="font-mono">+ ${fee.omnipay_flat.toFixed(2)}</span></div>
          {fee.kyc_surcharge > 0 && <div className="flex justify-between text-slate-400"><span>Verificación KYC (única vez)</span><span className="font-mono">+ ${fee.kyc_surcharge.toFixed(2)}</span></div>}
          <div className="border-t border-slate-700 pt-1.5 flex justify-between font-semibold text-white">
            <span>Total a depositar</span>
            <span className="font-mono text-[#00C9C8]">${fee.total_to_send.toFixed(2)} {di.currency.toUpperCase()}</span>
          </div>
          <div className="flex justify-between text-emerald-400 font-semibold pt-0.5">
            <span>Receptor recibe</span>
            <span className="font-mono">{fee.recipient_gets}</span>
          </div>
        </div>

        {/* Next steps */}
        <div className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-4 mb-4 space-y-3">
          <p className="text-white text-xs font-semibold">¿Qué sigue?</p>
          <div className="flex gap-3 items-start">
            <span className="text-[#00C9C8] font-bold text-sm w-5 flex-shrink-0">1</span>
            <p className="text-slate-400 text-xs leading-relaxed">Abre tu banco online y envía exactamente <strong className="text-white">{di.amount_to_deposit} {di.currency.toUpperCase()}</strong> mediante wire transfer o ACH a la cuenta de arriba.</p>
          </div>
          <div className="flex gap-3 items-start">
            <span className="text-[#00C9C8] font-bold text-sm w-5 flex-shrink-0">2</span>
            <p className="text-slate-400 text-xs leading-relaxed">Bridge detecta el depósito y lo convierte al instante. No hay espera en el lado de Bridge — el envío es en minutos.</p>
          </div>
          <div className="flex gap-3 items-start">
            <span className="text-[#00C9C8] font-bold text-sm w-5 flex-shrink-0">3</span>
            <p className="text-slate-400 text-xs leading-relaxed">El receptor recibe <strong className="text-white">{fee.recipient_gets}</strong> directamente en su cuenta vía {result.recipient.country === "MX" ? "SPEI" : result.recipient.country === "BR" ? "PIX" : result.recipient.country === "GB" ? "Faster Payments" : "transferencia"} — instantáneo.</p>
          </div>
        </div>

        {/* Notify admin button */}
        <button
          onClick={() => {
            const adminNumber = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "").replace(/\D/g, "") || "1234567890";
            const msg = `✅ PAGO ENVIADO\n\nRef: ${result.order_id}\nEmisor: ${name}\nMonto depositado: ${di.amount_to_deposit} ${di.currency.toUpperCase()}\nReceptor: ${result.recipient.name} (${result.recipient.country})\nRecibe: ${fee.recipient_gets}\n\nPor favor confirmar recepción.`;
            window.open(`https://wa.me/${adminNumber}?text=${encodeURIComponent(msg)}`, "_blank");
          }}
          className="w-full bg-[#25D366] hover:bg-[#20ba59] active:scale-95 transition-all text-white font-semibold py-4 rounded-2xl text-sm flex items-center justify-center gap-2 mb-4"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          Ya realicé la transferencia — notificar
        </button>

        <p className="text-slate-600 text-[10px] text-center pb-2">
          Ref: {result.order_id} · 🔒 Bridge procesa el pago de forma segura
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
          <Zap className="w-5 h-5 text-[#00C9C8]" />
          <span className="text-white font-bold">OmniPay</span>
        </div>
        <h1 className="text-white font-bold text-xl mt-4 mb-1">Enviar pago</h1>
        <p className="text-slate-400 text-sm">Alguien te compartió este link de cobro. Completa tus datos para obtener las instrucciones de depósito.</p>
      </div>

      <div className="space-y-4 flex-1">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Tu nombre completo</label>
          <input value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Juan Pérez"
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-[#00C9C8] text-sm" />
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1">Tu email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@email.com" inputMode="email" type="email"
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-[#00C9C8] text-sm" />
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1">Moneda con la que pagas</label>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#00C9C8] text-sm">
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>{c.flag} {c.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1">Tu teléfono (opcional)</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)}
            placeholder="+1 416 555 0123" inputMode="tel"
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-[#00C9C8] text-sm" />
        </div>

        <button
          onClick={handleSubmit}
          disabled={!name.trim() || !email.includes("@")}
          className="w-full bg-[#00C9C8] hover:bg-[#00b3b2] active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-black font-bold py-4 rounded-2xl text-sm mt-2">
          Obtener instrucciones de pago →
        </button>

        <p className="text-center text-xs text-slate-600 pb-4">
          🔒 Zero datos almacenados · Bridge procesa el pago
        </p>
      </div>
    </main>
  );
}

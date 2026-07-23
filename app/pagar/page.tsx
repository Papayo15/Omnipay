"use client";

import { useEffect, useState, useCallback } from "react";
import { Zap, Copy, Check, AlertCircle, CheckCircle2 } from "lucide-react";

type Step = "currency" | "loading" | "instructions" | "error";

interface WiseAccount {
  rail:               string;
  bank_name?:         string;
  routing_number?:    string;
  account_number?:    string;
  beneficiary_name?:  string;
  institution_number?:string;
  transit_number?:    string;
  interac_email?:     string;
  iban?:              string;
  bic?:               string;
  account_holder?:    string;
  sort_code?:         string;
}

interface FeeBreakdown {
  principal:       number;
  wise_fx:         string;
  omnipay_service: number;
  omnipay_flat:    number;
  total_to_send:   number;
  currency:        string;
  recipient_gets:  string;
  rate_note:       string;
}

interface RegisterResponse {
  order_id:      string;
  wise_account:  WiseAccount;
  fee_breakdown: FeeBreakdown;
  recipient:     { name: string; country: string; method: string };
  error?:        string;
}

const CURRENCIES = [
  { code: "usd", flag: "🇺🇸", label: "USD — Dólares (USA)",      rail: "ACH / Wire"          },
  { code: "cad", flag: "🇨🇦", label: "CAD — Dólares (Canadá)",   rail: "Interac e-Transfer"  },
  { code: "eur", flag: "🇪🇺", label: "EUR — Euros (Europa)",      rail: "SEPA"                },
  { code: "gbp", flag: "🇬🇧", label: "GBP — Libras (UK)",        rail: "Faster Payments"     },
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
  const [token,    setToken]    = useState<string | null>(null);
  const [step,     setStep]     = useState<Step>("currency");
  const [currency, setCurrency] = useState("usd");
  const [result,   setResult]   = useState<RegisterResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [copiedAll, setCopiedAll] = useState(false);

  useEffect(() => {
    const p    = new URLSearchParams(window.location.search);
    const t    = p.get("t");
    const type = p.get("type");
    if (!t || type !== "p2p") { window.location.href = "/"; return; }
    setToken(t);
    // Auto-detect currency from browser locale
    const lang = navigator.language ?? "";
    if (lang.startsWith("fr-CA") || lang.startsWith("en-CA")) setCurrency("cad");
    else if (lang.startsWith("en-GB"))                         setCurrency("gbp");
    else if (["de","fr","es","it","nl","pt"].some((l) => lang.startsWith(l))) setCurrency("eur");
    else                                                        setCurrency("usd");
  }, []);

  const getInstructions = useCallback(async () => {
    if (!token) return;
    setStep("loading");
    try {
      const res  = await fetch("/api/bridge/register", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ token, sender_currency: currency }),
      });
      const data = await res.json() as RegisterResponse;
      if (!res.ok || data.error) { setErrorMsg(data.error ?? "Error al registrar"); setStep("error"); return; }
      setResult(data);
      setStep("instructions");
    } catch {
      setErrorMsg("Error de conexión. Intenta de nuevo.");
      setStep("error");
    }
  }, [token, currency]);

  function copyAll() {
    if (!result) return;
    const wa = result.wise_account;
    const fee = result.fee_breakdown;
    const lines = [
      `Monto: ${fee.total_to_send} ${fee.currency}`,
      `Referencia (OBLIGATORIO): ${result.order_id}`,
      wa.routing_number   ? `Routing: ${wa.routing_number}` : null,
      wa.account_number   ? `Account: ${wa.account_number}` : null,
      wa.bank_name        ? `Banco: ${wa.bank_name}` : null,
      wa.beneficiary_name ? `Beneficiario: ${wa.beneficiary_name}` : null,
      wa.interac_email    ? `Interac email: ${wa.interac_email}` : null,
      wa.institution_number ? `Institución: ${wa.institution_number}` : null,
      wa.transit_number   ? `Tránsito: ${wa.transit_number}` : null,
      wa.iban             ? `IBAN: ${wa.iban}` : null,
      wa.bic              ? `BIC: ${wa.bic}` : null,
      wa.sort_code        ? `Sort code: ${wa.sort_code}` : null,
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

  // ── ERROR ────────────────────────────────────────────────────────────────────
  if (step === "error") {
    return (
      <main className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center px-6 text-center gap-5">
        <AlertCircle className="w-14 h-14 text-red-400" />
        <h2 className="text-xl font-semibold text-white">Algo salió mal</h2>
        <p className="text-slate-400 text-sm max-w-xs whitespace-pre-wrap">{errorMsg}</p>
        <button onClick={() => setStep("currency")} className="text-[#00C9C8] text-sm underline mt-2">
          ← Volver
        </button>
      </main>
    );
  }

  // ── LOADING ──────────────────────────────────────────────────────────────────
  if (step === "loading") {
    return (
      <main className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center gap-4">
        <div className="w-10 h-10 border-2 border-[#00C9C8] border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-400 text-sm">Obteniendo tipo de cambio Wise…</p>
      </main>
    );
  }

  // ── INSTRUCTIONS ─────────────────────────────────────────────────────────────
  if (step === "instructions" && result) {
    const wa  = result.wise_account;
    const fee = result.fee_breakdown;
    return (
      <main className="min-h-screen bg-[#0f172a] flex flex-col pb-10 max-w-sm mx-auto w-full px-5">
        <div className="pt-8 pb-4 flex items-center gap-2">
          <Zap className="w-5 h-5 text-[#00C9C8]" />
          <span className="text-white font-bold">OmniPay</span>
        </div>

        <div className="flex items-center gap-2 mb-5">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          <div>
            <p className="text-white font-semibold text-sm">Instrucciones de pago listas</p>
            <p className="text-slate-500 text-xs">Ref: {result.order_id}</p>
          </div>
        </div>

        {/* Receptor */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 mb-4">
          <p className="text-slate-500 text-[10px] uppercase tracking-wide mb-1">Envías a</p>
          <p className="text-white font-semibold">{result.recipient.name}</p>
          <p className="text-emerald-400 text-sm font-semibold mt-0.5">{fee.recipient_gets}</p>
          <p className="text-slate-500 text-xs">{result.recipient.country} · instantáneo vía Wise</p>
        </div>

        {/* Deposit card */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-slate-500 text-[10px] uppercase tracking-wide">Deposita vía {wa.rail}</p>
            <button onClick={copyAll}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-white bg-slate-700 hover:bg-slate-600 px-2 py-1 rounded-lg transition-colors">
              {copiedAll ? <><Check size={12} className="text-emerald-400" /> Copiado</> : <><Copy size={12} /> Copiar todo</>}
            </button>
          </div>

          {/* Amount */}
          <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-lg px-3 py-2 mb-3">
            <p className="text-slate-400 text-[10px] uppercase tracking-wide">Monto exacto</p>
            <p className="text-emerald-400 text-xl font-bold font-mono">{fee.total_to_send} {fee.currency}</p>
            <p className="text-slate-500 text-[10px] mt-0.5">{fee.rate_note}</p>
          </div>

          {/* Reference — most important */}
          <div className="bg-amber-900/20 border border-amber-500/40 rounded-lg px-3 py-2 mb-3">
            <p className="text-amber-400 text-[10px] uppercase tracking-wide font-semibold">Referencia / Concepto — OBLIGATORIO</p>
            <div className="flex items-center justify-between mt-0.5">
              <p className="text-white font-mono text-sm font-bold">{result.order_id}</p>
              <button onClick={() => { navigator.clipboard.writeText(result.order_id).catch(() => {}); }}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors ml-2">
                <Copy size={12} className="text-slate-400" />
              </button>
            </div>
            <p className="text-amber-400/70 text-[10px] mt-1">Sin este código no podemos identificar tu pago</p>
          </div>

          {wa.routing_number    && <CopyField label="Routing number (ABA)"  value={wa.routing_number} />}
          {wa.account_number    && <CopyField label="Account number"         value={wa.account_number} />}
          {wa.bank_name         && <CopyField label="Banco"                  value={wa.bank_name} />}
          {wa.beneficiary_name  && <CopyField label="Beneficiario"           value={wa.beneficiary_name} />}
          {wa.interac_email     && <CopyField label="Interac e-Transfer a"   value={wa.interac_email} />}
          {wa.institution_number && <CopyField label="Número de institución" value={wa.institution_number} />}
          {wa.transit_number    && <CopyField label="Número de tránsito"     value={wa.transit_number} />}
          {wa.iban              && <CopyField label="IBAN"                   value={wa.iban} />}
          {wa.bic               && <CopyField label="BIC / SWIFT"            value={wa.bic} />}
          {wa.account_holder    && <CopyField label="Titular"                value={wa.account_holder} />}
          {wa.sort_code         && <CopyField label="Sort code"              value={wa.sort_code} />}
        </div>

        {/* Fee breakdown */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 mb-4 text-xs space-y-1.5">
          <p className="text-slate-500 uppercase tracking-wide text-[10px] mb-2">Desglose</p>
          <div className="flex justify-between text-slate-300"><span>Principal (para receptor)</span><span className="font-mono">{fee.principal.toFixed(2)} {fee.currency}</span></div>
          <div className="flex justify-between text-slate-400"><span>FX Wise ({fee.wise_fx})</span><span className="font-mono">—</span></div>
          <div className="flex justify-between text-slate-400"><span>OmniPay servicio</span><span className="font-mono">+ {fee.omnipay_service.toFixed(2)}</span></div>
          <div className="flex justify-between text-slate-400"><span>OmniPay flat</span><span className="font-mono">+ {fee.omnipay_flat.toFixed(2)}</span></div>
          <div className="border-t border-slate-700 pt-1.5 flex justify-between font-semibold text-white">
            <span>Total a depositar</span>
            <span className="font-mono text-[#00C9C8]">{fee.total_to_send.toFixed(2)} {fee.currency}</span>
          </div>
          <div className="flex justify-between text-emerald-400 font-semibold">
            <span>Receptor recibe</span>
            <span className="font-mono">{fee.recipient_gets}</span>
          </div>
        </div>

        {/* Steps */}
        <div className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-4 mb-4 space-y-3">
          <p className="text-white text-xs font-semibold">¿Qué sigue?</p>
          <div className="flex gap-3 items-start">
            <span className="text-[#00C9C8] font-bold text-sm w-5 flex-shrink-0">1</span>
            <p className="text-slate-400 text-xs leading-relaxed">
              Abre tu app bancaria y transfiere <strong className="text-white">{fee.total_to_send} {fee.currency}</strong> a la cuenta de arriba.
              {wa.interac_email ? " Es un Interac e-Transfer — tarda segundos." : ""}
            </p>
          </div>
          <div className="flex gap-3 items-start">
            <span className="text-[#00C9C8] font-bold text-sm w-5 flex-shrink-0">2</span>
            <p className="text-slate-400 text-xs leading-relaxed">
              <strong className="text-white">Pon {result.order_id} como referencia/concepto.</strong> Sin este código no podemos procesar el pago.
            </p>
          </div>
          <div className="flex gap-3 items-start">
            <span className="text-[#00C9C8] font-bold text-sm w-5 flex-shrink-0">3</span>
            <p className="text-slate-400 text-xs leading-relaxed">
              Wise detecta el pago y <strong className="text-white">{result.recipient.name}</strong> recibe <strong className="text-white">{fee.recipient_gets}</strong> — instantáneo.
            </p>
          </div>
        </div>

        {/* WhatsApp notify */}
        <button
          onClick={() => {
            const adminNumber = (process.env.NEXT_PUBLIC_ADMIN_WHATSAPP ?? "").replace(/\D/g, "") || "1234567890";
            const msg = `✅ PAGO ENVIADO\n\nRef: ${result.order_id}\nMonto: ${fee.total_to_send} ${fee.currency}\nReceptor: ${result.recipient.name} (${result.recipient.country})\nRecibe: ${fee.recipient_gets}`;
            window.open(`https://wa.me/${adminNumber}?text=${encodeURIComponent(msg)}`, "_blank");
          }}
          className="w-full bg-[#25D366] hover:bg-[#20ba59] active:scale-95 transition-all text-white font-semibold py-4 rounded-2xl text-sm flex items-center justify-center gap-2 mb-3"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          Ya transferí — notificar
        </button>

        <p className="text-slate-600 text-[10px] text-center">
          Ref: {result.order_id} · 🔒 Procesado por Wise · OmniPay no almacena datos bancarios
        </p>
      </main>
    );
  }

  // ── CURRENCY SELECTOR ────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-[#0f172a] flex flex-col pb-10 max-w-sm mx-auto w-full px-5">
      <div className="pt-10 pb-8">
        <div className="flex items-center gap-2 mb-8">
          <Zap className="w-5 h-5 text-[#00C9C8]" />
          <span className="text-white font-bold">OmniPay</span>
        </div>
        <h1 className="text-white font-bold text-2xl mb-2">Enviar pago</h1>
        <p className="text-slate-400 text-sm">Alguien te compartió este link de cobro. ¿Desde qué país pagas?</p>
      </div>

      <div className="space-y-3 flex-1">
        {CURRENCIES.map((c) => (
          <button
            key={c.code}
            onClick={() => setCurrency(c.code)}
            className={`w-full flex items-center gap-4 px-4 py-4 rounded-2xl border transition-all text-left ${
              currency === c.code
                ? "border-[#00C9C8] bg-[#00C9C8]/10"
                : "border-slate-700 bg-slate-800/50 hover:border-slate-500"
            }`}
          >
            <span className="text-2xl">{c.flag}</span>
            <div className="flex-1">
              <p className={`font-semibold text-sm ${currency === c.code ? "text-[#00C9C8]" : "text-white"}`}>{c.label}</p>
              <p className="text-slate-500 text-xs">{c.rail}</p>
            </div>
            {currency === c.code && (
              <div className="w-4 h-4 rounded-full bg-[#00C9C8] flex items-center justify-center flex-shrink-0">
                <Check size={10} className="text-black" />
              </div>
            )}
          </button>
        ))}

        <button
          onClick={getInstructions}
          className="w-full bg-[#00C9C8] hover:bg-[#00b3b2] active:scale-95 transition-all text-black font-bold py-4 rounded-2xl text-sm mt-4"
        >
          Ver instrucciones de pago →
        </button>

        <p className="text-center text-xs text-slate-600 pt-2">
          🔒 Procesado por Wise · Entrega instantánea
        </p>
      </div>
    </main>
  );
}

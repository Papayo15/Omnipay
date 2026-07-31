"use client";

import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Copy, Check } from "lucide-react";

// ── Países destino (excluye MX — el emisor ya está en México) ──────────────────
const SEPA_COUNTRIES = new Set([
  "DE","FR","ES","IT","NL","PT","BE","AT","IE","FI","GR","CY","EE","LV","LT","LU","MT","SK","SI","HR",
  "SE","DK","NO","PL","CZ","HU","RO","BG","CH","IS","LI","AD","MC","SM","XK","VA",
]);

const COUNTRY_OPTIONS = [
  { code: "US", currency: "USD", flag: "🇺🇸", label: "USA" },
  { code: "BR", currency: "BRL", flag: "🇧🇷", label: "Brasil" },
  { code: "CO", currency: "COP", flag: "🇨🇴", label: "Colombia" },
  { code: "GB", currency: "GBP", flag: "🇬🇧", label: "Reino Unido" },
  { code: "DE", currency: "EUR", flag: "🇩🇪", label: "Alemania" },
  { code: "FR", currency: "EUR", flag: "🇫🇷", label: "Francia" },
  { code: "ES", currency: "EUR", flag: "🇪🇸", label: "España" },
  { code: "IT", currency: "EUR", flag: "🇮🇹", label: "Italia" },
  { code: "NL", currency: "EUR", flag: "🇳🇱", label: "Países Bajos" },
  { code: "PT", currency: "EUR", flag: "🇵🇹", label: "Portugal" },
  { code: "BE", currency: "EUR", flag: "🇧🇪", label: "Bélgica" },
  { code: "AT", currency: "EUR", flag: "🇦🇹", label: "Austria" },
  { code: "IE", currency: "EUR", flag: "🇮🇪", label: "Irlanda" },
  { code: "FI", currency: "EUR", flag: "🇫🇮", label: "Finlandia" },
  { code: "GR", currency: "EUR", flag: "🇬🇷", label: "Grecia" },
  { code: "PL", currency: "EUR", flag: "🇵🇱", label: "Polonia" },
  { code: "SE", currency: "EUR", flag: "🇸🇪", label: "Suecia" },
  { code: "DK", currency: "EUR", flag: "🇩🇰", label: "Dinamarca" },
  { code: "NO", currency: "EUR", flag: "🇳🇴", label: "Noruega" },
  { code: "CH", currency: "EUR", flag: "🇨🇭", label: "Suiza" },
];

type Step = "form" | "sending" | "ready" | "error";

interface CheckoutResult {
  clabe:        string;
  bank_name:    string;
  beneficiary:  string;
  amount_mxn:   number;
  order_id:     string;
  instructions: string;
}

// ── Pantalla "próximamente" cuando BITSO no está habilitado ──────────────────
function ComingSoon() {
  return (
    <main className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center px-5 text-center">
      <div className="text-5xl mb-6">🇲🇽</div>
      <h1 className="text-white font-bold text-2xl mb-3">Enviar desde México</h1>
      <p className="text-slate-400 text-sm max-w-xs">
        Pronto podrás enviar dinero desde México a USA, Europa y más — vía SPEI directo.
        Estamos en los últimos preparativos.
      </p>
      <p className="text-slate-600 text-xs mt-8">Canal 4 · Bitso Multi-CLABE · próximamente</p>
    </main>
  );
}

export default function MxPage() {
  // ── Ocultar mientras no estén las keys de Bitso ───────────────────────────
  const bitsoEnabled = process.env.NEXT_PUBLIC_BITSO_ENABLED === "true";
  if (!bitsoEnabled) return <ComingSoon />;

  return <MxForm />;
}

function MxForm() {
  const [step,          setStep]          = useState<Step>("form");
  const [nombre,        setNombre]        = useState("");
  const [email,         setEmail]         = useState("");
  const [country,       setCountry]       = useState("US");
  const [account,       setAccount]       = useState("");
  const [bic,           setBic]           = useState("");
  const [cpf,           setCpf]           = useState("");
  const [amountMxn,     setAmountMxn]     = useState("");
  const [errorMsg,      setErrorMsg]      = useState("");
  const [result,        setResult]        = useState<CheckoutResult | null>(null);
  const [copied,        setCopied]        = useState(false);
  const [submitting,    setSubmitting]    = useState(false);

  const selected  = COUNTRY_OPTIONS.find(c => c.code === country) ?? COUNTRY_OPTIONS[0];
  const currency  = selected.currency;
  const isSepa    = SEPA_COUNTRIES.has(country);
  const isBr      = country === "BR";
  const isUk      = country === "GB";
  const isUs      = country === "US";

  useEffect(() => {
    setAccount("");
    setBic("");
    setCpf("");
  }, [country]);

  const accountPlaceholder =
    isUs  ? "021000021 / 123456789 (routing / cuenta)" :
    isUk  ? "00-00-00 / 12345678 (sort code / cuenta)" :
    isBr  ? "Llave PIX (CPF, email, teléfono o aleatoria)" :
    isSepa? "IBAN (ej: DE89370400440532013000)" :
            "Número de cuenta";

  const canSubmit = !!nombre.trim() && email.includes("@") && account.trim().length >= 5
    && parseFloat(amountMxn) >= 100
    && !(isSepa && !bic.trim())
    && !(isBr && !cpf.trim());

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setStep("sending");

    const body: Record<string, unknown> = {
      nombre, email: email.toLowerCase(), country,
      account, amount_mxn: parseFloat(amountMxn),
    };
    if (isSepa && bic) body.bic = bic;
    if (isBr && cpf)   body.cpf = cpf.replace(/\D/g, "");
    if (isUk) {
      const parts = account.split("/");
      body.sort_code      = (parts[0] ?? "").replace(/\D/g, "");
      body.account_number = (parts[1] ?? "").replace(/\D/g, "");
    }
    if (isUs) {
      const parts = account.split("/");
      body.routing_number = (parts[0] ?? "").replace(/\D/g, "");
      body.account_number = (parts[1] ?? "").replace(/\D/g, "");
    }

    try {
      const res  = await fetch("/api/bitso/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json() as CheckoutResult & { error?: string };
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
      setResult(data);
      setStep("ready");
    } catch (err) {
      setErrorMsg((err as Error).message);
      setStep("error");
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, submitting, nombre, email, country, account, amountMxn, bic, cpf, isSepa, isBr, isUk, isUs]);

  const copyClabe = useCallback(async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.clabe);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }, [result]);

  // ── Sending ──────────────────────────────────────────────────────────────
  if (step === "sending") {
    return (
      <main className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-slate-400 text-sm">Generando CLABE…</p>
        </div>
      </main>
    );
  }

  // ── Ready — mostrar CLABE ────────────────────────────────────────────────
  if (step === "ready" && result) {
    const whatsappMsg =
      `OmniPay — Transferencia Internacional\n\n` +
      `Haz SPEI por *MXN $${result.amount_mxn.toLocaleString("es-MX")}* a:\n\n` +
      `🏦 Banco: ${result.bank_name}\n` +
      `CLABE: *${result.clabe}*\n` +
      `Beneficiario: ${result.beneficiary}\n` +
      `Concepto: OmniPay ${result.order_id}\n\n` +
      `El dinero llegará a ${nombre} en minutos.`;

    return (
      <main className="min-h-screen bg-[#0f172a] flex flex-col px-5 pt-12 pb-10 max-w-sm mx-auto w-full">
        <button onClick={() => setStep("form")} className="flex items-center gap-1 text-slate-400 text-sm mb-8 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" /> Nueva transferencia
        </button>
        <div className="flex-1 flex flex-col items-center justify-center gap-5 text-center">
          <div className="text-5xl">🏦</div>
          <div>
            <h2 className="text-white font-bold text-xl mb-1">CLABE lista</h2>
            <p className="text-slate-400 text-sm">Haz SPEI desde tu banco mexicano</p>
          </div>

          {/* CLABE card */}
          <div className="w-full bg-slate-800/60 border border-slate-700 rounded-2xl p-5 text-left space-y-3">
            <div>
              <p className="text-slate-500 text-xs mb-1">Monto a enviar</p>
              <p className="text-white font-bold text-2xl">MXN ${parseFloat(amountMxn).toLocaleString("es-MX")}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs mb-1">Banco</p>
              <p className="text-slate-200 text-sm font-medium">{result.bank_name}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs mb-1">Beneficiario</p>
              <p className="text-slate-200 text-sm font-medium">{result.beneficiary}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs mb-1">CLABE</p>
              <p className="text-white font-mono text-lg tracking-widest">{result.clabe}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs mb-1">Concepto</p>
              <p className="text-slate-300 text-sm font-mono">OmniPay {result.order_id}</p>
            </div>
          </div>

          {/* Acciones */}
          <div className="w-full space-y-3">
            <button onClick={copyClabe} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 rounded-xl text-sm flex items-center justify-center gap-2 transition-colors">
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? "CLABE copiada ✓" : "Copiar CLABE"}
            </button>
            <button
              onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(whatsappMsg)}`, "_blank")}
              className="w-full bg-[#25D366] hover:bg-[#20ba59] text-white font-semibold py-3 rounded-xl text-sm flex items-center justify-center gap-2 transition-colors">
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              Compartir instrucciones por WhatsApp
            </button>
          </div>

          <p className="text-slate-600 text-xs">El pago será procesado en minutos tras recibir el SPEI · Canal 4 via Bitso</p>

          <button
            onClick={() => { setStep("form"); setNombre(""); setEmail(""); setAccount(""); setAmountMxn(""); setResult(null); }}
            className="text-slate-500 hover:text-slate-300 text-xs transition-colors">
            + Nueva transferencia
          </button>
        </div>
      </main>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (step === "error") {
    return (
      <main className="min-h-screen bg-[#0f172a] flex flex-col px-5 pt-12 pb-10 max-w-sm mx-auto w-full">
        <button onClick={() => setStep("form")} className="flex items-center gap-1 text-slate-400 text-sm mb-8 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" /> Volver
        </button>
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center">
          <div className="text-5xl">❌</div>
          <h2 className="text-white font-bold text-xl">Algo salió mal</h2>
          <p className="text-slate-400 text-sm max-w-xs">{errorMsg}</p>
          <button onClick={() => setStep("form")} className="mt-4 bg-slate-700 hover:bg-slate-600 text-white py-3 px-6 rounded-xl text-sm transition-colors">
            Intentar de nuevo
          </button>
        </div>
      </main>
    );
  }

  // ── Form ─────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-[#0f172a] flex flex-col px-5 pt-10 pb-10 max-w-sm mx-auto w-full">

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-2xl">🇲🇽</span>
          <h1 className="text-white font-bold text-xl">Enviar desde México</h1>
        </div>
        <p className="text-slate-400 text-sm">Ingresa los datos del receptor en el extranjero. Te daremos una CLABE para hacer el SPEI.</p>
      </div>

      <div className="space-y-4 flex-1">

        {/* Nombre receptor */}
        <div>
          <label className="block text-xs text-slate-400 mb-1">Nombre del receptor</label>
          <input
            type="text"
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            placeholder="Nombre completo del receptor"
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition-colors"
          />
        </div>

        {/* Email receptor */}
        <div>
          <label className="block text-xs text-slate-400 mb-1">Email del receptor</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="receptor@email.com"
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition-colors"
          />
        </div>

        {/* País destino */}
        <div>
          <label className="block text-xs text-slate-400 mb-1">País del receptor</label>
          <select
            value={country}
            onChange={e => setCountry(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-emerald-500 transition-colors">
            {COUNTRY_OPTIONS.map(c => (
              <option key={c.code} value={c.code}>{c.flag} {c.label} — {c.currency}</option>
            ))}
          </select>
        </div>

        {/* Cuenta bancaria */}
        <div>
          <label className="block text-xs text-slate-400 mb-1">
            {isUs   ? "Routing / Número de cuenta" :
             isUk   ? "Sort code / Número de cuenta" :
             isBr   ? "Llave PIX" :
             isSepa ? "IBAN" :
             "Cuenta bancaria"}
          </label>
          <input
            type="text"
            value={account}
            onChange={e => setAccount(e.target.value)}
            placeholder={accountPlaceholder}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition-colors font-mono"
          />
        </div>

        {/* BIC — solo SEPA */}
        {isSepa && (
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              BIC / SWIFT <span className="text-amber-400">(requerido)</span>
            </label>
            <input
              type="text"
              value={bic}
              onChange={e => setBic(e.target.value.toUpperCase())}
              placeholder="DEUTDEDB"
              className={`w-full bg-slate-800 border rounded-xl px-4 py-3 text-white text-sm placeholder-slate-600 focus:outline-none transition-colors font-mono ${bic.trim() ? "border-slate-700 focus:border-emerald-500" : "border-amber-500/50"}`}
            />
          </div>
        )}

        {/* CPF — solo Brasil */}
        {isBr && (
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              CPF / CNPJ del receptor <span className="text-amber-400">(requerido)</span>
            </label>
            <input
              type="text"
              value={cpf}
              onChange={e => setCpf(e.target.value)}
              placeholder="000.000.000-00"
              className={`w-full bg-slate-800 border rounded-xl px-4 py-3 text-white text-sm placeholder-slate-600 focus:outline-none transition-colors font-mono ${cpf.trim() ? "border-slate-700 focus:border-emerald-500" : "border-amber-500/50"}`}
            />
          </div>
        )}

        {/* Monto MXN */}
        <div>
          <label className="block text-xs text-slate-400 mb-1">Monto a enviar (MXN)</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-sm">MXN $</span>
            <input
              type="number"
              value={amountMxn}
              onChange={e => setAmountMxn(e.target.value)}
              placeholder="5000"
              min="100"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-16 pr-4 py-3 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </div>
          <p className="text-slate-600 text-xs mt-1">Mínimo MXN $100</p>
        </div>

        {/* Info del corredor */}
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-3 flex items-start gap-3">
          <span className="text-lg">{selected.flag}</span>
          <div>
            <p className="text-slate-300 text-xs font-medium">
              MXN → {currency} via Bitso SPEI
            </p>
            <p className="text-slate-500 text-xs">
              El receptor recibirá {currency} en su cuenta bancaria en {selected.label}.
              {country !== "MX" && " Tasa de cambio aplicada por Bitso al momento del depósito."}
            </p>
          </div>
        </div>

        {/* Botón submit */}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
          className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold py-3.5 rounded-xl text-sm transition-colors mt-2">
          {submitting ? "Generando CLABE…" : "Generar CLABE de cobro"}
        </button>

        <p className="text-slate-600 text-xs text-center">
          Canal 4 · Bitso Multi-CLABE · OmniPay no guarda tu dinero
        </p>
      </div>
    </main>
  );
}

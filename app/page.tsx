"use client";

import { useEffect, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import {
  Zap, Building2, CreditCard, Smartphone, Send, Store,
  ArrowLeft, CheckCircle2, AlertCircle, Clock, Copy, Check,
} from "lucide-react";

// ── Stripe singleton ──────────────────────────────────────────────────────────
const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "",
);

// ── Types ─────────────────────────────────────────────────────────────────────
type Step =
  | "loading"
  | "create"
  | "share"
  | "checkout_init"
  | "liquidity_pause"
  | "checkout"
  | "progress"
  | "done"
  | "error";

type LinkMode    = "cobro" | "remesa";
type ReceiveMode = "bank" | "card" | "wallet";

interface PaySummary {
  type:             "cobro" | "remesa";
  recipientName:    string;
  cadAmount:        number;
  netCAD?:          number;
  wiseRate?:        number;
  receiveAmount?:   number;
  receiveCurrency?: string;
  payoutMode?:      string;
  amount?:          number;
  currency?:        string;
}

interface ShareQuote {
  receiveAmount:          number;
  receiveCurrency:        string;
  estimatedOriginAmount:  number;
  originCurrency:         string;
}

// ── Data ──────────────────────────────────────────────────────────────────────
const COUNTRIES = [
  { code: "MX", name: "México",           currency: "MXN" },
  { code: "US", name: "Estados Unidos",   currency: "USD" },
  { code: "CA", name: "Canadá",           currency: "CAD" },
  { code: "GB", name: "Reino Unido",      currency: "GBP" },
  { code: "DE", name: "Alemania",         currency: "EUR" },
  { code: "FR", name: "Francia",          currency: "EUR" },
  { code: "ES", name: "España",           currency: "EUR" },
  { code: "IT", name: "Italia",           currency: "EUR" },
  { code: "NL", name: "Países Bajos",     currency: "EUR" },
  { code: "PT", name: "Portugal",         currency: "EUR" },
  { code: "AU", name: "Australia",        currency: "AUD" },
  { code: "JP", name: "Japón",            currency: "JPY" },
  { code: "IN", name: "India",            currency: "INR" },
  { code: "BR", name: "Brasil",           currency: "BRL" },
  { code: "CO", name: "Colombia",         currency: "COP" },
  { code: "PE", name: "Perú",             currency: "PEN" },
  { code: "CL", name: "Chile",            currency: "CLP" },
  { code: "AR", name: "Argentina",        currency: "ARS" },
  { code: "NG", name: "Nigeria",          currency: "NGN" },
  { code: "KE", name: "Kenia",            currency: "KES" },
  { code: "GH", name: "Ghana",            currency: "GHS" },
  { code: "PH", name: "Filipinas",        currency: "PHP" },
  { code: "CN", name: "China",            currency: "CNY" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function getAccountInfo(
  country: string,
  mode: ReceiveMode,
): { label: string; placeholder: string; inputMode: React.HTMLAttributes<HTMLInputElement>["inputMode"] } {
  if (mode === "card") {
    return { label: "Número de tarjeta (16 dígitos)", placeholder: "1234 5678 9012 3456", inputMode: "numeric" };
  }
  if (mode === "wallet") {
    return { label: "Número de billetera / teléfono (E.164)", placeholder: "+52 55 1234 5678", inputMode: "tel" };
  }
  const map: Record<string, { label: string; placeholder: string }> = {
    MX: { label: "CLABE (18 dígitos)",               placeholder: "123456789012345678" },
    US: { label: "Routing + Número de cuenta",        placeholder: "021000021 / 1234567890" },
    CA: { label: "Transit + Cuenta bancaria",         placeholder: "00123 / 1234567890" },
    GB: { label: "Sort Code + Cuenta",                placeholder: "20-00-00 / 12345678" },
    IN: { label: "Cuenta + IFSC",                     placeholder: "HDFC0001234 / 12345678" },
    BR: { label: "Clave PIX",                         placeholder: "CPF, email o teléfono" },
    DE: { label: "IBAN (Alemania)",                   placeholder: "DE89 3704 0044 0532 0130 00" },
    FR: { label: "IBAN (Francia)",                    placeholder: "FR76 3000 6000 0112 3456 7890 189" },
    ES: { label: "IBAN (España)",                     placeholder: "ES91 2100 0418 4502 0005 1332" },
  };
  return { ...(map[country] ?? { label: "Cuenta bancaria del proveedor", placeholder: "Número de cuenta" }), inputMode: "text" };
}

function validateAccount(account: string, country: string, mode: ReceiveMode): boolean {
  const v = account.replace(/[\s-]/g, "");
  if (mode === "card")   return /^\d{16}$/.test(v);
  if (mode === "wallet") return v.length >= 7;
  if (country === "MX")  return /^\d{18}$/.test(v);
  return v.length >= 5;
}

function fmt(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat("es-MX", {
      style: "currency", currency, minimumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

// ── PaymentForm (must live inside <Elements>) ─────────────────────────────────
function PaymentForm({
  summary,
  onSuccess,
  onError,
}: {
  summary:   PaySummary;
  onSuccess: (piId: string) => void;
  onError:   (msg: string) => void;
}) {
  const stripe   = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState("");

  async function handlePay() {
    if (!stripe || !elements) return;
    setLoading(true);
    setErr("");

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });

    if (error) {
      setLoading(false);
      setErr(error.message ?? "Error al autorizar el pago.");
      return;
    }
    if (paymentIntent?.id) {
      onSuccess(paymentIntent.id);
    }
  }

  const payLabel =
    summary.type === "remesa"
      ? fmt(summary.cadAmount, "CAD")
      : fmt(summary.amount ?? summary.cadAmount, summary.currency ?? "CAD");

  return (
    <div className="space-y-4">
      <PaymentElement options={{ layout: "tabs" }} />
      {err && <p className="text-red-400 text-sm text-center">{err}</p>}
      <button
        onClick={handlePay}
        disabled={loading || !stripe}
        className="w-full bg-indigo-600 hover:bg-indigo-500 active:scale-95 disabled:opacity-50 transition-all text-white py-4 rounded-2xl font-semibold text-lg"
      >
        {loading ? "Autorizando…" : `Liquidar Factura — ${payLabel}`}
      </button>
      <p className="text-center text-xs text-slate-500">
        🔒 Cifrado por Stripe · Nunca guardamos tu tarjeta
      </p>
    </div>
  );
}

// ── Main One-Page App ─────────────────────────────────────────────────────────
export default function Home() {
  const [step, setStep] = useState<Step>("loading");

  // — form —
  const [linkMode,       setLinkMode]     = useState<LinkMode>("cobro");
  const [name,           setName]         = useState("");
  const [country,        setCountry]      = useState("MX");
  const [account,        setAccount]      = useState("");
  const [amount,         setAmount]       = useState("");
  const [currency,       setCurrency]     = useState("MXN");
  const [receiveMode,    setReceiveMode]  = useState<ReceiveMode>("bank");
  const [recipientPhone, setRPhone]       = useState("");
  const [senderPhone,    setSPhone]       = useState("");
  const [submitting,     setSubmitting]   = useState(false);
  const [formError,      setFormError]    = useState("");

  // — share —
  const [shareLink,  setShareLink]  = useState("");
  const [shareQuote, setShareQuote] = useState<ShareQuote | null>(null);
  const [copied,     setCopied]     = useState(false);

  // — checkout —
  const [tokenData,     setTokenData]     = useState<{ token: string; sig: string; type: string } | null>(null);
  const [clientSecret,  setClientSecret]  = useState<string | null>(null);
  const [summary,       setSummary]       = useState<PaySummary | null>(null);
  const [secsLeft,      setSecsLeft]      = useState(570);

  // — progress —
  const [progressStep, setProgressStep] = useState(0);
  const [piId,         setPiId]         = useState<string | null>(null);
  const [errorMsg,     setErrorMsg]     = useState("");

  // ── URL detection ────────────────────────────────────────────────────────
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const t = p.get("t");
    const s = p.get("s");
    if (t && s) {
      setTokenData({ token: t, sig: s, type: p.get("type") ?? "remesa" });
      setStep("checkout_init");
    } else {
      setStep("create");
    }
  }, []);

  // ── Fetch PaymentIntent ──────────────────────────────────────────────────
  useEffect(() => {
    if (step !== "checkout_init" || !tokenData) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/pay/intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(tokenData),
        });
        if (cancelled) return;

        if (res.status === 412) {
          const d = await res.json() as { insufficient_liquidity?: boolean };
          if (d.insufficient_liquidity) { setStep("liquidity_pause"); return; }
        }
        if (!res.ok) {
          const d = await res.json() as { error?: string };
          setErrorMsg(d.error ?? "No se pudo cargar la solicitud de pago.");
          setStep("error");
          return;
        }

        const data = await res.json() as { clientSecret: string; summary: PaySummary };
        setClientSecret(data.clientSecret);
        setSummary(data.summary);
        setSecsLeft(570);
        setStep("checkout");
      } catch {
        if (!cancelled) { setErrorMsg("Error de conexión."); setStep("error"); }
      }
    })();

    return () => { cancelled = true; };
  }, [step, tokenData]);

  // ── Countdown — refresca tasa al llegar a cero ───────────────────────────
  useEffect(() => {
    if (step !== "checkout") return;
    if (secsLeft <= 0) { setStep("checkout_init"); return; }
    const t = setInterval(() => setSecsLeft((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [step, secsLeft]);

  // ── Progress steps ───────────────────────────────────────────────────────
  useEffect(() => {
    if (step !== "progress") return;
    const t1 = setTimeout(() => setProgressStep(1), 2500);
    const t2 = setTimeout(() => setProgressStep(2), 5000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [step]);

  // ── Polling /api/pay/confirm ─────────────────────────────────────────────
  useEffect(() => {
    if (step !== "progress" || !piId) return;
    const iv = setInterval(async () => {
      try {
        const res  = await fetch(`/api/pay/confirm?pi=${piId}`);
        const data = await res.json() as { status: string };
        if (data.status === "succeeded") {
          clearInterval(iv);
          setTimeout(() => setStep("done"), 800);
        } else if (data.status === "payment_failed") {
          clearInterval(iv);
          setErrorMsg("La transacción no fue procesada. No se realizó ningún cargo.");
          setStep("error");
        }
      } catch {}
    }, 2000);
    return () => clearInterval(iv);
  }, [step, piId]);

  // ── Auto-fill currency when country changes ──────────────────────────────
  useEffect(() => {
    const c = COUNTRIES.find((c) => c.code === country);
    if (c) setCurrency(c.currency);
    setAccount("");
  }, [country]);

  // ── Handlers ────────────────────────────────────────────────────────────
  async function handleCreate() {
    if (!name.trim() || !account.trim() || !amount) {
      setFormError("Completa todos los campos obligatorios.");
      return;
    }
    if (!validateAccount(account, country, linkMode === "remesa" ? receiveMode : "bank")) {
      setFormError("El número de cuenta no es válido para el país seleccionado.");
      return;
    }
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) {
      setFormError("Ingresa un importe válido mayor a cero.");
      return;
    }

    setFormError("");
    setSubmitting(true);
    try {
      const isRemesa = linkMode === "remesa";
      const endpoint = isRemesa ? "/api/remesa/request" : "/api/cobrar/request";
      const body = isRemesa
        ? {
            recipientName:    name.trim(),
            recipientAccount: account.trim(),
            receiveMode,
            receiveAmount:    parsed,
            receiveCurrency:  currency,
            targetCountry:    country,
            originCountry:    "CA",
            recipientPhone:   recipientPhone.trim() || undefined,
            senderPhone:      senderPhone.trim() || undefined,
          }
        : {
            recipientName:    name.trim(),
            recipientAccount: account.trim(),
            amount:           parsed,
            currency,
            recipientPhone:   recipientPhone.trim() || undefined,
            payerPhone:       senderPhone.trim() || undefined,
          };

      const res  = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { share_link?: string; quote?: ShareQuote; error?: string };
      if (!res.ok) { setFormError(data.error ?? "Error al generar el enlace de cobro."); return; }

      setShareLink(data.share_link ?? "");
      setShareQuote(data.quote ?? null);
      setStep("share");
    } catch {
      setFormError("Error de conexión. Intenta de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(shareLink).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function openWhatsApp() {
    const who = name.trim() || "El proveedor";
    const msg =
      linkMode === "remesa" && shareQuote
        ? `${who} te solicita la liquidación de su factura de servicios.\nLiquida aquí: ${shareLink}`
        : `${who} te solicita el pago de sus honorarios por ${fmt(parseFloat(amount || "0"), currency)}.\nLiquida aquí: ${shareLink}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  // ── LOADING ───────────────────────────────────────────────────────────────
  if (step === "loading" || step === "checkout_init") {
    return (
      <main className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center gap-4">
        <Zap className="w-10 h-10 text-indigo-400 animate-pulse" />
        <p className="text-slate-400 text-sm">
          {step === "checkout_init"
            ? "Consultando tipo de cambio interbancario…"
            : "Iniciando…"}
        </p>
      </main>
    );
  }

  // ── LIQUIDITY PAUSE ───────────────────────────────────────────────────────
  if (step === "liquidity_pause") {
    return (
      <main className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center px-6 text-center gap-5">
        <div className="text-5xl">⏳</div>
        <h2 className="text-xl font-semibold text-white">Aviso del Sistema</h2>
        <p className="text-slate-400 text-sm leading-relaxed max-w-xs">
          Nuestras líneas de procesamiento comercial están experimentando un alto
          volumen de liquidaciones. Para garantizar la integridad de su transacción,
          abriremos nuevos bloques de procesamiento en 15 minutos. Agradecemos
          su comprensión.
        </p>
      </main>
    );
  }

  // ── PROGRESS ──────────────────────────────────────────────────────────────
  if (step === "progress") {
    const progressLabels = [
      "Instrumento de pago validado…",
      "Transacción autorizada…",
      `Procesando liquidación a ${summary?.recipientName ?? "el proveedor"}…`,
    ];
    return (
      <main className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center px-6 gap-8">
        <Zap className="w-10 h-10 text-indigo-400 animate-pulse" />
        <div className="space-y-4 w-full max-w-xs">
          {progressLabels.map((label, i) => (
            <div key={i} className="flex items-center gap-3">
              {i < progressStep ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              ) : i === progressStep ? (
                <div className="w-5 h-5 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin flex-shrink-0" />
              ) : (
                <div className="w-5 h-5 rounded-full border border-slate-600 flex-shrink-0" />
              )}
              <span className={`text-sm ${i <= progressStep ? "text-white" : "text-slate-500"}`}>
                {label}
              </span>
            </div>
          ))}
        </div>
      </main>
    );
  }

  // ── DONE ──────────────────────────────────────────────────────────────────
  if (step === "done") {
    return (
      <main className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center px-6 text-center gap-5">
        <CheckCircle2 className="w-16 h-16 text-emerald-400" />
        <h2 className="text-2xl font-bold text-white">¡Pago Procesado!</h2>
        <p className="text-slate-400 text-sm max-w-xs">
          La liquidación de honorarios ha sido procesada exitosamente.{" "}
          {summary?.recipientName ?? "El proveedor"} recibirá confirmación por SMS.
        </p>
      </main>
    );
  }

  // ── ERROR ─────────────────────────────────────────────────────────────────
  if (step === "error") {
    return (
      <main className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center px-6 text-center gap-5">
        <AlertCircle className="w-14 h-14 text-red-400" />
        <h2 className="text-xl font-semibold text-white">Error en la Transacción</h2>
        <p className="text-slate-400 text-sm max-w-xs">
          {errorMsg || "No pudimos procesar la solicitud. No se hizo ningún cargo."}
        </p>
        <button
          onClick={() => { setStep("create"); setErrorMsg(""); }}
          className="text-indigo-400 text-sm underline mt-2"
        >
          Reiniciar
        </button>
      </main>
    );
  }

  // ── SHARE ─────────────────────────────────────────────────────────────────
  if (step === "share") {
    return (
      <main className="min-h-screen bg-[#0f172a] flex flex-col px-5 pt-12 pb-10 max-w-sm mx-auto w-full">
        <button
          onClick={() => setStep("create")}
          className="flex items-center gap-1 text-slate-400 text-sm mb-8 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Nuevo cobro
        </button>

        <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center">
          <CheckCircle2 className="w-14 h-14 text-emerald-400" />

          <div>
            <h2 className="text-2xl font-bold text-white mb-2">¡Enlace de Cobro Generado!</h2>
            {shareQuote ? (
              <p className="text-slate-400 text-sm">
                Estimado de liquidación:{" "}
                <span className="text-white font-medium">
                  ~{fmt(shareQuote.estimatedOriginAmount, shareQuote.originCurrency)}
                </span>
                <br />
                <span className="text-xs text-slate-500">
                  El importe exacto se calcula con tipo de cambio interbancario al momento de liquidar.
                </span>
              </p>
            ) : (
              <p className="text-slate-400 text-sm">
                El cliente verá el importe al abrir el enlace.
              </p>
            )}
          </div>

          <div className="w-full space-y-3">
            <button
              onClick={openWhatsApp}
              className="w-full bg-[#25D366] hover:bg-[#1fb85a] active:scale-95 transition-all text-white py-4 rounded-2xl font-semibold text-lg flex items-center justify-center gap-2"
            >
              <Send className="w-5 h-5" />
              Enviar al Cliente por WhatsApp
            </button>
            <button
              onClick={handleCopy}
              className="w-full bg-slate-800 hover:bg-slate-700 active:scale-95 transition-all text-white py-3 rounded-2xl font-medium flex items-center justify-center gap-2"
            >
              {copied
                ? <><Check className="w-4 h-4 text-emerald-400" /> ¡Copiado!</>
                : <><Copy className="w-4 h-4" /> Copiar enlace</>
              }
            </button>
          </div>
        </div>
      </main>
    );
  }

  // ── CHECKOUT ──────────────────────────────────────────────────────────────
  if (step === "checkout" && clientSecret && summary) {
    const mins = String(Math.floor(secsLeft / 60)).padStart(2, "0");
    const secs = String(secsLeft % 60).padStart(2, "0");

    return (
      <main className="min-h-screen bg-[#0f172a] flex flex-col px-5 pt-12 pb-10 max-w-sm mx-auto w-full">
        <div className="flex flex-col mb-8">
          <div className="flex items-center gap-2">
            <Zap className="w-6 h-6 text-indigo-400" />
            <span className="text-lg font-bold text-white">OmniPay</span>
          </div>
          <span className="text-xs text-slate-500 ml-8">Invoice Matrix · Servicios Profesionales</span>
        </div>

        {/* Summary card */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-5 mb-6 text-center">
          <p className="text-slate-400 text-xs mb-1 uppercase tracking-wide">
            Solicitud de Pago Comercial
          </p>
          <p className="text-white text-sm font-medium mb-3">
            {summary.recipientName} · Factura por Servicios Prestados
          </p>

          {summary.type === "remesa" && summary.receiveAmount && summary.receiveCurrency ? (
            <>
              <p className="text-3xl font-bold text-indigo-400 mb-1">
                {fmt(summary.receiveAmount, summary.receiveCurrency)}
              </p>
              <p className="text-white font-semibold text-xl mb-1">
                Total a Liquidar: {fmt(summary.cadAmount, "CAD")}
              </p>
              {summary.wiseRate && (
                <p className="text-slate-400 text-xs">
                  1 CAD = {summary.wiseRate.toFixed(4)} {summary.receiveCurrency} · tipo de cambio interbancario
                </p>
              )}
              {summary.payoutMode === "INSTANT" && (
                <p className="text-amber-400 text-xs mt-1">
                  ⚡ Procesamiento prioritario (+1% tarifa de red)
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-3xl font-bold text-white mb-1">
                {fmt(summary.amount ?? summary.cadAmount, summary.currency ?? "CAD")}
              </p>
              <p className="text-slate-400 text-xs">Importe total de la factura</p>
            </>
          )}

          <div className="flex items-center justify-center gap-1 mt-3 text-slate-500 text-xs">
            <Clock className="w-3 h-3" />
            <span>Cotización vigente {mins}:{secs}</span>
          </div>
        </div>

        {/* Payment Element */}
        <Elements
          stripe={stripePromise}
          options={{ clientSecret, appearance: { theme: "night" } }}
        >
          <PaymentForm
            summary={summary}
            onSuccess={(id) => { setPiId(id); setProgressStep(0); setStep("progress"); }}
            onError={(msg) => { setErrorMsg(msg); setStep("error"); }}
          />
        </Elements>
      </main>
    );
  }

  // ── CREATE (default) ──────────────────────────────────────────────────────
  const accInfo = getAccountInfo(country, linkMode === "remesa" ? receiveMode : "bank");

  return (
    <main className="min-h-screen bg-[#0f172a] flex flex-col px-5 pt-10 pb-10 max-w-sm mx-auto w-full">

      {/* Header */}
      <div className="flex items-center gap-2 mb-7">
        <Zap className="w-6 h-6 text-indigo-400" />
        <span className="text-lg font-bold text-white">OmniPay</span>
      </div>

      {/* Toggle Individual / Corporativo */}
      <div className="flex rounded-xl overflow-hidden border border-slate-700 mb-6">
        <button
          onClick={() => setLinkMode("cobro")}
          className={`flex-1 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
            linkMode === "cobro"
              ? "bg-emerald-600 text-white"
              : "text-slate-400 hover:text-slate-200 bg-transparent"
          }`}
        >
          <Store className="w-4 h-4" /> Cliente Individual
        </button>
        <button
          onClick={() => setLinkMode("remesa")}
          className={`flex-1 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
            linkMode === "remesa"
              ? "bg-indigo-600 text-white"
              : "text-slate-400 hover:text-slate-200 bg-transparent"
          }`}
        >
          <Building2 className="w-4 h-4" /> Empresa / Corporativo
        </button>
      </div>

      {/* Form fields */}
      <div className="space-y-4 flex-1">

        {/* Provider name */}
        <div>
          <label className="block text-xs text-slate-400 mb-1">
            Proveedor / Profesionista
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={linkMode === "cobro" ? "Dr. López Dental" : "Corporativo Bancomer S.A."}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm"
          />
        </div>

        {/* Country */}
        <div>
          <label className="block text-xs text-slate-400 mb-1">País del cliente pagador</label>
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 text-sm"
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Disbursement method (corporate only) */}
        {linkMode === "remesa" && (
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Método de liquidación al proveedor
            </label>
            <div className="flex gap-2">
              {(["bank", "card", "wallet"] as ReceiveMode[]).map((m) => {
                const Icon  = m === "bank" ? Building2 : m === "card" ? CreditCard : Smartphone;
                const label = m === "bank" ? "Transferencia" : m === "card" ? "Tarjeta Corp." : "Billetera";
                return (
                  <button
                    key={m}
                    onClick={() => { setReceiveMode(m); setAccount(""); }}
                    className={`flex-1 py-2 rounded-xl border text-xs flex flex-col items-center gap-1 transition-colors ${
                      receiveMode === m
                        ? "border-indigo-500 bg-indigo-600/20 text-indigo-300"
                        : "border-slate-700 text-slate-400 hover:text-white"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Account number */}
        <div>
          <label className="block text-xs text-slate-400 mb-1">{accInfo.label}</label>
          <input
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            placeholder={accInfo.placeholder}
            inputMode={accInfo.inputMode}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm font-mono"
          />
        </div>

        {/* Amount + Currency */}
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="block text-xs text-slate-400 mb-1">Importe de la Factura</label>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="1,000"
              inputMode="decimal"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm"
            />
          </div>
          <div className="w-24">
            <label className="block text-xs text-slate-400 mb-1">Moneda</label>
            <input
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))}
              placeholder="MXN"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm uppercase"
            />
          </div>
        </div>

        {/* Provider phone */}
        <div>
          <label className="block text-xs text-slate-400 mb-1">
            Teléfono del proveedor
          </label>
          <input
            value={recipientPhone}
            onChange={(e) => setRPhone(e.target.value)}
            placeholder="+52 55 1234 5678"
            inputMode="tel"
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm"
          />
        </div>

        {/* Client phone */}
        <div>
          <label className="block text-xs text-slate-400 mb-1">
            Teléfono del cliente (opcional)
          </label>
          <input
            value={senderPhone}
            onChange={(e) => setSPhone(e.target.value)}
            placeholder="+1 416 555 0123"
            inputMode="tel"
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm"
          />
        </div>

        {/* Error */}
        {formError && (
          <p className="text-red-400 text-sm">{formError}</p>
        )}

        {/* Submit */}
        <button
          onClick={handleCreate}
          disabled={submitting}
          className="w-full bg-indigo-600 hover:bg-indigo-500 active:scale-95 disabled:opacity-50 transition-all text-white py-4 rounded-2xl font-semibold text-lg mt-2"
        >
          {submitting ? "Procesando…" : "Generar Enlace de Cobro"}
        </button>

        <p className="text-center text-xs text-slate-600 pb-4">
          🔒 Los datos de cuenta viajan cifrados — OmniPay no los almacena
        </p>

      </div>
    </main>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";
import { useLocale } from "next-intl";
import PAGE_MESSAGES from "@/lib/pageMessages";
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
import { buildWhatsAppLink, buildTelegramLink, buildOmniPayMessage } from "@/lib/messaging";

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

interface FeeBreakdown {
  wiseFee:    number;
  omniPayFee: number;
  stripeFee:  number;
}

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
  feeBreakdown?:    FeeBreakdown;
}

interface ShareQuote {
  receiveAmount:          number;
  receiveCurrency:        string;
  estimatedOriginAmount:  number;
  originCurrency:         string;
}

// ── Country → UI locale mapping ───────────────────────────────────────────────
const COUNTRY_LOCALE: Record<string, string> = {
  MX:"es", GT:"es", SV:"es", HN:"es", NI:"es", CR:"es", PA:"es",
  DO:"es", CU:"es", HT:"fr", JM:"en",
  CO:"es", VE:"es", EC:"es", PE:"es", BO:"es", CL:"es", AR:"es",
  UY:"es", PY:"es", BR:"pt",
  GB:"en", DE:"de", FR:"fr", ES:"es", IT:"it", NL:"nl", PT:"pt",
  BE:"fr", CH:"de", SE:"en", NO:"en", DK:"en", PL:"en", RO:"en", TR:"tr",
  IN:"hi", CN:"zh", JP:"ja", KR:"ko", PH:"en", ID:"id", MY:"en",
  TH:"en", VN:"vi", SG:"en", HK:"zh", PK:"en", BD:"en",
  SA:"ar", AE:"ar", IL:"en",
  AU:"en", NZ:"en",
  NG:"ha", KE:"sw", GH:"en", ZA:"en", EG:"ar", MA:"ar", TZ:"sw", SN:"fr",
};

// ── Client-side t() — interpolates {param} placeholders ──────────────────────
function makeT(locale: string) {
  const msgs = PAGE_MESSAGES[locale] ?? PAGE_MESSAGES["es"];
  return function t(key: string, params?: Record<string, string>): string {
    let str = msgs[key] ?? PAGE_MESSAGES["en"]?.[key] ?? key;
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        str = str.replaceAll(`{${k}}`, v);
      });
    }
    return str;
  };
}

// ── Data ──────────────────────────────────────────────────────────────────────
const COUNTRIES = [
  // América del Norte
  { code: "MX", name: "México",              currency: "MXN", phone: "+52" },
  { code: "US", name: "Estados Unidos",      currency: "USD", phone: "+1"  },
  { code: "CA", name: "Canadá",              currency: "CAD", phone: "+1"  },
  // América Central
  { code: "GT", name: "Guatemala",           currency: "GTQ", phone: "+502" },
  { code: "SV", name: "El Salvador",         currency: "USD", phone: "+503" },
  { code: "HN", name: "Honduras",            currency: "HNL", phone: "+504" },
  { code: "NI", name: "Nicaragua",           currency: "NIO", phone: "+505" },
  { code: "CR", name: "Costa Rica",          currency: "CRC", phone: "+506" },
  { code: "PA", name: "Panamá",              currency: "USD", phone: "+507" },
  // Caribe
  { code: "DO", name: "Rep. Dominicana",     currency: "DOP", phone: "+1"   },
  { code: "CU", name: "Cuba",               currency: "CUP", phone: "+53"  },
  { code: "HT", name: "Haití",              currency: "HTG", phone: "+509" },
  { code: "JM", name: "Jamaica",             currency: "JMD", phone: "+1"   },
  // América del Sur
  { code: "CO", name: "Colombia",            currency: "COP", phone: "+57"  },
  { code: "VE", name: "Venezuela",           currency: "USD", phone: "+58"  },
  { code: "EC", name: "Ecuador",             currency: "USD", phone: "+593" },
  { code: "PE", name: "Perú",               currency: "PEN", phone: "+51"  },
  { code: "BO", name: "Bolivia",             currency: "BOB", phone: "+591" },
  { code: "CL", name: "Chile",              currency: "CLP", phone: "+56"  },
  { code: "AR", name: "Argentina",           currency: "ARS", phone: "+54"  },
  { code: "UY", name: "Uruguay",             currency: "UYU", phone: "+598" },
  { code: "PY", name: "Paraguay",            currency: "PYG", phone: "+595" },
  { code: "BR", name: "Brasil",             currency: "BRL", phone: "+55"  },
  // Europa
  { code: "GB", name: "Reino Unido",         currency: "GBP", phone: "+44"  },
  { code: "DE", name: "Alemania",            currency: "EUR", phone: "+49"  },
  { code: "FR", name: "Francia",             currency: "EUR", phone: "+33"  },
  { code: "ES", name: "España",             currency: "EUR", phone: "+34"  },
  { code: "IT", name: "Italia",             currency: "EUR", phone: "+39"  },
  { code: "NL", name: "Países Bajos",        currency: "EUR", phone: "+31"  },
  { code: "PT", name: "Portugal",            currency: "EUR", phone: "+351" },
  { code: "BE", name: "Bélgica",            currency: "EUR", phone: "+32"  },
  { code: "CH", name: "Suiza",              currency: "CHF", phone: "+41"  },
  { code: "SE", name: "Suecia",             currency: "SEK", phone: "+46"  },
  { code: "NO", name: "Noruega",             currency: "NOK", phone: "+47"  },
  { code: "DK", name: "Dinamarca",           currency: "DKK", phone: "+45"  },
  { code: "PL", name: "Polonia",             currency: "PLN", phone: "+48"  },
  { code: "RO", name: "Rumania",             currency: "RON", phone: "+40"  },
  { code: "TR", name: "Turquía",             currency: "TRY", phone: "+90"  },
  // Asia
  { code: "IN", name: "India",              currency: "INR", phone: "+91"  },
  { code: "CN", name: "China",              currency: "CNY", phone: "+86"  },
  { code: "JP", name: "Japón",              currency: "JPY", phone: "+81"  },
  { code: "KR", name: "Corea del Sur",       currency: "KRW", phone: "+82"  },
  { code: "PH", name: "Filipinas",           currency: "PHP", phone: "+63"  },
  { code: "ID", name: "Indonesia",           currency: "IDR", phone: "+62"  },
  { code: "MY", name: "Malasia",             currency: "MYR", phone: "+60"  },
  { code: "TH", name: "Tailandia",           currency: "THB", phone: "+66"  },
  { code: "VN", name: "Vietnam",             currency: "VND", phone: "+84"  },
  { code: "SG", name: "Singapur",            currency: "SGD", phone: "+65"  },
  { code: "HK", name: "Hong Kong",           currency: "HKD", phone: "+852" },
  { code: "PK", name: "Pakistán",            currency: "PKR", phone: "+92"  },
  { code: "BD", name: "Bangladesh",          currency: "BDT", phone: "+880" },
  { code: "SA", name: "Arabia Saudita",      currency: "SAR", phone: "+966" },
  { code: "AE", name: "Emiratos Árabes",     currency: "AED", phone: "+971" },
  { code: "IL", name: "Israel",             currency: "ILS", phone: "+972" },
  // Oceanía
  { code: "AU", name: "Australia",           currency: "AUD", phone: "+61"  },
  { code: "NZ", name: "Nueva Zelanda",       currency: "NZD", phone: "+64"  },
  // África
  { code: "NG", name: "Nigeria",             currency: "NGN", phone: "+234" },
  { code: "KE", name: "Kenia",              currency: "KES", phone: "+254" },
  { code: "GH", name: "Ghana",              currency: "GHS", phone: "+233" },
  { code: "ZA", name: "Sudáfrica",           currency: "ZAR", phone: "+27"  },
  { code: "EG", name: "Egipto",             currency: "EGP", phone: "+20"  },
  { code: "MA", name: "Marruecos",           currency: "MAD", phone: "+212" },
  { code: "TZ", name: "Tanzania",            currency: "TZS", phone: "+255" },
  { code: "SN", name: "Senegal",             currency: "XOF", phone: "+221" },
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
  t,
}: {
  summary:   PaySummary;
  onSuccess: (piId: string) => void;
  onError:   (msg: string) => void;
  t:         (key: string, params?: Record<string, string>) => string;
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
      setErr(error.message ?? t("pay_error_default"));
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

  if (!stripe) {
    return (
      <div className="text-center py-6 space-y-2">
        <p className="text-slate-400 text-sm">{t("checkout_loading")}</p>
        <p className="text-slate-600 text-xs">
          Si esto persiste, verifica que <code>NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code> esté configurada en Vercel.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PaymentElement options={{ layout: "tabs" }} />
      {err && <p className="text-red-400 text-sm text-center">{err}</p>}
      <button
        onClick={handlePay}
        disabled={loading || !stripe}
        className="w-full bg-indigo-600 hover:bg-indigo-500 active:scale-95 disabled:opacity-50 transition-all text-white py-4 rounded-2xl font-semibold text-lg"
      >
        {loading ? t("checkout_paying") : t("checkout_pay_btn", { amount: payLabel })}
      </button>
      <p className="text-center text-xs text-slate-500">
        {t("checkout_trust")}
      </p>
    </div>
  );
}

// ── Locale → default country/currency mapping ─────────────────────────────────
const LOCALE_DEFAULTS: Record<string, { code: string; name: string; currency: string }> = {
  "es-MX": { code: "MX", name: "México",         currency: "MXN" },
  "es-CO": { code: "CO", name: "Colombia",        currency: "COP" },
  "es-AR": { code: "AR", name: "Argentina",       currency: "ARS" },
  "es-CL": { code: "CL", name: "Chile",           currency: "CLP" },
  "es-PE": { code: "PE", name: "Perú",            currency: "PEN" },
  "es-VE": { code: "VE", name: "Venezuela",       currency: "USD" },
  "es-EC": { code: "EC", name: "Ecuador",         currency: "USD" },
  "es-GT": { code: "GT", name: "Guatemala",       currency: "GTQ" },
  "es-DO": { code: "DO", name: "Rep. Dominicana", currency: "DOP" },
  "es-BO": { code: "BO", name: "Bolivia",         currency: "BOB" },
  "es-PY": { code: "PY", name: "Paraguay",        currency: "PYG" },
  "es-UY": { code: "UY", name: "Uruguay",         currency: "UYU" },
  "es-CR": { code: "CR", name: "Costa Rica",      currency: "CRC" },
  "es-HN": { code: "HN", name: "Honduras",        currency: "HNL" },
  "es-SV": { code: "SV", name: "El Salvador",     currency: "USD" },
  "es-NI": { code: "NI", name: "Nicaragua",       currency: "NIO" },
  "es-PA": { code: "PA", name: "Panamá",          currency: "USD" },
  "es":    { code: "ES", name: "España",          currency: "EUR" },
  "pt-BR": { code: "BR", name: "Brasil",          currency: "BRL" },
  "pt":    { code: "PT", name: "Portugal",        currency: "EUR" },
  "en-CA": { code: "CA", name: "Canadá",          currency: "CAD" },
  "en-US": { code: "US", name: "Estados Unidos",  currency: "USD" },
  "en-AU": { code: "AU", name: "Australia",       currency: "AUD" },
  "en-GB": { code: "GB", name: "Reino Unido",     currency: "GBP" },
  "en-NZ": { code: "NZ", name: "Nueva Zelanda",   currency: "NZD" },
  "en-IN": { code: "IN", name: "India",           currency: "INR" },
  "en-SG": { code: "SG", name: "Singapur",        currency: "SGD" },
  "en-PH": { code: "PH", name: "Filipinas",       currency: "PHP" },
  "en-NG": { code: "NG", name: "Nigeria",         currency: "NGN" },
  "en-GH": { code: "GH", name: "Ghana",           currency: "GHS" },
  "en-KE": { code: "KE", name: "Kenia",           currency: "KES" },
  "en-ZA": { code: "ZA", name: "Sudáfrica",       currency: "ZAR" },
  "fr-FR": { code: "FR", name: "Francia",         currency: "EUR" },
  "fr":    { code: "FR", name: "Francia",         currency: "EUR" },
  "de":    { code: "DE", name: "Alemania",        currency: "EUR" },
  "it":    { code: "IT", name: "Italia",          currency: "EUR" },
  "nl":    { code: "NL", name: "Países Bajos",    currency: "EUR" },
  "ja":    { code: "JP", name: "Japón",           currency: "JPY" },
  "ko":    { code: "KR", name: "Corea del Sur",   currency: "KRW" },
  "zh":    { code: "CN", name: "China",           currency: "CNY" },
  "zh-TW": { code: "HK", name: "Hong Kong",       currency: "HKD" },
  "hi":    { code: "IN", name: "India",           currency: "INR" },
  "ar":    { code: "SA", name: "Arabia Saudita",  currency: "SAR" },
  "ar-AE": { code: "AE", name: "Emiratos Árabes", currency: "AED" },
  "ru":    { code: "RU", name: "Rusia",           currency: "RUB" },
  "tr":    { code: "TR", name: "Turquía",         currency: "TRY" },
  "id":    { code: "ID", name: "Indonesia",       currency: "IDR" },
  "vi":    { code: "VN", name: "Vietnam",         currency: "VND" },
  "sw":    { code: "KE", name: "Kenia",           currency: "KES" },
  "ha":    { code: "NG", name: "Nigeria",         currency: "NGN" },
  "am":    { code: "ET", name: "Etiopía",         currency: "ETB" },
};

function getLocaleDefault(browserLocale: string) {
  if (LOCALE_DEFAULTS[browserLocale]) return LOCALE_DEFAULTS[browserLocale];
  const lang = browserLocale.split("-")[0];
  return LOCALE_DEFAULTS[lang] ?? { code: "MX", name: "México", currency: "MXN" };
}

// ── Main One-Page App ─────────────────────────────────────────────────────────
export default function Home() {
  const serverLocale = useLocale();
  const [uiLocale, setUiLocale] = useState(serverLocale);
  const t = useCallback(makeT(uiLocale), [uiLocale]);
  const [step, setStep] = useState<Step>("loading");

  // — form —
  const [linkMode,       setLinkMode]     = useState<LinkMode>("cobro");
  const [name,           setName]         = useState("");
  const [country,        setCountry]      = useState("MX");
  const [countryName,    setCountryName]  = useState("México");
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

  // — PWA install —
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [showIosHint,   setShowIosHint]   = useState(false);
  const [installDone,   setInstallDone]   = useState(false);

  // — progress —
  const [progressStep, setProgressStep] = useState(0);
  const [piId,         setPiId]         = useState<string | null>(null);
  const [errorMsg,     setErrorMsg]     = useState("");

  // ── URL detection + locale-based country default ─────────────────────────
  useEffect(() => {
    const p   = new URLSearchParams(window.location.search);
    const tok = p.get("t");
    const sig = p.get("s");
    if (tok && sig) {
      setTokenData({ token: tok, sig, type: p.get("type") ?? "remesa" });
      setStep("checkout_init");
    } else {
      // Auto-set country/currency/phone prefix + UI language from browser locale
      const loc = navigator.language ?? "es-MX";
      const def = getLocaleDefault(loc);
      setCountry(def.code);
      setCountryName(def.name);
      setCurrency(def.currency);
      const prefix = COUNTRIES.find((c) => c.code === def.code)?.phone;
      if (prefix) setRPhone(prefix + " ");
      const initLocale = COUNTRY_LOCALE[def.code] ?? loc.split("-")[0] ?? "es";
      setUiLocale(initLocale);
      setStep("create");
    }
  }, []);

  // ── PWA install prompt ───────────────────────────────────────────────────
  useEffect(() => {
    // Android/Chrome: captura el evento beforeinstallprompt para mostrar botón propio
    const handler = (e: Event) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener("beforeinstallprompt", handler);

    // iOS Safari: detecta si no está en modo standalone y muestra instrucciones (con delay)
    const isIos        = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches;
    if (isIos && !isStandalone) setTimeout(() => setShowIosHint(true), 3000);

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  async function handleInstall() {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") { setInstallDone(true); setInstallPrompt(null); }
  }

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
        if (!cancelled) { setErrorMsg(t("error_connection")); setStep("error"); }
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
          setErrorMsg(t("error_default"));
          setStep("error");
        }
      } catch {}
    }, 2000);
    return () => clearInterval(iv);
  }, [step, piId]);

  // ── Auto-fill currency + phone prefix + UI language when country changes ─
  function handleCountryChange(input: string) {
    setCountryName(input);
    const match = COUNTRIES.find(
      (c) => c.name.toLowerCase() === input.toLowerCase()
    );
    if (match && match.code !== country) {
      setAccount("");
      setCountry(match.code);
      setCurrency(match.currency);
      // Cambiar idioma de la UI al idioma del país seleccionado
      const newLocale = COUNTRY_LOCALE[match.code] ?? "en";
      setUiLocale(newLocale);
      // Auto-rellenar prefijo telefónico
      const currentPrefix = COUNTRIES.find((c) => c.code === country)?.phone ?? "";
      const bare = recipientPhone.trim().replace(currentPrefix, "").trim();
      if (!bare) setRPhone(match.phone + " ");
    } else if (!match) {
      setCountry(input || "N/A");
    }
  }

  // ── Handlers ────────────────────────────────────────────────────────────
  async function handleCreate() {
    if (!name.trim() || !account.trim() || !amount) {
      setFormError(t("error_required"));
      return;
    }
    if (!validateAccount(account, country, linkMode === "remesa" ? receiveMode : "bank")) {
      setFormError(t("error_account"));
      return;
    }
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) {
      setFormError(t("error_amount"));
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
      if (!res.ok) { setFormError(data.error ?? t("error_link")); return; }

      setShareLink(data.share_link ?? "");
      setShareQuote(data.quote ?? null);
      setStep("share");
    } catch {
      setFormError(t("error_connection"));
    } finally {
      setSubmitting(false);
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(shareLink).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function buildShareMsg(): string {
    const who = name.trim() || "…";
    return linkMode === "remesa" && shareQuote
      ? t("wa_msg_corporate", { who, link: shareLink })
      : t("wa_msg_individual", { who, amount: fmt(parseFloat(amount || "0"), currency), link: shareLink });
  }

  async function openWhatsApp() {
    const msg = buildShareMsg();
    // Web Share API — abre el selector nativo de apps en móvil (más confiable que deeplinks)
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ text: msg });
        return;
      } catch {}
    }
    // Fallback desktop: deeplink wa.me
    window.open(buildWhatsAppLink(msg), "_blank");
  }

  async function openTelegram() {
    const msg = buildShareMsg();
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ text: msg });
        return;
      } catch {}
    }
    window.open(buildTelegramLink(shareLink, msg), "_blank");
  }

  function buildReceiptMsg(): string {
    return buildOmniPayMessage({
      clientName:    "Cliente",
      transactionId: piId ?? "—",
      amount:        summary?.cadAmount ?? 0,
      currency:      "CAD",
      concept:       "Servicios Profesionales",
      date:          new Date().toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" }),
      trackingUrl:   typeof window !== "undefined" ? window.location.href : "",
    });
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
          {step === "checkout_init" ? t("loading_fx") : t("loading_init")}
        </p>
      </main>
    );
  }

  // ── LIQUIDITY PAUSE ───────────────────────────────────────────────────────
  if (step === "liquidity_pause") {
    return (
      <main className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center px-6 text-center gap-5">
        <div className="text-5xl">⏳</div>
        <h2 className="text-xl font-semibold text-white">{t("liquidity_title")}</h2>
        <p className="text-slate-400 text-sm leading-relaxed max-w-xs">
          {t("liquidity_msg")}
        </p>
      </main>
    );
  }

  // ── PROGRESS ──────────────────────────────────────────────────────────────
  if (step === "progress") {
    const progressLabels = [
      t("progress_step1"),
      t("progress_step2"),
      t("progress_step3", { name: summary?.recipientName ?? "…" }),
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
      <main className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center px-6 text-center gap-5 max-w-sm mx-auto w-full">
        <CheckCircle2 className="w-16 h-16 text-emerald-400" />
        <h2 className="text-2xl font-bold text-white">{t("done_title")}</h2>
        <p className="text-slate-400 text-sm max-w-xs">
          {t("done_msg", { name: summary?.recipientName ?? "…" })}
        </p>
        <div className="w-full space-y-3 mt-2">
          <button
            onClick={() => window.open(buildWhatsAppLink(buildReceiptMsg()), "_blank")}
            className="w-full bg-[#25D366] hover:bg-[#1fb85a] active:scale-95 transition-all text-white py-3 rounded-2xl font-medium flex items-center justify-center gap-2"
          >
            <Send className="w-4 h-4" />
            {t("done_whatsapp")}
          </button>
          <button
            onClick={() => window.open(buildTelegramLink(typeof window !== "undefined" ? window.location.href : "", buildReceiptMsg()), "_blank")}
            className="w-full bg-[#229ED9] hover:bg-[#1a8ec0] active:scale-95 transition-all text-white py-3 rounded-2xl font-medium flex items-center justify-center gap-2"
          >
            <Send className="w-4 h-4" />
            {t("done_telegram")}
          </button>
        </div>
      </main>
    );
  }

  // ── ERROR ─────────────────────────────────────────────────────────────────
  if (step === "error") {
    return (
      <main className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center px-6 text-center gap-5">
        <AlertCircle className="w-14 h-14 text-red-400" />
        <h2 className="text-xl font-semibold text-white">{t("error_title")}</h2>
        <p className="text-slate-400 text-sm max-w-xs">
          {errorMsg || t("error_default")}
        </p>
        <button
          onClick={() => { setStep("create"); setErrorMsg(""); }}
          className="text-indigo-400 text-sm underline mt-2"
        >
          {t("error_reset")}
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
          <ArrowLeft className="w-4 h-4" /> {t("share_back")}
        </button>

        <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center">
          <CheckCircle2 className="w-14 h-14 text-emerald-400" />

          <div>
            <h2 className="text-2xl font-bold text-white mb-2">{t("share_title")}</h2>
            {shareQuote ? (
              <p className="text-slate-400 text-sm">
                {t("share_quote_label")}{" "}
                <span className="text-white font-medium">
                  ~{fmt(shareQuote.estimatedOriginAmount, shareQuote.originCurrency)}
                </span>
                <br />
                <span className="text-xs text-slate-500">
                  {t("share_quote_note")}
                </span>
              </p>
            ) : (
              <p className="text-slate-400 text-sm">
                {t("share_no_quote")}
              </p>
            )}
          </div>

          {/* Link preview */}
          {shareLink && (
            <div className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-2 text-center">
              <p className="text-slate-500 text-xs mb-0.5">{t("share_link_label")}</p>
              <p className="text-slate-300 text-xs font-mono break-all leading-relaxed">
                {shareLink.length > 60 ? shareLink.slice(0, 57) + "…" : shareLink}
              </p>
            </div>
          )}

          <div className="w-full space-y-3">
            <button
              onClick={openWhatsApp}
              className="w-full bg-[#25D366] hover:bg-[#1fb85a] active:scale-95 transition-all text-white py-4 rounded-2xl font-semibold text-lg flex items-center justify-center gap-2"
            >
              <Send className="w-5 h-5" />
              {t("share_whatsapp")}
            </button>
            <button
              onClick={openTelegram}
              className="w-full bg-[#229ED9] hover:bg-[#1a8ec0] active:scale-95 transition-all text-white py-4 rounded-2xl font-semibold text-lg flex items-center justify-center gap-2"
            >
              <Send className="w-5 h-5" />
              {t("share_telegram")}
            </button>
            <button
              onClick={handleCopy}
              className="w-full bg-slate-800 hover:bg-slate-700 active:scale-95 transition-all text-white py-3 rounded-2xl font-medium flex items-center justify-center gap-2"
            >
              {copied
                ? <><Check className="w-4 h-4 text-emerald-400" /> {t("share_copied")}</>
                : <><Copy className="w-4 h-4" /> {t("share_copy")}</>
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
          <span className="text-xs text-slate-500 ml-8">{t("checkout_subtitle")}</span>
        </div>

        {/* Summary card */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-5 mb-6 text-center">
          <p className="text-slate-400 text-xs mb-1 uppercase tracking-wide">
            {t("checkout_invoice_label")}
          </p>
          <p className="text-white text-sm font-medium mb-3">
            {t("checkout_invoice_for", { name: summary.recipientName })}
          </p>

          {summary.type === "remesa" && summary.receiveAmount && summary.receiveCurrency ? (
            <>
              <p className="text-3xl font-bold text-indigo-400 mb-1">
                {fmt(summary.receiveAmount, summary.receiveCurrency)}
              </p>
              {summary.wiseRate && (
                <p className="text-slate-400 text-xs mb-3">
                  {t("checkout_rate", { rate: summary.wiseRate.toFixed(4), currency: summary.receiveCurrency })}
                </p>
              )}

              {/* Desglose de tarifas */}
              {summary.feeBreakdown && (
                <div className="w-full bg-slate-900/60 rounded-xl px-4 py-3 mb-3 space-y-1.5 text-left">
                  <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-2">
                    {t("checkout_fee_title")}
                  </p>
                  <div className="flex justify-between text-xs text-slate-300">
                    <span>{t("checkout_fee_you_send")}</span>
                    <span className="font-mono">{fmt(summary.netCAD ?? 0, "CAD")}</span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>{t("checkout_fee_wise")}</span>
                    <span className="font-mono">+ {fmt(summary.feeBreakdown.wiseFee, "CAD")}</span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>{t("checkout_fee_omnipay")}</span>
                    <span className="font-mono">+ {fmt(summary.feeBreakdown.omniPayFee, "CAD")}</span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>{t("checkout_fee_stripe")}</span>
                    <span className="font-mono">+ {fmt(summary.feeBreakdown.stripeFee, "CAD")}</span>
                  </div>
                  <div className="border-t border-slate-700 pt-1.5 flex justify-between text-sm font-semibold text-white">
                    <span>{t("checkout_total")}</span>
                    <span className="font-mono">{fmt(summary.cadAmount, "CAD")}</span>
                  </div>
                </div>
              )}

              {summary.payoutMode === "INSTANT" && (
                <p className="text-amber-400 text-xs mt-1">
                  {t("checkout_instant_badge")}
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-3xl font-bold text-white mb-1">
                {fmt(summary.amount ?? summary.cadAmount, summary.currency ?? "CAD")}
              </p>
              <p className="text-slate-400 text-xs">{t("checkout_invoice_amount")}</p>
            </>
          )}

          <div className="flex items-center justify-center gap-1 mt-3 text-slate-500 text-xs">
            <Clock className="w-3 h-3" />
            <span>{t("checkout_quote_valid", { mins, secs })}</span>
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
            t={t}
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
          <Store className="w-4 h-4" /> {t("toggle_individual")}
        </button>
        <button
          onClick={() => setLinkMode("remesa")}
          className={`flex-1 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
            linkMode === "remesa"
              ? "bg-indigo-600 text-white"
              : "text-slate-400 hover:text-slate-200 bg-transparent"
          }`}
        >
          <Building2 className="w-4 h-4" /> {t("toggle_corporate")}
        </button>
      </div>

      {/* Form fields */}
      <div className="space-y-4 flex-1">

        {/* Provider name */}
        <div>
          <label className="block text-xs text-slate-400 mb-1">
            {t("label_provider")}
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={linkMode === "cobro" ? t("placeholder_individual") : t("placeholder_corporate")}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm"
          />
        </div>

        {/* Country */}
        <div>
          <label className="block text-xs text-slate-400 mb-1">{t("label_country")}</label>
          <input
            list="countries-list"
            value={countryName}
            onChange={(e) => handleCountryChange(e.target.value)}
            placeholder={t("placeholder_country")}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm"
          />
          <datalist id="countries-list">
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.name} />
            ))}
          </datalist>
        </div>

        {/* Disbursement method (corporate only) */}
        {linkMode === "remesa" && (
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              {t("label_method")}
            </label>
            <div className="flex gap-2">
              {(["bank", "card", "wallet"] as ReceiveMode[]).map((m) => {
                const Icon  = m === "bank" ? Building2 : m === "card" ? CreditCard : Smartphone;
                const label = m === "bank" ? t("mode_bank") : m === "card" ? t("mode_card") : t("mode_wallet");
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
            <label className="block text-xs text-slate-400 mb-1">{t("label_amount")}</label>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="1,000"
              inputMode="decimal"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm"
            />
          </div>
          <div className="w-24">
            <label className="block text-xs text-slate-400 mb-1">{t("label_currency")}</label>
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
            {t("label_provider_phone")}
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
            {t("label_client_phone")}
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
          {submitting ? t("btn_generating") : t("btn_generate")}
        </button>

        <p className="text-center text-xs text-slate-600 pb-2">
          {t("footer_security")}
        </p>

        {/* ── Banner de instalación PWA ── */}
        {!installDone && installPrompt && (
          <div className="flex items-center justify-between gap-3 bg-[#00C9C8]/10 border border-[#00C9C8]/30 rounded-2xl px-4 py-3">
            <div>
              <p className="text-[#00C9C8] text-sm font-medium">{t("pwa_title")}</p>
              <p className="text-slate-400 text-xs">{t("pwa_subtitle")}</p>
            </div>
            <button
              onClick={handleInstall}
              className="bg-[#00C9C8] text-slate-900 text-sm font-semibold px-4 py-2 rounded-xl whitespace-nowrap"
            >
              {t("pwa_btn")}
            </button>
          </div>
        )}

        {/* iOS: instrucciones manuales */}
        {!installDone && showIosHint && !installPrompt && (
          <div className="bg-[#00C9C8]/10 border border-[#00C9C8]/30 rounded-2xl px-4 py-3 space-y-1">
            <p className="text-[#00C9C8] text-sm font-medium">{t("pwa_ios_title")}</p>
            <p className="text-slate-400 text-xs leading-relaxed">{t("pwa_ios_steps")}</p>
            <button
              onClick={() => setShowIosHint(false)}
              className="text-slate-600 text-xs underline"
            >
              {t("pwa_ios_done")}
            </button>
          </div>
        )}

      </div>
    </main>
  );
}

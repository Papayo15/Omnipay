"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getFXRate } from "@/lib/fx";
import { COUNTRIES } from "@/constants/countries";

// Fee constants — mirror of lib/bridge-fees.ts (inline to avoid server-side import chain)
const BRIDGE_ONRAMP_PCT  = 0.005;   // 0.50%
const BRIDGE_OFFRAMP_PCT = 0.0025;  // 0.25%
const WISE_PCT           = 0.008;   // 0.80%
const STRIPE_PCT         = 0.029;   // 2.90%
const STRIPE_FLAT        = 0.30;
const OMNIPAY_PCT        = 0.005;   // 0.50%
const OMNIPAY_FLAT_P2P   = 0.99;
const OMNIPAY_FLAT_B2B   = 1.99;
const OMNIPAY_MIN        = 1.99;
const KYC_P2P            = 2.00;
const KYB_B2B            = 10.00;

// Countries with native Bridge bank rails
const BRIDGE_CODES = new Set([
  "US","MX","BR","CO","GB",
  "DE","FR","ES","IT","NL","PT","BE","AT","IE","FI","GR","CY","EE","LV","LT","LU","MT","SK","SI","HR",
  "SE","DK","NO","PL","CZ","HU","RO","BG","CH","IS","LI",
  "AD","MC","SM","XK","VA",
]);

const BRIDGE_COUNTRIES = COUNTRIES.filter(c => BRIDGE_CODES.has(c.code));

type Channel = "bridge" | "wise" | "b2b";

interface FeeLine { label: string; provider: string; amount: number; note?: string }
interface Quote {
  lines:    FeeLine[];
  total:    number;
  kyc:      number;
  currency: string;
  fxRate:   number | null;
  recipientAmount: number | null;
  recipientCurrency: string;
}

function calcQuote(
  channel: Channel,
  amount: number,
  destCurrency: string,
  fxRate: number | null,
  isNew: boolean,
): Quote {
  const lines: FeeLine[] = [];
  let total = amount;

  if (channel === "bridge") {
    const onramp  = parseFloat((amount * BRIDGE_ONRAMP_PCT).toFixed(2));
    const offramp = parseFloat((amount * BRIDGE_OFFRAMP_PCT).toFixed(2));
    const omni    = parseFloat((Math.max(amount * OMNIPAY_PCT, OMNIPAY_MIN) + OMNIPAY_FLAT_P2P).toFixed(2));
    const kyc     = isNew ? KYC_P2P : 0;
    lines.push({ label: "Bridge on-ramp (fiat→USDC)",  provider: "Bridge.xyz", amount: onramp  });
    lines.push({ label: "Bridge off-ramp (USDC→local)", provider: "Bridge.xyz", amount: offramp });
    lines.push({ label: "OmniPay servicio",             provider: "OmniPay",    amount: Math.max(amount * OMNIPAY_PCT, OMNIPAY_MIN) });
    lines.push({ label: "OmniPay flat",                 provider: "OmniPay",    amount: OMNIPAY_FLAT_P2P });
    if (kyc > 0) lines.push({ label: "Verificación de identidad (única vez)", provider: "Bridge.xyz", amount: kyc, note: "Solo en tu primera transacción" });
    total = parseFloat((amount + onramp + offramp + omni + kyc).toFixed(2));
  } else if (channel === "wise") {
    const wise = parseFloat((amount * WISE_PCT).toFixed(2));
    const omni = parseFloat((Math.max(amount * OMNIPAY_PCT, OMNIPAY_MIN) + OMNIPAY_FLAT_P2P).toFixed(2));
    lines.push({ label: "Wise transferencia + FX",  provider: "Wise",    amount: wise });
    lines.push({ label: "OmniPay servicio",          provider: "OmniPay", amount: Math.max(amount * OMNIPAY_PCT, OMNIPAY_MIN) });
    lines.push({ label: "OmniPay flat",              provider: "OmniPay", amount: OMNIPAY_FLAT_P2P });
    total = parseFloat((amount + wise + omni).toFixed(2));
  } else {
    // B2B
    const stripe = parseFloat((amount * STRIPE_PCT + STRIPE_FLAT).toFixed(2));
    const wise   = parseFloat((amount * WISE_PCT).toFixed(2));
    const omni   = parseFloat((Math.max(amount * OMNIPAY_PCT, OMNIPAY_MIN) + OMNIPAY_FLAT_B2B).toFixed(2));
    const kyb    = isNew ? KYB_B2B : 0;
    lines.push({ label: "Stripe aceptación de pago",   provider: "Stripe",  amount: stripe, note: "2.9% + $0.30" });
    lines.push({ label: "Wise transferencia + FX",      provider: "Wise",    amount: wise   });
    lines.push({ label: "OmniPay servicio",             provider: "OmniPay", amount: Math.max(amount * OMNIPAY_PCT, OMNIPAY_MIN) });
    lines.push({ label: "OmniPay flat B2B",             provider: "OmniPay", amount: OMNIPAY_FLAT_B2B });
    if (kyb > 0) lines.push({ label: "Verificación empresa (única vez)", provider: "Bridge.xyz", amount: kyb, note: "Solo en tu primera transacción" });
    total = parseFloat((amount + stripe + wise + omni + kyb).toFixed(2));
  }

  const recipientAmount = fxRate ? parseFloat((amount * fxRate).toFixed(2)) : null;

  return {
    lines,
    total,
    kyc: isNew ? (channel === "b2b" ? KYB_B2B : KYC_P2P) : 0,
    currency: channel === "wise" || channel === "b2b" ? "CAD" : "USD",
    fxRate,
    recipientAmount,
    recipientCurrency: destCurrency,
  };
}

const CHANNEL_LABELS: Record<Channel, { title: string; sub: string; src: string }> = {
  bridge: { title: "P2P desde EE.UU.",  sub: "via Bridge — minutos",    src: "USD" },
  wise:   { title: "P2P desde Canadá",  sub: "via Wise — 1-2 días",     src: "CAD" },
  b2b:    { title: "Empresa / B2B",     sub: "Stripe + Wise — 3-4 días", src: "CAD" },
};

const PROVIDER_COLORS: Record<string, string> = {
  "Bridge.xyz": "text-blue-400",
  "Wise":       "text-green-400",
  "Stripe":     "text-purple-400",
  "OmniPay":    "text-emerald-400",
};

function fmt(n: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
}

export default function Calculator() {
  const router = useRouter();
  const [channel, setChannel] = useState<Channel>("bridge");
  const [amount, setAmount]   = useState("300");
  const [country, setCountry] = useState("MX");
  const [isNew, setIsNew]     = useState(true);
  const [fxRate, setFxRate]   = useState<number | null>(null);
  const [quote, setQuote]     = useState<Quote | null>(null);

  const selectedCountry = BRIDGE_COUNTRIES.find(c => c.code === country) ?? BRIDGE_COUNTRIES[0];

  // Determine destination currency based on Bridge rules (SEPA = always EUR)
  const sepaCountries = new Set(["DE","FR","ES","IT","NL","PT","BE","AT","IE","FI","GR","CY","EE","LV","LT","LU","MT","SK","SI","HR","SE","DK","NO","PL","CZ","HU","RO","BG","CH","IS","LI","AD","MC","SM","XK","VA"]);
  const destCurrency =
    country === "MX" ? "MXN" :
    country === "US" ? "USD" :
    country === "BR" ? "BRL" :
    country === "CO" ? "COP" :
    country === "GB" ? "GBP" :
    sepaCountries.has(country) ? "EUR" : "USD";

  const srcCurrency = CHANNEL_LABELS[channel].src;

  const fetchRate = useCallback(async () => {
    if (srcCurrency === destCurrency) { setFxRate(1); return; }
    const r = await getFXRate(srcCurrency, destCurrency);
    setFxRate(r);
  }, [srcCurrency, destCurrency]);

  useEffect(() => { fetchRate(); }, [fetchRate]);

  useEffect(() => {
    const n = parseFloat(amount);
    if (!isNaN(n) && n > 0) {
      setQuote(calcQuote(channel, n, destCurrency, fxRate, isNew));
    } else {
      setQuote(null);
    }
  }, [channel, amount, destCurrency, fxRate, isNew]);

  function handleProceed() {
    const n = parseFloat(amount);
    if (!n) return;
    if (channel === "b2b") {
      router.push("/");
    } else {
      router.push(`/p2p?amount=${n}&currency=${srcCurrency}&country=${country}`);
    }
  }

  // Channel selector tabs
  const channels: Channel[] = ["bridge", "wise", "b2b"];

  return (
    <div className="w-full max-w-md mx-auto rounded-2xl bg-slate-900 border border-slate-700 overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-5 pb-3 border-b border-slate-800">
        <p className="text-slate-400 text-xs uppercase tracking-wider mb-2">Simula tu envío</p>
        <div className="flex gap-1">
          {channels.map(ch => (
            <button
              key={ch}
              onClick={() => setChannel(ch)}
              className={`flex-1 rounded-lg py-2 px-1 text-xs font-medium transition-colors ${
                channel === ch
                  ? "bg-emerald-500 text-white"
                  : "bg-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              <div>{CHANNEL_LABELS[ch].title}</div>
              <div className="text-[10px] opacity-70">{CHANNEL_LABELS[ch].sub}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Amount input */}
        <div>
          <label className="text-slate-400 text-xs block mb-1">
            Monto que envías ({srcCurrency})
          </label>
          <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3">
            <span className="text-slate-400 font-mono">{srcCurrency === "USD" ? "$" : "CA$"}</span>
            <input
              type="number"
              min="1"
              step="any"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="flex-1 bg-transparent text-white text-xl font-semibold outline-none"
              placeholder="300"
            />
            <span className="text-slate-500 text-sm">{srcCurrency}</span>
          </div>
        </div>

        {/* Country selector */}
        {channel !== "b2b" && (
          <div>
            <label className="text-slate-400 text-xs block mb-1">País destino</label>
            <div className="flex gap-1 flex-wrap max-h-28 overflow-y-auto">
              {BRIDGE_COUNTRIES.slice(0, 12).map(c => (
                <button
                  key={c.code}
                  onClick={() => setCountry(c.code)}
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-colors ${
                    country === c.code
                      ? "bg-emerald-500/20 border border-emerald-500 text-emerald-300"
                      : "bg-slate-800 border border-slate-700 text-slate-400 hover:text-white"
                  }`}
                >
                  <span>{c.flag}</span>
                  <span>{c.code}</span>
                </button>
              ))}
              <select
                value={BRIDGE_COUNTRIES.slice(12).some(c => c.code === country) ? country : ""}
                onChange={e => e.target.value && setCountry(e.target.value)}
                className="bg-slate-800 border border-slate-700 text-slate-400 text-xs rounded-lg px-2 py-1"
              >
                <option value="">Más países…</option>
                {BRIDGE_COUNTRIES.slice(12).map(c => (
                  <option key={c.code} value={c.code}>{c.flag} {c.name}</option>
                ))}
              </select>
            </div>
            {fxRate && (
              <p className="text-slate-500 text-xs mt-1">
                1 {srcCurrency} = {fxRate.toFixed(4)} {destCurrency} (tipo de cambio live)
              </p>
            )}
          </div>
        )}

        {/* Primera vez toggle */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isNew}
            onChange={e => setIsNew(e.target.checked)}
            className="w-4 h-4 accent-emerald-500"
          />
          <span className="text-slate-400 text-xs">Primera transacción (incluye verificación)</span>
        </label>

        {/* Fee breakdown */}
        {quote && (
          <div className="bg-slate-800/60 rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm text-slate-300 pb-2 border-b border-slate-700">
              <span>Principal enviado</span>
              <span className="font-semibold">{fmt(parseFloat(amount || "0"), srcCurrency)}</span>
            </div>
            {quote.lines.map((line, i) => (
              <div key={i} className="flex justify-between text-xs">
                <div>
                  <span className="text-slate-400">{line.label}</span>
                  {line.note && <span className="text-slate-600 ml-1">· {line.note}</span>}
                  <span className={`ml-1 ${PROVIDER_COLORS[line.provider] ?? "text-slate-500"}`}>({line.provider})</span>
                </div>
                <span className="text-slate-300 font-mono ml-2">+{fmt(line.amount, srcCurrency)}</span>
              </div>
            ))}
            <div className="flex justify-between text-sm font-semibold pt-2 border-t border-slate-700">
              <span className="text-white">Total que pagas</span>
              <span className="text-emerald-400">{fmt(quote.total, srcCurrency)}</span>
            </div>
            {quote.recipientAmount && channel !== "b2b" && (
              <div className="flex justify-between text-xs text-slate-400 pt-1">
                <span>Receptor recibe (aprox.)</span>
                <span className="font-mono">{fmt(quote.recipientAmount, destCurrency)} {destCurrency}</span>
              </div>
            )}
            {channel === "b2b" && (
              <p className="text-slate-500 text-xs pt-1">
                El tipo de cambio final lo determina Wise en el momento del pago
              </p>
            )}
          </div>
        )}

        {/* Proceed button */}
        <button
          onClick={handleProceed}
          disabled={!quote}
          className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl py-3 transition-colors"
        >
          {channel === "b2b" ? "Ver opciones B2B →" : `Proceder con este envío →`}
        </button>
        <p className="text-center text-slate-600 text-xs">
          Sin registro previo · Quote sin compromiso
        </p>
      </div>
    </div>
  );
}

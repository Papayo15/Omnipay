"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, Send } from "lucide-react";
import AmountInput from "@/components/AmountInput";
import CommissionToggle from "@/components/CommissionToggle";
import FeeBreakdown from "@/components/FeeBreakdown";
import CountrySelector from "@/components/CountrySelector";
import BankCombobox from "@/components/BankCombobox";
import AccountInput from "@/components/AccountInput";
import ExchangeRateDisplay from "@/components/ExchangeRateDisplay";
import ShareButton from "@/components/ShareButton";
import { buildPayload, buildPaymentURL } from "@/lib/payload";
import { selectRailByTransactionType, type Rail } from "@/constants/rails";
import { DEFAULT_COUNTRY, COUNTRIES, type Country } from "@/constants/countries";
import { BANKS_BY_COUNTRY, getUSRouting, getAccountInputMeta, type BankInfo } from "@/constants/banks";
import { getFXRate } from "@/lib/fx";
import { usePaymentStore } from "@/lib/store/paymentStore";

const DEFAULT_ORIGIN = COUNTRIES.find((c) => c.code === "MX") ?? DEFAULT_COUNTRY;
// Países que usan Binance Pay (mercados restringidos / control cambiario)
const BINANCE_PAY_COUNTRIES = ["RU","VE","PK","TR","IR","SY","CU"];

export default function UniversalForm() {
  const router = useRouter();
  const store = usePaymentStore();

  // Identity — senderCard lives ONLY here, never in Zustand (PCI compliance)
  const [senderName, setSenderName] = useState("");
  const [senderCard, setSenderCard] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");

  const [originCountry, setOriginCountry] = useState<Country>(DEFAULT_ORIGIN);
  const [destCountry, setDestCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [selectedBank, setSelectedBank] = useState<BankInfo | null>(null);
  const [detectedBank, setDetectedBank] = useState<BankInfo | null>(null);
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState(0);
  const [mode, setMode] = useState<"A" | "B">("A");

  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [fxUpdatedAt, setFxUpdatedAt] = useState<number | null>(null);
  const [fxLoading, setFxLoading] = useState(false);

  const [paymentUrl, setPaymentUrl] = useState("");
  const [generating, setGenerating] = useState(false);
  const [showShare, setShowShare] = useState(false);

  const isCrossCountry = originCountry.code !== destCountry.code;
  const receiverAmount = amount > 0 && exchangeRate && isCrossCountry
    ? parseFloat(((amount * (1 - 0.0025)) * exchangeRate).toFixed(2))
    : amount;
  const fxAgoSecs = fxUpdatedAt ? Math.floor((Date.now() - fxUpdatedAt) / 1000) : undefined;

  // Mutant button mode — 16 exact digits = direct payment, 0 = link mode
  const hasDirectPayment = senderCard.length === 16;

  // canProceed: recipient data + amount filled, AND sender card is either empty OR exactly 16 digits
  // 1-15 digits = "tarjeta mocha" = block
  const senderCardOk = senderCard.length === 0 || senderCard.length === 16;
  const canProceed = amount > 0 && accountId.trim().length > 0 && senderCardOk;

  const fetchFX = useCallback(async (from: string, to: string) => {
    if (from === to) { setExchangeRate(1); return; }
    setFxLoading(true);
    const rate = await getFXRate(from, to);
    setExchangeRate(rate);
    setFxUpdatedAt(Date.now());
    setFxLoading(false);
  }, []);

  useEffect(() => {
    if (amount > 0) fetchFX(originCountry.currency, destCountry.currency);
  }, [originCountry.currency, destCountry.currency, amount, fetchFX]);

  function buildBankToken(): string {
    const base = accountId.trim();
    if (destCountry.code === "US" && selectedBank) {
      const routing = getUSRouting(selectedBank.id) ?? selectedBank.routing ?? "";
      return `${routing}|${base}`;
    }
    return base;
  }

  function getRail(): Rail {
    if (BINANCE_PAY_COUNTRIES.includes(destCountry.code)) return "binance_pay";
    return selectRailByTransactionType(isCrossCountry ? "remesa" : "terminal", destCountry.code, accountId);
  }

  async function handleGenerateLink() {
    if (!canProceed) return;
    setGenerating(true);
    try {
      const rail = getRail();
      const encoded = await buildPayload({
        amount: receiverAmount,
        currency: destCountry.currency,
        mode,
        rail,
        bankToken: buildBankToken(),
        bankName: selectedBank?.name ?? destCountry.name,
        country: destCountry.code,
        receiverName: recipientName || selectedBank?.name || destCountry.name,
        transactionType: isCrossCountry ? "remesa" : "terminal",
        ...(isCrossCountry && { sourceCurrency: originCountry.currency, senderAmount: amount, exchangeRate: exchangeRate ?? undefined }),
      });
      setPaymentUrl(buildPaymentURL(encoded));
      setShowShare(true);
    } finally {
      setGenerating(false);
    }
  }

  function handlePayNow() {
    if (!canProceed) return;
    const rail = getRail();
    store.setAmount(receiverAmount);
    store.setCurrency(destCountry.currency);
    store.setMode(mode);
    store.setCountry(destCountry.code);
    store.setRail(rail);
    store.setAccountId(buildBankToken());
    store.setBankName(selectedBank?.name ?? destCountry.name);
    store.setTransactionType(isCrossCountry ? "remesa" : "terminal");
    store.setSenderName(senderName);
    store.setRecipientName(recipientName);
    store.setRecipientPhone(recipientPhone);
    if (isCrossCountry) {
      store.setSourceCurrency(originCountry.currency);
      store.setSourceCountry(originCountry.code);
      store.setSenderAmount(amount);
      store.setExchangeRate(exchangeRate, fxUpdatedAt ?? undefined);
    }
    // senderCard is NOT stored — it was only needed to determine the flow
    router.push("/confirmar");
  }

  const accountMeta = (() => {
    if (destCountry.code === "CN") {
      return { label: "Teléfono o tarjeta UnionPay", placeholder: "Ej. 138 0000 0000 o 6225 xxxx xxxx xxxx" };
    }
    if (destCountry.code === "RU") {
      return { label: "Número de tarjeta MIR o billetera digital", placeholder: "Ej. 2200 xxxx xxxx xxxx" };
    }
    return selectedBank ? getAccountInputMeta(selectedBank.accountType) : { label: "Número de cuenta", placeholder: "Número de cuenta" };
  })();

  const amountLabel = amount > 0
    ? new Intl.NumberFormat("es-MX", { style: "currency", currency: destCountry.currency }).format(receiverAmount)
    : "";

  return (
    <div className="flex flex-col gap-5">

      {/* Sender identity */}
      <div className="flex flex-col gap-3">
        <input
          type="text"
          value={senderName}
          onChange={(e) => setSenderName(e.target.value)}
          placeholder="¿Quién envía? (nombre o empresa)"
          className="bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
        />

        {/* Sender card — local state only, never persisted, triggers direct-payment mode */}
        <div>
          <input
            type="tel"
            inputMode="numeric"
            value={senderCard}
            onChange={(e) => setSenderCard(e.target.value.replace(/\D/g, "").slice(0, 16))}
            placeholder="Tarjeta del emisor (opcional — si está contigo)"
            className={`w-full bg-slate-800/60 border rounded-xl px-4 py-3 text-white placeholder-slate-500 text-sm focus:outline-none transition-colors ${
              senderCard.length > 0 && senderCard.length < 16
                ? "border-red-600/60 focus:border-red-500"
                : senderCard.length === 16
                ? "border-emerald-600/60 focus:border-emerald-500"
                : "border-slate-700 focus:border-emerald-500"
            }`}
          />
          <p className={`text-xs px-1 mt-1 ${
            senderCard.length === 16 ? "text-emerald-400"
            : senderCard.length > 0  ? "text-red-400"
            : "text-slate-600"
          }`}>
            {senderCard.length === 16
              ? "✓ Cliente presente — se procesará el pago al instante"
              : senderCard.length > 0
              ? `${senderCard.length}/16 dígitos — número incompleto`
              : "Vacío → se generará un link para que el cliente pague desde su celular"
            }
          </p>
        </div>
      </div>

      {/* Recipient identity */}
      <div className="flex flex-col gap-3">
        <input
          type="text"
          value={recipientName}
          onChange={(e) => setRecipientName(e.target.value)}
          placeholder="¿Quién recibe? (nombre o empresa)"
          className="bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
        />
        <input
          type="tel"
          value={recipientPhone}
          onChange={(e) => setRecipientPhone(e.target.value)}
          placeholder="Tel. receptor para notificación SMS (opcional)"
          className="bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
        />
      </div>

      {/* Origin / Destination countries */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-slate-500 text-xs">País origen</p>
          <CountrySelector value={originCountry.code} onChange={setOriginCountry} />
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-slate-500 text-xs">País destino</p>
          <CountrySelector value={destCountry.code} onChange={(c) => {
            setDestCountry(c);
            setAccountId("");
            const banks = BANKS_BY_COUNTRY[c.code] ?? [];
            setSelectedBank(banks[0] ?? null);
          }} />
        </div>
      </div>

      {/* Bank + account */}
      <BankCombobox
        country={destCountry.code}
        value={selectedBank?.id ?? ""}
        detectedBank={detectedBank}
        onChange={(bank) => { setSelectedBank(bank); setDetectedBank(null); setAccountId(""); }}
      />
      {destCountry.code === "RU" && (
        <div className="bg-amber-900/30 border border-amber-700/50 rounded-2xl p-4 text-sm text-amber-300">
          ⚡ Ruta Internacional Activada: El envío a Rusia se procesará a través de canales directos de alta seguridad. El receptor recibirá el equivalente exacto en Rublos en su tarjeta MIR o billetera. Tiempo estimado: 2–5 minutos.
        </div>
      )}
      <AccountInput
        label={accountMeta.label}
        placeholder={accountMeta.placeholder}
        value={accountId}
        country={destCountry.code}
        onChange={(val, auto) => {
          setAccountId(val);
          if (auto) { setDetectedBank(auto); setSelectedBank(auto); }
        }}
      />

      {/* Amount + commission */}
      <AmountInput value={amount} currency={originCountry.currency} onChange={setAmount} />
      <CommissionToggle mode={mode} onChange={setMode} transactionType={isCrossCountry ? "remesa" : "terminal"} />

      {/* FX display */}
      {isCrossCountry && amount > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-3">
          {fxLoading ? (
            <div className="text-center text-slate-500 text-sm">Obteniendo tipo de cambio...</div>
          ) : exchangeRate ? (
            <>
              <ExchangeRateDisplay
                fromCurrency={originCountry.currency}
                toCurrency={destCountry.currency}
                fromFlag={originCountry.flag}
                toFlag={destCountry.flag}
                rate={exchangeRate}
                updatedAgo={fxAgoSecs}
              />
              <div className="bg-indigo-950/40 border border-indigo-800/40 rounded-2xl p-4 text-center">
                <p className="text-slate-400 text-sm">El receptor recibirá</p>
                <p className="text-indigo-300 text-2xl font-bold mt-1">
                  {new Intl.NumberFormat("es-MX", { style: "currency", currency: destCountry.currency }).format(receiverAmount)}
                </p>
              </div>
            </>
          ) : null}
        </motion.div>
      )}

      <FeeBreakdown
        amount={receiverAmount}
        currency={destCountry.currency}
        mode={mode}
        transactionType={isCrossCountry ? "remesa" : "terminal"}
        {...(isCrossCountry && exchangeRate ? { senderAmount: amount, sourceCurrency: originCountry.currency, exchangeRate } : {})}
      />

      {/* ── Single Mutant Button ── */}
      <AnimatePresence mode="wait">
        {!showShare ? (
          <motion.div key="action" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-2">
            <button
              disabled={!canProceed || generating}
              onClick={hasDirectPayment ? handlePayNow : handleGenerateLink}
              className={`w-full text-white font-bold text-lg py-5 rounded-2xl flex items-center justify-center gap-2 transition-all touch-manipulation ${
                !canProceed || generating
                  ? "bg-slate-700 text-slate-500"
                  : hasDirectPayment
                  ? "bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-900/40"
                  : "bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-900/40"
              }`}
            >
              {generating ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : hasDirectPayment ? (
                <><Zap className="w-5 h-5" /> PROCESAR Y ENVIAR AHORA</>
              ) : (
                <><Send className="w-5 h-5" /> ENVIAR LINK POR WHATSAPP / SMS</>
              )}
            </button>
            <p className="text-slate-600 text-xs text-center mt-2">
              {hasDirectPayment
                ? "El dinero se enviará al instante"
                : canProceed
                ? "Se generará un link cifrado de 5 min para que el cliente pague desde su celular"
                : senderCard.length > 0 && senderCard.length < 16
                ? "Completa los 16 dígitos de la tarjeta o bórrala para enviar un link"
                : "Completa los datos del receptor y el monto para continuar"
              }
            </p>
          </motion.div>
        ) : (
          <motion.div key="share" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <ShareButton url={paymentUrl} amount={amountLabel} transactionType={isCrossCountry ? "remesa" : "terminal"} />
            <button
              onClick={() => { setShowShare(false); setSenderCard(""); }}
              className="w-full text-slate-500 text-sm text-center mt-3 touch-manipulation"
            >
              ← Editar datos
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

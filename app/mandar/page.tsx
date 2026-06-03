"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ChevronRight, QrCode, ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import AmountInput from "@/components/AmountInput";
import CommissionToggle from "@/components/CommissionToggle";
import FeeBreakdown from "@/components/FeeBreakdown";
import CountrySelector from "@/components/CountrySelector";
import BankCombobox from "@/components/BankCombobox";
import AccountInput from "@/components/AccountInput";
import QRScanner from "@/components/QRScanner";
import NFCButton from "@/components/NFCButton";
import ExchangeRateDisplay from "@/components/ExchangeRateDisplay";
import { parsePayload } from "@/lib/payload";
import { selectRailByTransactionType } from "@/constants/rails";
import { DEFAULT_COUNTRY, COUNTRIES, type Country } from "@/constants/countries";
import { BANKS_BY_COUNTRY, getUSRouting, getAccountInputMeta, type BankInfo } from "@/constants/banks";
import { getFXRate } from "@/lib/fx";
import { usePaymentStore } from "@/lib/store/paymentStore";

type Step = "method" | "origin" | "destination";

const DEFAULT_ORIGIN = COUNTRIES.find((c) => c.code === "US") ?? DEFAULT_COUNTRY;

export default function MandarPage() {
  const router = useRouter();
  const t = useTranslations("mandar");
  const [step, setStep] = useState<Step>("method");
  const [mode, setMode] = useState<"A" | "B">("A");

  const [originCountry, setOriginCountry] = useState<Country>(DEFAULT_ORIGIN);
  const [senderAmount, setSenderAmount] = useState(0);

  const [destCountry, setDestCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [selectedBank, setSelectedBank] = useState<BankInfo | null>(null);
  const [detectedBank, setDetectedBank] = useState<BankInfo | null>(null);
  const [accountId, setAccountId] = useState("");

  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [fxUpdatedAt, setFxUpdatedAt] = useState<number | null>(null);
  const [fxLoading, setFxLoading] = useState(false);
  const [decodeError, setDecodeError] = useState("");

  const store = usePaymentStore();

  const receiverAmount = senderAmount > 0 && exchangeRate
    ? parseFloat(((senderAmount * (1 - 0.0025)) * exchangeRate).toFixed(2))
    : 0;

  const fetchFX = useCallback(async (from: string, to: string) => {
    if (from === to) { setExchangeRate(1); return; }
    setFxLoading(true);
    const rate = await getFXRate(from, to);
    setExchangeRate(rate);
    setFxUpdatedAt(Date.now());
    setFxLoading(false);
  }, []);

  useEffect(() => {
    if (step !== "method") {
      fetchFX(originCountry.currency, destCountry.currency);
    }
  }, [originCountry.currency, destCountry.currency, step, fetchFX]);

  async function handleQRScan(encoded: string) {
    setDecodeError("");
    try {
      const payload = await parsePayload(encoded);
      store.setDecodedPayload(payload);
      store.setRail(payload.r);
      store.setTransactionType(payload.tt ?? "remesa");
      router.push(`/pagar?s=${encoded}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "error";
      if (msg === "expired") setDecodeError(t("expired"));
      else setDecodeError(t("invalid_code"));
    }
  }

  function buildBankToken(): string {
    const base = accountId.trim();
    if (destCountry.code === "US" && selectedBank) {
      const routing = getUSRouting(selectedBank.id) ?? selectedBank.routing ?? "";
      return `${routing}|${base}`;
    }
    return base;
  }

  function handleConfirm() {
    if (senderAmount <= 0 || !accountId.trim()) return;
    const rail = selectRailByTransactionType("remesa", destCountry.code, buildBankToken());
    store.setAmount(receiverAmount);
    store.setMode(mode);
    store.setCountry(destCountry.code);
    store.setCurrency(destCountry.currency);
    store.setRail(rail);
    store.setAccountId(buildBankToken());
    store.setBankName(selectedBank?.name ?? destCountry.name);
    store.setTransactionType("remesa");
    store.setSourceCurrency(originCountry.currency);
    store.setSourceCountry(originCountry.code);
    store.setSenderAmount(senderAmount);
    store.setExchangeRate(exchangeRate, fxUpdatedAt ?? undefined);
    router.push("/confirmar");
  }

  const accountMeta = selectedBank
    ? getAccountInputMeta(selectedBank.accountType)
    : { label: "Número de cuenta", placeholder: "Número de cuenta" };

  const fxAgoSecs = fxUpdatedAt ? Math.floor((Date.now() - fxUpdatedAt) / 1000) : undefined;

  function goBack() {
    if (step === "method") router.back();
    else if (step === "origin") setStep("method");
    else setStep("origin");
  }

  return (
    <main className="flex flex-col min-h-screen bg-[#0f172a] px-5 pt-10 pb-10">
      <div className="flex items-center gap-3 mb-8">
        <button onClick={goBack} className="p-2 rounded-xl hover:bg-slate-800 transition-colors touch-manipulation">
          <ArrowLeft className="w-6 h-6 text-slate-400" />
        </button>
        <h1 className="text-2xl font-bold text-white">{t("title")}</h1>
      </div>

      <AnimatePresence mode="wait">

        {step === "method" && (
          <motion.div key="method" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="flex flex-col gap-4 flex-1">
            <p className="text-slate-400 text-center mb-2">{t("how_send")}</p>
            <div className="bg-slate-800/40 rounded-2xl p-4 flex flex-col gap-3">
              <p className="text-white font-semibold text-sm">{t("have_qr")}</p>
              <QRScanner onScan={handleQRScan} />
              <NFCButton onRead={handleQRScan} />
              {decodeError && <p className="text-red-400 text-sm text-center">{decodeError}</p>}
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-slate-700" />
              <span className="text-slate-500 text-sm">o</span>
              <div className="flex-1 h-px bg-slate-700" />
            </div>

            <button
              onClick={() => {
                setStep("origin");
                const banks = BANKS_BY_COUNTRY[destCountry.code] ?? [];
                setSelectedBank(banks[0] ?? null);
              }}
              className="w-full border border-slate-700 rounded-2xl p-4 flex items-center gap-4 hover:bg-slate-800/40 touch-manipulation transition-colors text-left"
            >
              <div className="bg-indigo-900/50 rounded-xl p-3">
                <QrCode className="w-6 h-6 text-indigo-400" />
              </div>
              <div>
                <p className="text-white font-semibold">{t("send_manual")}</p>
                <p className="text-slate-400 text-sm">{t("send_manual_sub")}</p>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-500 ml-auto" />
            </button>
          </motion.div>
        )}

        {step === "origin" && (
          <motion.div key="origin" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col gap-5 flex-1">
            <p className="text-slate-400 text-center">{t("from_where")}</p>
            <CountrySelector value={originCountry.code} onChange={setOriginCountry} />
            <AmountInput value={senderAmount} currency={originCountry.currency} onChange={setSenderAmount} />
            <CommissionToggle mode={mode} onChange={setMode} transactionType="remesa" />

            {senderAmount > 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-3">
                {fxLoading ? (
                  <div className="text-center text-slate-500 text-sm">{t("fetching_rate")}</div>
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
                      <p className="text-slate-400 text-sm">{t("family_receives")}</p>
                      <p className="text-indigo-300 text-3xl font-bold mt-1">
                        {new Intl.NumberFormat("es-MX", { style: "currency", currency: destCountry.currency }).format(receiverAmount)}
                      </p>
                    </div>
                  </>
                ) : (
                  <ExchangeRateDisplay
                    fromCurrency={originCountry.currency}
                    toCurrency={destCountry.currency}
                    fromFlag={originCountry.flag}
                    toFlag={destCountry.flag}
                    rate={null}
                  />
                )}
              </motion.div>
            )}

            <div className="mt-auto">
              <button
                disabled={senderAmount <= 0}
                onClick={() => setStep("destination")}
                className="w-full bg-indigo-600 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold text-lg py-5 rounded-2xl flex items-center justify-center gap-2 transition-colors touch-manipulation"
              >
                {t("next_where")} <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </motion.div>
        )}

        {step === "destination" && (
          <motion.div key="destination" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col gap-5 flex-1">
            <p className="text-slate-400 text-center">{t("to_where")}</p>

            <div className="flex items-center justify-between bg-slate-800/50 rounded-2xl px-5 py-4">
              <div className="text-center">
                <p className="text-slate-500 text-xs mb-1">{t("you_send")}</p>
                <p className="text-white font-bold text-lg">
                  {new Intl.NumberFormat("es-MX", { style: "currency", currency: originCountry.currency }).format(senderAmount)}
                </p>
              </div>
              <ArrowRight className="w-5 h-5 text-indigo-400" />
              <div className="text-center">
                <p className="text-slate-500 text-xs mb-1">{t("they_receive")}</p>
                <p className="text-emerald-400 font-bold text-lg">
                  {exchangeRate
                    ? new Intl.NumberFormat("es-MX", { style: "currency", currency: destCountry.currency }).format(receiverAmount)
                    : "..."}
                </p>
              </div>
            </div>

            <CountrySelector value={destCountry.code} onChange={(c) => {
              setDestCountry(c);
              setAccountId("");
              const banks = BANKS_BY_COUNTRY[c.code] ?? [];
              setSelectedBank(banks[0] ?? null);
            }} />
            <BankCombobox
              country={destCountry.code}
              value={selectedBank?.id ?? ""}
              detectedBank={detectedBank}
              onChange={(bank) => { setSelectedBank(bank); setDetectedBank(null); setAccountId(""); }}
            />
            <AccountInput
              label={accountMeta.label}
              placeholder={accountMeta.placeholder}
              value={accountId}
              country={destCountry.code}
              onChange={(val, autoDetected) => {
                setAccountId(val);
                if (autoDetected) { setDetectedBank(autoDetected); setSelectedBank(autoDetected); }
              }}
            />

            {senderAmount > 0 && exchangeRate && (
              <FeeBreakdown
                amount={receiverAmount}
                currency={destCountry.currency}
                mode={mode}
                senderAmount={senderAmount}
                sourceCurrency={originCountry.currency}
                exchangeRate={exchangeRate}
                transactionType="remesa"
              />
            )}

            <div className="mt-auto">
              <button
                disabled={senderAmount <= 0 || !accountId.trim()}
                onClick={handleConfirm}
                className="w-full bg-indigo-600 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold text-lg py-5 rounded-2xl flex items-center justify-center gap-2 transition-colors touch-manipulation"
              >
                {t("review")} <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </main>
  );
}

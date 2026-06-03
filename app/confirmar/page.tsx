"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Shield } from "lucide-react";
import { useTranslations } from "next-intl";
import FeeBreakdown from "@/components/FeeBreakdown";
import ExchangeRateDisplay from "@/components/ExchangeRateDisplay";
import { RAIL_LABELS } from "@/constants/rails";
import { COUNTRIES } from "@/constants/countries";
import { usePaymentStore } from "@/lib/store/paymentStore";

export default function ConfirmarPage() {
  const router = useRouter();
  const t = useTranslations("confirmar");
  const {
    amount, currency, mode, rail, bankName, accountId,
    transactionType, sourceCurrency, sourceCountry, senderAmount, exchangeRate, fxUpdatedAt,
    setTxStatus,
  } = usePaymentStore();

  useEffect(() => {
    if (amount <= 0) router.replace("/");
  }, [amount, router]);

  function fmt(n: number, c: string) {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency: c }).format(n);
  }

  const isRemesa = transactionType === "remesa";
  const isTerminal = transactionType === "terminal";

  const originCountryData = COUNTRIES.find((c) => c.code === sourceCountry);
  const destCountryData = COUNTRIES.find((c) => c.code === (usePaymentStore.getState().country));

  const fxAgoSecs = fxUpdatedAt ? Math.floor((Date.now() - fxUpdatedAt) / 1000) : undefined;

  const title = isRemesa ? t("title_transfer") : isTerminal ? t("title_terminal") : t("title_generic");
  const destLabel = isRemesa ? t("receiver_account") : isTerminal ? t("business_account") : t("payment_dest");
  const confirmLabel = isRemesa ? t("confirm_transfer") : isTerminal ? t("confirm_charge") : t("pay_now");

  return (
    <main className="flex flex-col min-h-screen bg-[#0f172a] px-5 pt-10 pb-10">
      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => router.back()} className="p-2 rounded-xl hover:bg-slate-800 touch-manipulation">
          <ArrowLeft className="w-6 h-6 text-slate-400" />
        </button>
        <h1 className="text-2xl font-bold text-white">{title}</h1>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-5 flex-1"
      >
        <div className="bg-slate-800/60 rounded-2xl p-5">
          <p className="text-slate-400 text-sm mb-1">{destLabel}</p>
          <p className="text-white font-bold text-lg">{bankName}</p>
          <p className="text-slate-400 font-mono text-sm mt-1">{accountId}</p>
        </div>

        {isRemesa && exchangeRate && originCountryData && destCountryData && (
          <ExchangeRateDisplay
            fromCurrency={sourceCurrency}
            toCurrency={currency}
            fromFlag={originCountryData.flag}
            toFlag={destCountryData.flag}
            rate={exchangeRate}
            updatedAgo={fxAgoSecs}
          />
        )}

        <div className="text-center py-4">
          {isRemesa && senderAmount > 0 && sourceCurrency ? (
            <>
              <p className="text-slate-400 text-sm mb-1">{t("you_send")}</p>
              <p className="text-white text-5xl font-bold">{fmt(senderAmount, sourceCurrency)}</p>
              {exchangeRate && (
                <p className="text-emerald-400 text-xl font-semibold mt-2">
                  → {fmt(amount, currency)} {t("family_receives")}
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-slate-400 text-sm mb-1">
                {isTerminal ? t("client_pays") : t("amount")}
              </p>
              <p className="text-white text-5xl font-bold">{fmt(amount, currency)}</p>
            </>
          )}
        </div>

        <FeeBreakdown
          amount={amount}
          currency={currency}
          mode={mode}
          senderAmount={isRemesa ? senderAmount : undefined}
          sourceCurrency={isRemesa ? sourceCurrency : undefined}
          exchangeRate={isRemesa ? exchangeRate ?? undefined : undefined}
          transactionType={transactionType}
        />

        {rail && (
          <div className="flex items-center justify-between bg-slate-800/40 rounded-xl px-4 py-3">
            <span className="text-slate-400 text-sm">{t("payment_rail")}</span>
            <span className="text-white text-sm font-semibold">{RAIL_LABELS[rail]}</span>
          </div>
        )}

        <div className="mt-auto flex flex-col gap-3">
          <button
            onClick={() => { setTxStatus("processing"); router.push("/procesando"); }}
            className="w-full bg-indigo-600 text-white font-bold text-xl py-6 rounded-2xl touch-manipulation shadow-2xl shadow-indigo-900/50 transition-colors hover:bg-indigo-500 active:scale-95"
          >
            {confirmLabel}
          </button>
          <div className="flex items-center justify-center gap-2 text-slate-500 text-xs">
            <Shield className="w-3 h-3" />
            <span>{t("security")}</span>
          </div>
        </div>
      </motion.div>
    </main>
  );
}

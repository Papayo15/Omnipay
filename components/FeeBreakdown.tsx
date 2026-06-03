"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { calcFees } from "@/constants/fees";

interface Props {
  amount: number;
  currency: string;
  mode: "A" | "B";
  senderAmount?: number;
  sourceCurrency?: string;
  exchangeRate?: number;
  transactionType?: "remesa" | "terminal" | "importacion" | null;
}

function fmt(n: number, currency: string) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(n);
}

export default function FeeBreakdown({ amount, currency, mode, senderAmount, sourceCurrency, exchangeRate, transactionType }: Props) {
  const t = useTranslations("fee");
  if (amount <= 0) return null;

  const { senderPays, receiverGets, fee } = calcFees(amount, mode);

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={`${amount}-${mode}-${transactionType}`}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.2 }}
        className="bg-slate-800/60 rounded-2xl p-4 flex flex-col gap-3 border border-slate-700/50"
      >
        {transactionType === "remesa" && senderAmount && sourceCurrency && exchangeRate ? (
          <>
            <div className="flex justify-between items-center">
              <span className="text-slate-400 text-sm">{t("you_send")}</span>
              <span className="text-white font-bold text-lg">{fmt(senderAmount, sourceCurrency)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400 text-sm">{t("commission")}</span>
              <span className="text-slate-400 text-sm">{fmt(senderAmount * 0.0025, sourceCurrency)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400 text-sm">{t("exchange_rate")}</span>
              <span className="text-slate-300 text-sm">1 {sourceCurrency} = {exchangeRate.toFixed(2)} {currency}</span>
            </div>
            <div className="h-px bg-slate-700" />
            <div className="flex justify-between items-center">
              <span className="text-emerald-400 font-semibold text-sm">{t("family_receives")}</span>
              <span className="text-emerald-400 font-bold text-xl">{fmt(receiverGets, currency)}</span>
            </div>
          </>
        ) : transactionType === "terminal" ? (
          <>
            <div className="flex justify-between items-center">
              <span className="text-slate-400 text-sm">{t("client_pays")}</span>
              <span className="text-white font-bold text-lg">{fmt(senderPays, currency)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400 text-sm">{t("commission")}</span>
              <span className="text-slate-400 text-sm">{fmt(fee, currency)}</span>
            </div>
            <div className="h-px bg-slate-700" />
            <div className="flex justify-between items-center">
              <span className="text-emerald-400 font-semibold text-sm">{t("business_receives")}</span>
              <span className="text-emerald-400 font-bold text-xl">{fmt(receiverGets, currency)}</span>
            </div>
            <div className="flex justify-between items-center bg-red-950/30 rounded-xl px-3 py-2 mt-1">
              <span className="text-slate-500 text-xs">{t("vs_terminal")}</span>
              <span className="text-red-400 text-xs line-through">{fmt(amount * 0.036, currency)}</span>
            </div>
          </>
        ) : (
          <>
            <div className="flex justify-between items-center">
              <span className="text-slate-400 text-sm">{t("payer_transfers")}</span>
              <span className="text-white font-bold text-lg">{fmt(senderPays, currency)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400 text-sm">{t("commission")}</span>
              <span className="text-slate-400 text-sm">{fmt(fee, currency)}</span>
            </div>
            <div className="h-px bg-slate-700" />
            <div className="flex justify-between items-center">
              <span className="text-emerald-400 font-semibold text-sm">{t("receiver_gets")}</span>
              <span className="text-emerald-400 font-bold text-xl">{fmt(receiverGets, currency)}</span>
            </div>
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

"use client";

import { motion, AnimatePresence } from "framer-motion";
import { TrendingDown } from "lucide-react";
import { useTranslations } from "next-intl";

interface Props {
  amount: number;
  currency: string;
}

const CLIP_RATE = 0.036;
const OMNIPAY_RATE = 0.0025;

function fmt(n: number, currency: string) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(n);
}

export default function MerchantSavings({ amount, currency }: Props) {
  const t = useTranslations("savings");
  if (amount <= 0) return null;

  const omnipayFee = parseFloat((amount * OMNIPAY_RATE).toFixed(2));
  const clipFee = parseFloat((amount * CLIP_RATE).toFixed(2));
  const savings = parseFloat((clipFee - omnipayFee).toFixed(2));

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={amount}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.2 }}
        className="bg-emerald-950/40 border border-emerald-800/40 rounded-2xl p-4 flex flex-col gap-2"
      >
        <div className="flex items-center gap-2 mb-1">
          <TrendingDown className="w-4 h-4 text-emerald-400" />
          <span className="text-emerald-400 text-xs font-semibold uppercase tracking-widest">
            {t("title")}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-slate-400 text-sm">{t("clip_label")}</span>
          <span className="text-red-400 text-sm font-semibold line-through">{fmt(clipFee, currency)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-slate-400 text-sm">{t("omnipay_label")}</span>
          <span className="text-emerald-400 text-sm font-semibold">{fmt(omnipayFee, currency)}</span>
        </div>
        <div className="h-px bg-emerald-800/30 my-1" />
        <div className="flex justify-between items-center">
          <span className="text-emerald-300 font-bold text-sm">{t("savings_label")}</span>
          <span className="text-emerald-300 font-bold text-lg">{fmt(savings, currency)}</span>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

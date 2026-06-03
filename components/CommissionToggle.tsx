"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";

interface Props {
  mode: "A" | "B";
  onChange: (mode: "A" | "B") => void;
  transactionType?: "remesa" | "terminal" | null;
}

export default function CommissionToggle({ mode, onChange, transactionType }: Props) {
  const t = useTranslations("toggle");
  const labelA = transactionType === "terminal" ? t("included_price") : transactionType === "remesa" ? t("i_pay") : t("sender_pays");
  const labelB = transactionType === "terminal" ? t("charge_client") : transactionType === "remesa" ? t("i_discount") : t("receiver_pays");

  return (
    <div className="flex flex-col gap-2">
      <p className="text-slate-400 text-xs uppercase tracking-widest text-center">
        {t("who_absorbs")}
      </p>
      <div className="flex rounded-xl overflow-hidden border border-slate-700 bg-slate-800/50">
        <button
          onClick={() => onChange("A")}
          className="relative flex-1 py-3 text-sm font-semibold transition-colors touch-manipulation"
        >
          {mode === "A" && (
            <motion.div
              layoutId="toggle-bg"
              className="absolute inset-0 bg-indigo-600 rounded-xl"
              initial={false}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            />
          )}
          <span className={`relative z-10 ${mode === "A" ? "text-white" : "text-slate-400"}`}>
            {labelA}
          </span>
        </button>
        <button
          onClick={() => onChange("B")}
          className="relative flex-1 py-3 text-sm font-semibold transition-colors touch-manipulation"
        >
          {mode === "B" && (
            <motion.div
              layoutId="toggle-bg"
              className="absolute inset-0 bg-emerald-600 rounded-xl"
              initial={false}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            />
          )}
          <span className={`relative z-10 ${mode === "B" ? "text-white" : "text-slate-400"}`}>
            {labelB}
          </span>
        </button>
      </div>
    </div>
  );
}

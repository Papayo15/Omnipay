"use client";

import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatRate } from "@/lib/fx";

interface Props {
  fromCurrency: string;
  toCurrency: string;
  fromFlag: string;
  toFlag: string;
  rate: number | null;
  updatedAgo?: number;
}

export default function ExchangeRateDisplay({ fromCurrency, toCurrency, fromFlag, toFlag, rate, updatedAgo }: Props) {
  const t = useTranslations("fx");

  if (rate === null) {
    return (
      <div className="flex items-center gap-2 bg-slate-800/40 rounded-xl px-4 py-3 text-slate-500 text-sm">
        <RefreshCw className="w-3 h-3 animate-spin" />
        <span>{t("unavailable")}</span>
      </div>
    );
  }

  const ageText = updatedAgo !== undefined
    ? updatedAgo < 60
      ? t("updated_now")
      : t("updated_ago", { min: Math.floor(updatedAgo / 60) })
    : t("realtime");

  return (
    <div className="flex items-center justify-between bg-slate-800/40 rounded-xl px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="text-lg">{fromFlag}</span>
        <span className="text-slate-400 text-sm">→</span>
        <span className="text-lg">{toFlag}</span>
        <span className="text-white font-semibold ml-1">
          1 {fromCurrency} = <span className="text-indigo-300">{formatRate(rate)}</span> {toCurrency}
        </span>
      </div>
      <span className="text-slate-500 text-xs">{ageText}</span>
    </div>
  );
}

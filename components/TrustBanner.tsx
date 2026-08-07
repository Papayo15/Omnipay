"use client";

import { useTranslations } from "next-intl";
import { ShieldCheck } from "lucide-react";

interface TrustBannerProps {
  variant?: "footer" | "checkout";
}

export function TrustBanner({ variant = "footer" }: TrustBannerProps) {
  const t = useTranslations("landing");

  if (variant === "checkout") {
    return (
      <div className="bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 flex gap-3 items-start">
        <ShieldCheck className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-emerald-400 text-xs font-semibold mb-0.5">{t("trust_banner_title")}</p>
          <p className="text-slate-400 text-[11px] leading-relaxed">{t("trust_banner_body")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-slate-600 text-[10px]">
      <ShieldCheck className="w-3 h-3 text-slate-600 flex-shrink-0" />
      <span>{t("trust_banner_body")}</span>
    </div>
  );
}

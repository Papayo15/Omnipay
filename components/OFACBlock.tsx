"use client";

import { Shield } from "lucide-react";
import { useTranslations } from "next-intl";

export default function OFACBlock() {
  const t = useTranslations("ofac");
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#0f172a] px-6 text-center">
      <div className="bg-red-500/10 rounded-full p-6 mb-6">
        <Shield className="w-14 h-14 text-red-400" />
      </div>
      <h1 className="text-2xl font-bold text-white mb-3">{t("title")}</h1>
      <p className="text-slate-400 max-w-sm leading-relaxed">{t("body")}</p>
      <p className="text-slate-500 text-sm mt-6">{t("contact")}</p>
    </div>
  );
}

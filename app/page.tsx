"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Send, Store, Zap, Shield } from "lucide-react";
import { useTranslations } from "next-intl";

export default function Home() {
  const t = useTranslations("home");

  return (
    <main className="flex flex-col min-h-screen bg-[#0f172a] px-5 pt-16 pb-10">

      {/* Logo */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-2 mb-12"
      >
        <div className="flex items-center gap-2">
          <Zap className="w-7 h-7 text-indigo-400" />
          <span className="text-2xl font-bold tracking-tight text-white">OmniPay</span>
        </div>
        <p className="text-slate-400 text-sm text-center max-w-xs">{t("tagline")}</p>
      </motion.div>

      {/* Two main buttons */}
      <div className="flex flex-col gap-5 flex-1 justify-center max-w-sm mx-auto w-full">

        {/* COBRAR — Clip Killer */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
        >
          <Link href="/cobrar" className="block">
            <div className="w-full bg-emerald-600 hover:bg-emerald-500 active:scale-95 transition-all duration-150 rounded-2xl p-7 flex items-center gap-5 shadow-2xl shadow-emerald-900/50 touch-manipulation cursor-pointer">
              <div className="bg-emerald-500 rounded-xl p-3 flex-shrink-0">
                <Store className="w-9 h-9 text-white" />
              </div>
              <div className="text-left">
                <p className="text-xl font-bold text-white leading-tight">{t("cobrar_title")}</p>
                <p className="text-emerald-200 text-sm mt-1">{t("cobrar_sub")}</p>
                <p className="text-emerald-300/70 text-xs mt-0.5">{t("cobrar_tag")}</p>
              </div>
            </div>
          </Link>
        </motion.div>

        {/* REMESA — Western Union Killer */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
        >
          <Link href="/remesa" className="block">
            <div className="w-full bg-indigo-600 hover:bg-indigo-500 active:scale-95 transition-all duration-150 rounded-2xl p-7 flex items-center gap-5 shadow-2xl shadow-indigo-900/50 touch-manipulation cursor-pointer">
              <div className="bg-indigo-500 rounded-xl p-3 flex-shrink-0">
                <Send className="w-9 h-9 text-white" />
              </div>
              <div className="text-left">
                <p className="text-xl font-bold text-white leading-tight">{t("remesa_title")}</p>
                <p className="text-indigo-200 text-sm mt-1">{t("remesa_sub")}</p>
                <p className="text-indigo-300/70 text-xs mt-0.5">{t("remesa_tag")}</p>
              </div>
            </div>
          </Link>
        </motion.div>

      </div>

      {/* Footer trust badges */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-10 flex flex-col gap-2 max-w-sm mx-auto w-full"
      >
        <div className="flex items-center gap-2 text-slate-500 text-xs">
          <Shield className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
          <span>{t("trust_no_storage")}</span>
        </div>
        <div className="flex items-center gap-2 text-slate-500 text-xs">
          <Shield className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
          <span>{t("trust_instant")}</span>
        </div>
      </motion.div>

    </main>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Send, Store, Zap, Shield, TrendingDown, Package, LayoutGrid } from "lucide-react";
import { useTranslations } from "next-intl";
import { checkOFAC } from "@/lib/geofence";
import OFACBlock from "@/components/OFACBlock";

export default function Home() {
  const t = useTranslations("home");
  const [ofacBlocked, setOfacBlocked] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    checkOFAC()
      .then(({ blocked }) => setOfacBlocked(blocked))
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);

  if (checking) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#0f172a]">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (ofacBlocked) return <OFACBlock />;

  return (
    <main className="flex flex-col min-h-screen bg-[#0f172a] px-5 pt-14 pb-10">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-2 mb-10"
      >
        <div className="flex items-center gap-2">
          <Zap className="w-7 h-7 text-indigo-400" />
          <span className="text-2xl font-bold tracking-tight text-white">OmniPay</span>
        </div>
        <p className="text-slate-400 text-sm text-center max-w-xs">
          {t("tagline")}
        </p>
      </motion.div>

      <div className="flex flex-col gap-5 flex-1 justify-center max-w-sm mx-auto w-full">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
        >
          <Link href="/mandar" className="block">
            <button className="w-full bg-indigo-600 hover:bg-indigo-500 active:scale-95 transition-all duration-150 rounded-2xl p-7 flex items-center gap-5 shadow-2xl shadow-indigo-900/50 touch-manipulation">
              <div className="bg-indigo-500 rounded-xl p-3 flex-shrink-0">
                <Send className="w-9 h-9 text-white" />
              </div>
              <div className="text-left">
                <p className="text-xl font-bold text-white leading-tight">{t("send_button_title")}</p>
                <p className="text-indigo-200 text-sm mt-1">{t("send_button_sub")}</p>
                <p className="text-indigo-300/70 text-xs mt-0.5">{t("send_button_tag")}</p>
              </div>
            </button>
          </Link>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
        >
          <Link href="/cobrar" className="block">
            <button className="w-full bg-emerald-600 hover:bg-emerald-500 active:scale-95 transition-all duration-150 rounded-2xl p-7 flex items-center gap-5 shadow-2xl shadow-emerald-900/50 touch-manipulation">
              <div className="bg-emerald-500 rounded-xl p-3 flex-shrink-0">
                <Store className="w-9 h-9 text-white" />
              </div>
              <div className="text-left">
                <p className="text-xl font-bold text-white leading-tight">{t("terminal_button_title")}</p>
                <p className="text-emerald-200 text-sm mt-1">{t("terminal_button_sub")}</p>
                <p className="text-emerald-300/70 text-xs mt-0.5">{t("terminal_button_tag")}</p>
              </div>
            </button>
          </Link>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
        >
          <Link href="/importar" className="block">
            <button className="w-full bg-amber-600 hover:bg-amber-500 active:scale-95 transition-all duration-150 rounded-2xl p-7 flex items-center gap-5 shadow-2xl shadow-amber-900/50 touch-manipulation">
              <div className="bg-amber-500 rounded-xl p-3 flex-shrink-0">
                <Package className="w-9 h-9 text-white" />
              </div>
              <div className="text-left">
                <p className="text-xl font-bold text-white leading-tight">{t("import_button_title")}</p>
                <p className="text-amber-200 text-sm mt-1">{t("import_button_sub")}</p>
                <p className="text-amber-300/70 text-xs mt-0.5">{t("import_button_tag")}</p>
              </div>
            </button>
          </Link>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4 }}
        >
          <Link href="/enviar" className="block">
            <button className="w-full bg-slate-700 hover:bg-slate-600 active:scale-95 transition-all duration-150 rounded-2xl p-6 flex items-center gap-4 touch-manipulation border border-slate-600">
              <div className="bg-slate-600 rounded-xl p-2.5 flex-shrink-0">
                <LayoutGrid className="w-7 h-7 text-slate-200" />
              </div>
              <div className="text-left">
                <p className="text-lg font-bold text-white leading-tight">{t("universal_button_title")}</p>
                <p className="text-slate-300 text-sm mt-0.5">{t("universal_button_sub")}</p>
              </div>
            </button>
          </Link>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="mt-10 flex flex-col gap-3 max-w-sm mx-auto w-full"
      >
        <div className="flex items-start gap-3 text-slate-400 text-sm">
          <TrendingDown className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
          <span>{t("compare_wu")}</span>
        </div>
        <div className="flex items-start gap-3 text-slate-400 text-sm">
          <TrendingDown className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
          <span>{t("compare_clip")}</span>
        </div>
        <div className="flex items-center gap-3 text-slate-400 text-sm">
          <Shield className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <span>{t("compare_security")}</span>
        </div>
      </motion.div>
    </main>
  );
}

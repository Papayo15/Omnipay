"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Zap } from "lucide-react";
import { TrustBanner } from "@/components/TrustBanner";
import { FaqAccordion } from "@/components/FaqAccordion";

export default function Home() {
  const tl = useTranslations("landing");
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [b2bMode, setB2bMode] = useState<"card" | "wire">("card");

  useEffect(() => {
    // Redirect legacy checkout links (?t=...&s=...) to /b2b
    const p = new URLSearchParams(window.location.search);
    const tok = p.get("t");
    const sig = p.get("s");
    if (tok && sig) {
      const type = p.get("type") ?? "";
      router.replace(`/b2b?t=${tok}&s=${sig}${type ? `&type=${type}` : ""}`);
      return;
    }
    setReady(true);
  }, [router]);

  if (!ready) {
    return (
      <main className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <Zap className="w-8 h-8 text-[#00C9C8] animate-pulse" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0f172a] flex flex-col items-center px-5 pt-10 pb-16">

      {/* Logo */}
      <div className="w-full max-w-md flex items-center gap-2 mb-10">
        <Zap className="w-6 h-6 text-[#00C9C8]" />
        <span className="text-xl font-bold text-white tracking-tight">OmniPay</span>
      </div>

      {/* What is OmniPay */}
      <div className="w-full max-w-md mb-8">
        <h1 className="text-2xl font-bold text-white mb-3">{tl("about_title")}</h1>
        <p className="text-slate-400 text-sm leading-relaxed">{tl("about_body")}</p>
      </div>

      {/* 2 cards — emisor siempre inicia */}
      <div className="w-full max-w-md space-y-3 mb-4">

        {/* Card 1: P2P personal */}
        <button
          onClick={() => router.push("/enviar")}
          className="group relative w-full bg-emerald-950/40 hover:bg-emerald-950/60 border border-emerald-700/50 hover:border-emerald-500/70 rounded-2xl p-5 text-left transition-all duration-200 active:scale-[0.98]"
        >
          <span className="absolute top-3 right-3 bg-emerald-500/20 text-emerald-400 text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full">
            {tl("badge_recommended")}
          </span>
          <div className="text-2xl mb-2">💸</div>
          <h2 className="text-white font-bold text-sm mb-1">{tl("send_p2p_title")}</h2>
          <p className="text-slate-400 text-xs leading-relaxed mb-1">{tl("send_p2p_sub")}</p>
          <p className="text-slate-500 text-[10px] leading-relaxed mb-3">{tl("send_p2p_desc")}</p>
          <p className="text-emerald-400 text-xs font-semibold group-hover:translate-x-1 transition-transform">
            {tl("send_p2p_cta")}
          </p>
        </button>

        {/* Card 2: B2B con toggle Tarjeta | Wire */}
        <div className="w-full bg-slate-800/60 border border-slate-700 rounded-2xl p-5">
          <div className="text-2xl mb-2">🏢</div>
          <h2 className="text-white font-bold text-sm mb-1">{tl("send_b2b_title")}</h2>
          <p className="text-slate-400 text-xs leading-relaxed mb-4">{tl("send_b2b_sub")}</p>

          {/* Toggle */}
          <div className="flex bg-slate-900/60 rounded-xl p-1 mb-4">
            <button
              onClick={() => setB2bMode("card")}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all duration-150 ${
                b2bMode === "card"
                  ? "bg-[#00C9C8] text-[#0f172a]"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              💳 {tl("b2b_mode_card")}
            </button>
            <button
              onClick={() => setB2bMode("wire")}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all duration-150 ${
                b2bMode === "wire"
                  ? "bg-[#00C9C8] text-[#0f172a]"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              🏦 {tl("b2b_mode_wire")}
            </button>
          </div>

          {/* Fee + tiempo según modo */}
          {b2bMode === "card" ? (
            <div className="bg-slate-900/50 rounded-xl p-3 mb-4 space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="text-slate-500 text-[10px]">{tl("b2b_fee_label")}</span>
                <span className="text-slate-300 text-[10px] font-mono">~4.4%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 text-[10px]">{tl("b2b_time_label")}</span>
                <span className="text-amber-400 text-[10px] font-semibold">4–5 {tl("b2b_days")}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 text-[10px]">{tl("b2b_method_label")}</span>
                <span className="text-slate-400 text-[10px]">Stripe + Wise</span>
              </div>
            </div>
          ) : (
            <div className="bg-slate-900/50 rounded-xl p-3 mb-4 space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="text-slate-500 text-[10px]">{tl("b2b_fee_label")}</span>
                <span className="text-slate-300 text-[10px] font-mono">~1.5%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 text-[10px]">{tl("b2b_time_label")}</span>
                <span className="text-emerald-400 text-[10px] font-semibold">{tl("b2b_time_instant")}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 text-[10px]">{tl("b2b_method_label")}</span>
                <span className="text-slate-400 text-[10px]">Bridge</span>
              </div>
            </div>
          )}

          <button
            onClick={() => router.push(b2bMode === "card" ? "/enviar-empresa" : "/enviar-empresa-wire")}
            className="w-full bg-[#00C9C8] hover:bg-[#00b8b7] text-[#0f172a] font-bold py-3 rounded-xl text-sm transition-all duration-200 active:scale-[0.98]"
          >
            {tl("send_b2b_cta")} →
          </button>
        </div>
      </div>

      <p className="text-slate-500 text-[11px] text-center mt-4 max-w-md">
        {tl("landing_subtitle")}
      </p>

      <div className="w-full max-w-md mt-8">
        <TrustBanner variant="footer" />
      </div>

      <div className="w-full max-w-md mt-8">
        <FaqAccordion />
      </div>
    </main>
  );
}

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

      {/* PRIMARY: Enviar dinero — emisor inicia */}
      <div className="w-full max-w-md mb-3">
        <p className="text-slate-500 text-[10px] uppercase tracking-widest mb-2 px-1">{tl("section_send")}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

          {/* Enviar como persona — RECOMENDADO */}
          <button
            onClick={() => router.push("/enviar")}
            className="group relative bg-emerald-950/40 hover:bg-emerald-950/60 border border-emerald-700/50 hover:border-emerald-500/70 rounded-2xl p-5 text-left transition-all duration-200 active:scale-[0.98]"
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

          {/* Pago empresarial con tarjeta */}
          <button
            onClick={() => router.push("/enviar-empresa")}
            className="group bg-slate-800/60 hover:bg-slate-800 border border-slate-700 hover:border-[#00C9C8]/60 rounded-2xl p-5 text-left transition-all duration-200 active:scale-[0.98]"
          >
            <div className="text-2xl mb-2">🏢</div>
            <h2 className="text-white font-bold text-sm mb-1">{tl("send_b2b_title")}</h2>
            <p className="text-slate-400 text-xs leading-relaxed mb-1">{tl("send_b2b_sub")}</p>
            <p className="text-slate-500 text-[10px] leading-relaxed mb-3">{tl("send_b2b_desc")}</p>
            <p className="text-[#00C9C8] text-xs font-semibold group-hover:translate-x-1 transition-transform">
              {tl("send_b2b_cta")}
            </p>
          </button>
        </div>
      </div>

      {/* SECONDARY: Generar link de cobro — receptor inicia */}
      <div className="w-full max-w-md mb-3">
        <p className="text-slate-500 text-[10px] uppercase tracking-widest mb-2 px-1">{tl("section_receive")}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

          {/* Generar link personal */}
          <button
            onClick={() => router.push("/p2p")}
            className="group bg-slate-800/40 hover:bg-slate-800/60 border border-slate-700/60 hover:border-slate-600 rounded-2xl p-4 text-left transition-all duration-200 active:scale-[0.98]"
          >
            <div className="text-xl mb-2">📥</div>
            <h2 className="text-white font-semibold text-xs mb-1">{tl("receive_p2p_title")}</h2>
            <p className="text-slate-500 text-[10px] leading-relaxed mb-2">{tl("receive_p2p_sub")}</p>
            <p className="text-slate-400 text-[10px] font-medium group-hover:translate-x-1 transition-transform">
              {tl("receive_p2p_cta")}
            </p>
          </button>

          {/* Wire empresarial */}
          <button
            onClick={() => router.push("/enviar-empresa-wire")}
            className="group bg-slate-800/40 hover:bg-slate-800/60 border border-slate-700/60 hover:border-slate-600 rounded-2xl p-4 text-left transition-all duration-200 active:scale-[0.98]"
          >
            <div className="text-xl mb-2">🏦</div>
            <h2 className="text-white font-semibold text-xs mb-1">{tl("receive_b2b_title")}</h2>
            <p className="text-slate-500 text-[10px] leading-relaxed mb-2">{tl("receive_b2b_sub")}</p>
            <p className="text-slate-400 text-[10px] font-medium group-hover:translate-x-1 transition-transform">
              {tl("receive_b2b_cta")}
            </p>
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

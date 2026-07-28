"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Zap, CheckCircle2, AlertCircle, Mail } from "lucide-react";

interface TrackData {
  step:           number;
  status:         string;
  label:          string;
  error_message?: string;
}

export default function SeguimientoPage() {
  const t = useTranslations("seguimiento");
  const [orderId, setOrderId] = useState<string | null>(null);
  const [track,   setTrack]   = useState<TrackData | null>(null);
  const [done,    setDone]    = useState(false);
  const [failed,  setFailed]  = useState(false);

  useEffect(() => {
    const p  = new URLSearchParams(window.location.search);
    const id = p.get("order_id");
    if (!id) { window.location.href = "/"; return; }
    setOrderId(id);
  }, []);

  useEffect(() => {
    if (!orderId) return;
    let active = true;

    const poll = async () => {
      try {
        const res = await fetch(`/api/bridge/track?order_id=${orderId}`);
        if (!res.ok) return;
        const d = await res.json() as TrackData;
        if (!active) return;
        setTrack(d);
        if (d.status === "COMPLETED" || d.step >= 4) { setDone(true); clearInterval(iv); }
        if (d.status === "FAILED")                   { setFailed(true); clearInterval(iv); }
      } catch { /* non-critical */ }
    };

    poll();
    const iv = setInterval(poll, 10_000);
    return () => { active = false; clearInterval(iv); };
  }, [orderId]);

  const current = track?.step ?? 1;

  const STEPS = [
    { label: t("step1_label"), sub: t("step1_sub") },
    { label: t("step2_label"), sub: t("step2_sub") },
    { label: t("step3_label"), sub: t("step3_sub") },
    { label: t("step4_label"), sub: t("step4_sub") },
  ];

  return (
    <main className="min-h-screen bg-[#0f172a] flex flex-col max-w-sm mx-auto w-full px-5 pb-12">

      {/* Header */}
      <div className="pt-8 pb-6 flex items-center gap-2">
        <Zap className="w-5 h-5 text-[#00C9C8]" />
        <span className="text-white font-bold">OmniPay</span>
      </div>

      {/* Title */}
      <div className="mb-8">
        <h1 className="text-white font-bold text-xl mb-1">{t("page_title")}</h1>
        {orderId && <p className="text-slate-500 text-xs font-mono">{t("ref")} {orderId}</p>}
      </div>

      {/* Failed state */}
      {failed && (
        <div className="bg-red-900/30 border border-red-500/40 rounded-2xl p-5 mb-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-red-400 font-semibold text-sm">{t("failed_title")}</p>
              {track?.error_message && (
                <p className="text-slate-400 text-xs mt-1">{track.error_message}</p>
              )}
              <p className="text-slate-500 text-xs mt-2">{t("failed_support")}</p>
            </div>
          </div>
        </div>
      )}

      {/* Completed state */}
      {done && !failed && (
        <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-2xl p-5 mb-6 text-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
          <p className="text-white font-bold text-lg">{t("completed_title")}</p>
          <p className="text-slate-400 text-sm mt-1">{t("completed_sub")}</p>
        </div>
      )}

      {/* 4-step tracker */}
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 mb-6">
        <div className="space-y-4">
          {STEPS.map((s, i) => {
            const stepNum = i + 1;
            const isDone   = stepNum < current || done;
            const isActive = stepNum === current && !done && !failed;
            return (
              <div key={i} className="flex items-start gap-4">
                {/* Circle */}
                <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold transition-colors mt-0.5
                  ${isDone   ? "bg-emerald-500 text-white"
                  : isActive ? "bg-[#00C9C8] text-black animate-pulse"
                  :            "bg-slate-800 text-slate-600 border border-slate-700"}`}>
                  {isDone ? "✓" : stepNum}
                </div>
                {/* Label */}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold
                    ${isDone ? "text-emerald-400" : isActive ? "text-[#00C9C8]" : "text-slate-600"}`}>
                    {s.label}
                  </p>
                  <p className={`text-xs mt-0.5 ${isDone || isActive ? "text-slate-400" : "text-slate-700"}`}>
                    {s.sub}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Status note */}
        {!done && !failed && (
          <p className="text-slate-600 text-[10px] text-center mt-4 animate-pulse">
            {t("polling_note")}
          </p>
        )}
      </div>

      {/* Email receipt note */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-2xl px-4 py-4 flex items-start gap-3">
        <Mail className="w-4 h-4 text-[#00C9C8] flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-white text-xs font-semibold">{t("email_title")}</p>
          <p className="text-slate-400 text-xs mt-0.5 leading-relaxed">
            {t("email_body")}
          </p>
        </div>
      </div>

      <p className="text-slate-700 text-[10px] text-center mt-8">
        {t("footer")}
      </p>
    </main>
  );
}

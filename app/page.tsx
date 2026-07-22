"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Zap } from "lucide-react";

const LANG_OPTIONS = [
  { code: "es", label: "Español",    flag: "🇲🇽" },
  { code: "en", label: "English",    flag: "🇺🇸" },
  { code: "fr", label: "Français",   flag: "🇫🇷" },
  { code: "pt", label: "Português",  flag: "🇧🇷" },
  { code: "de", label: "Deutsch",    flag: "🇩🇪" },
  { code: "it", label: "Italiano",   flag: "🇮🇹" },
  { code: "nl", label: "Nederlands", flag: "🇳🇱" },
  { code: "zh", label: "中文",        flag: "🇨🇳" },
  { code: "ja", label: "日本語",      flag: "🇯🇵" },
  { code: "ko", label: "한국어",      flag: "🇰🇷" },
  { code: "ar", label: "العربية",    flag: "🇸🇦" },
  { code: "hi", label: "हिन्दी",    flag: "🇮🇳" },
  { code: "ru", label: "Русский",    flag: "🇷🇺" },
  { code: "tr", label: "Türkçe",     flag: "🇹🇷" },
  { code: "vi", label: "Tiếng Việt", flag: "🇻🇳" },
  { code: "id", label: "Bahasa",     flag: "🇮🇩" },
  { code: "sw", label: "Kiswahili",  flag: "🇰🇪" },
  { code: "ha", label: "Hausa",      flag: "🇳🇬" },
  { code: "am", label: "አማርኛ",      flag: "🇪🇹" },
];

export default function Home() {
  const serverLocale = useLocale();
  const [uiLocale, setUiLocale] = useState(serverLocale);
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

  function switchLanguage(code: string) {
    setUiLocale(code);
    document.cookie = `OMNIPAY_LOCALE=${code}; path=/; max-age=31536000; SameSite=Lax`;
    router.refresh();
  }

  const currentLang = LANG_OPTIONS.find((l) => l.code === uiLocale) ?? LANG_OPTIONS[0];

  if (!ready) {
    return (
      <main className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <Zap className="w-8 h-8 text-[#00C9C8] animate-pulse" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0f172a] flex flex-col items-center px-5 pt-10 pb-16">

      {/* Logo + Language selector */}
      <div className="w-full max-w-md flex items-center justify-between mb-10">
        <div className="flex items-center gap-2">
          <Zap className="w-6 h-6 text-[#00C9C8]" />
          <span className="text-xl font-bold text-white tracking-tight">OmniPay</span>
        </div>
        <div className="relative group">
          <button className="flex items-center gap-1.5 text-slate-400 hover:text-white text-xs bg-slate-800/60 hover:bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 transition-all">
            <span>{currentLang.flag}</span>
            <span>{currentLang.label}</span>
            <span className="text-[10px] opacity-60">▾</span>
          </button>
          <div className="absolute right-0 top-full mt-1 w-44 bg-slate-900 border border-slate-700 rounded-xl shadow-xl overflow-hidden z-50 hidden group-hover:block max-h-72 overflow-y-auto">
            {LANG_OPTIONS.map((l) => (
              <button
                key={l.code}
                onClick={() => switchLanguage(l.code)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-slate-800 transition-colors ${l.code === uiLocale ? "text-[#00C9C8] bg-slate-800/60" : "text-slate-300"}`}
              >
                <span>{l.flag}</span>
                <span>{l.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* What is OmniPay */}
      <div className="w-full max-w-md mb-10">
        <h1 className="text-2xl font-bold text-white mb-3">{tl("about_title")}</h1>
        <p className="text-slate-400 text-sm leading-relaxed">{tl("about_body")}</p>
      </div>

      {/* Two action buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-md">
        <button
          onClick={() => router.push("/b2b")}
          className="group bg-slate-800/60 hover:bg-slate-800 border border-slate-700 hover:border-[#00C9C8]/60 rounded-2xl p-5 text-left transition-all duration-200 active:scale-[0.98]"
        >
          <div className="text-2xl mb-2">💼</div>
          <h2 className="text-white font-bold text-sm mb-1">{tl("b2b_title")}</h2>
          <p className="text-slate-400 text-xs leading-relaxed mb-3">{tl("b2b_sub")}</p>
          <p className="text-[#00C9C8] text-xs font-semibold group-hover:translate-x-1 transition-transform">
            {tl("b2b_cta")}
          </p>
        </button>

        <button
          onClick={() => router.push("/p2p")}
          className="group bg-slate-800/60 hover:bg-slate-800 border border-slate-700 hover:border-emerald-500/60 rounded-2xl p-5 text-left transition-all duration-200 active:scale-[0.98]"
        >
          <div className="text-2xl mb-2">🌍</div>
          <h2 className="text-white font-bold text-sm mb-1">{tl("p2p_title")}</h2>
          <p className="text-slate-400 text-xs leading-relaxed mb-3">{tl("p2p_sub")}</p>
          <p className="text-emerald-400 text-xs font-semibold group-hover:translate-x-1 transition-transform">
            {tl("p2p_cta")}
          </p>
        </button>
      </div>

      <p className="text-slate-700 text-[10px] text-center mt-10 max-w-md">
        🔒 {tl("tagline")}
      </p>
    </main>
  );
}

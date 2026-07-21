"use client";

import { useState, useRef, useEffect } from "react";

const LOCALES = [
  { code: "en", label: "English",            flag: "🇬🇧" },
  { code: "es", label: "Español",            flag: "🇲🇽" },
  { code: "pt", label: "Português",          flag: "🇧🇷" },
  { code: "fr", label: "Français",           flag: "🇫🇷" },
  { code: "de", label: "Deutsch",            flag: "🇩🇪" },
  { code: "it", label: "Italiano",           flag: "🇮🇹" },
  { code: "nl", label: "Nederlands",         flag: "🇳🇱" },
  { code: "ru", label: "Русский",            flag: "🇷🇺" },
  { code: "ar", label: "العربية",            flag: "🇸🇦" },
  { code: "hi", label: "हिन्दी",             flag: "🇮🇳" },
  { code: "zh", label: "中文",               flag: "🇨🇳" },
  { code: "ja", label: "日本語",             flag: "🇯🇵" },
  { code: "ko", label: "한국어",             flag: "🇰🇷" },
  { code: "vi", label: "Tiếng Việt",         flag: "🇻🇳" },
  { code: "id", label: "Bahasa Indonesia",   flag: "🇮🇩" },
  { code: "tr", label: "Türkçe",             flag: "🇹🇷" },
  { code: "sw", label: "Kiswahili",          flag: "🇰🇪" },
  { code: "ha", label: "Hausa",              flag: "🇳🇬" },
  { code: "am", label: "አማርኛ",              flag: "🇪🇹" },
] as const;

interface Props {
  currentLocale: string;
}

export default function LanguageSwitcher({ currentLocale }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = LOCALES.find((l) => l.code === currentLocale) ?? LOCALES[0];

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function switchLocale(code: string) {
    document.cookie = `OMNIPAY_LOCALE=${code};path=/;max-age=31536000;SameSite=Lax`;
    setOpen(false);
    window.location.reload();
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm
                   bg-[#1e293b] hover:bg-[#334155] text-[#cbd5e1] hover:text-white
                   border border-[#334155] hover:border-[#475569]
                   transition-colors duration-150 select-none"
      >
        <span className="text-base leading-none">{current.flag}</span>
        <span className="hidden sm:inline">{current.label}</span>
        <svg
          className={`w-3 h-3 ml-0.5 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M2 4l4 4 4-4" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 mt-1.5 w-48 max-h-72 overflow-y-auto
                     bg-[#1e293b] border border-[#334155] rounded-xl shadow-xl
                     z-50 py-1"
        >
          {LOCALES.map((locale) => (
            <button
              key={locale.code}
              role="option"
              aria-selected={locale.code === currentLocale}
              onClick={() => switchLocale(locale.code)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left
                          transition-colors duration-100
                          ${locale.code === currentLocale
                            ? "bg-[#6366f1]/20 text-white"
                            : "text-[#cbd5e1] hover:bg-[#334155] hover:text-white"}`}
            >
              <span className="text-base leading-none w-5 text-center">{locale.flag}</span>
              <span>{locale.label}</span>
              {locale.code === currentLocale && (
                <span className="ml-auto text-[#6366f1]">✓</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

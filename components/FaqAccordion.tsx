"use client";

import { useTranslations } from "next-intl";

export function FaqAccordion() {
  const t = useTranslations("faq");

  const items = [
    { q: t("q1"), a: t("a1") },
    { q: t("q2"), a: t("a2") },
    { q: t("q3"), a: t("a3") },
    { q: t("q4"), a: t("a4") },
    { q: t("q5"), a: t("a5") },
    { q: t("q6"), a: t("a6") },
  ];

  return (
    <div className="w-full space-y-1">
      <p className="text-slate-500 text-[10px] uppercase tracking-widest mb-2">{t("title")}</p>
      {items.map((item, i) => (
        <details key={i} className="group bg-slate-800/40 border border-slate-700/60 rounded-xl overflow-hidden">
          <summary className="flex items-center justify-between cursor-pointer px-4 py-3 text-xs text-slate-300 font-medium select-none list-none">
            <span>{item.q}</span>
            <span className="text-slate-500 text-base leading-none group-open:rotate-45 transition-transform duration-200 ml-2 flex-shrink-0">+</span>
          </summary>
          <div className="px-4 pb-3 text-[11px] text-slate-400 leading-relaxed border-t border-slate-700/40 pt-2">
            {item.a}
          </div>
        </details>
      ))}
    </div>
  );
}

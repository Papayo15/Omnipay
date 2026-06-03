"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { COUNTRIES, type Country } from "@/constants/countries";

interface Props {
  value: string; // country code
  onChange: (country: Country) => void;
}

export default function CountrySelector({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const selected = COUNTRIES.find((c) => c.code === value) ?? COUNTRIES[0];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 bg-slate-800/60 border border-slate-700 rounded-2xl p-4 touch-manipulation active:scale-95 transition-transform"
      >
        <span className="text-3xl">{selected.flag}</span>
        <div className="flex flex-col text-left flex-1">
          <span className="text-white font-semibold">{selected.name}</span>
          <span className="text-slate-400 text-xs">{selected.currency} · {selected.accountLabel}</span>
        </div>
        <ChevronDown
          className={`w-5 h-5 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scaleY: 0.95 }}
            animate={{ opacity: 1, y: 0, scaleY: 1 }}
            exit={{ opacity: 0, y: -8, scaleY: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 top-full left-0 right-0 mt-2 bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl max-h-72 overflow-y-auto"
            style={{ transformOrigin: "top" }}
          >
            {COUNTRIES.map((country) => (
              <button
                key={country.code}
                onClick={() => {
                  onChange(country);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700/60 transition-colors touch-manipulation text-left ${
                  country.code === value ? "bg-indigo-900/40" : ""
                }`}
              >
                <span className="text-2xl">{country.flag}</span>
                <div className="flex flex-col">
                  <span className="text-white text-sm font-medium">{country.name}</span>
                  <span className="text-slate-400 text-xs">{country.currency}</span>
                </div>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

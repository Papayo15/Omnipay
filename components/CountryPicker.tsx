"use client";

import { useState } from "react";
import { COUNTRIES, type Country } from "@/constants/countries";

interface CountryPickerProps {
  value: string;
  onChange: (country: Country) => void;
  label?: string;
}

export default function CountryPicker({ value, onChange, label }: CountryPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selected = COUNTRIES.find((c) => c.code === value) ?? COUNTRIES[0];
  const filtered = COUNTRIES.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.code.toLowerCase().includes(search.toLowerCase()) ||
    c.currency.toLowerCase().includes(search.toLowerCase())
  );

  function pick(c: Country) {
    onChange(c);
    setOpen(false);
    setSearch("");
  }

  return (
    <div className="relative w-full">
      {label && <p className="text-slate-400 text-xs mb-1">{label}</p>}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 bg-slate-800/60 border border-slate-700 hover:border-slate-500 rounded-xl px-4 py-3 text-left transition-colors"
      >
        <span className="text-2xl">{selected.flag}</span>
        <span className="flex-1 text-white text-sm">{selected.name}</span>
        <span className="text-slate-500 text-xs">{selected.currency}</span>
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-slate-500">
          <path d="M7 10l5 5 5-5z"/>
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-slate-800 border border-slate-700 rounded-xl shadow-xl overflow-hidden">
          <div className="p-2 border-b border-slate-700">
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar país..."
              className="w-full bg-slate-900/60 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div className="max-h-56 overflow-y-auto">
            {filtered.map((c) => (
              <button
                key={c.code}
                type="button"
                onClick={() => pick(c)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-700/60 transition-colors ${
                  c.code === value ? "bg-slate-700/40" : ""
                }`}
              >
                <span className="text-xl">{c.flag}</span>
                <span className="flex-1 text-white text-sm">{c.name}</span>
                <span className="text-slate-500 text-xs">{c.currency}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, ChevronDown, X } from "lucide-react";
import { BANKS_BY_COUNTRY, type BankInfo } from "@/constants/banks";

interface Props {
  country: string;
  value: string; // bank id
  onChange: (bank: BankInfo) => void;
  detectedBank?: BankInfo | null; // banco detectado automáticamente
}

export default function BankCombobox({ country, value, onChange, detectedBank }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const banks = BANKS_BY_COUNTRY[country] ?? [];
  const selected = banks.find((b) => b.id === value) ?? banks[0];

  const filtered = query.length === 0
    ? banks
    : banks.filter((b) =>
        b.name.toLowerCase().includes(query.toLowerCase()) ||
        b.id.toLowerCase().includes(query.toLowerCase())
      );

  // Si se detectó banco automáticamente y es diferente al seleccionado, auto-seleccionar
  useEffect(() => {
    if (detectedBank && detectedBank.id !== value) {
      onChange(detectedBank);
    }
  }, [detectedBank?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleOpen() {
    setOpen(true);
    setQuery("");
    setTimeout(() => inputRef.current?.focus(), 80);
  }

  function handleSelect(bank: BankInfo) {
    onChange(bank);
    setOpen(false);
    setQuery("");
  }

  return (
    <div className="relative">
      {/* Botón selector */}
      <button
        onClick={handleOpen}
        className="w-full flex items-center gap-4 bg-slate-800/60 border border-slate-700 rounded-2xl p-4 touch-manipulation active:scale-[0.98] transition-transform text-left"
        type="button"
      >
        <span className="text-3xl leading-none">{selected?.logo ?? "🏦"}</span>
        <div className="flex flex-col flex-1 min-w-0">
          <span className="text-slate-400 text-xs uppercase tracking-widest">Banco</span>
          <span className="text-white font-semibold text-lg truncate">
            {detectedBank && detectedBank.id !== "other_mx"
              ? detectedBank.name
              : selected?.name ?? "Seleccionar banco"}
          </span>
          {detectedBank && (
            <span className="text-emerald-400 text-xs">✓ Detectado automáticamente</span>
          )}
        </div>
        <ChevronDown className={`w-5 h-5 text-slate-400 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {/* Panel buscador */}
      <AnimatePresence>
        {open && (
          <>
            {/* Overlay */}
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

            <motion.div
              initial={{ opacity: 0, y: -8, scaleY: 0.95 }}
              animate={{ opacity: 1, y: 0, scaleY: 1 }}
              exit={{ opacity: 0, y: -8, scaleY: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute z-50 top-full left-0 right-0 mt-2 bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl"
              style={{ transformOrigin: "top" }}
            >
              {/* Input de búsqueda */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-700">
                <Search className="w-4 h-4 text-slate-500 flex-shrink-0" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar banco..."
                  className="flex-1 bg-transparent text-white placeholder-slate-500 outline-none text-sm"
                />
                {query && (
                  <button onClick={() => setQuery("")} className="text-slate-500 touch-manipulation">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Lista de bancos */}
              <div className="max-h-64 overflow-y-auto">
                {filtered.length === 0 ? (
                  <div className="px-4 py-6 text-center text-slate-500 text-sm">
                    No encontrado. Selecciona &quot;Otro banco&quot;.
                  </div>
                ) : (
                  filtered.map((bank) => (
                    <button
                      key={bank.id}
                      onClick={() => handleSelect(bank)}
                      className={`w-full flex items-center gap-4 px-5 py-4 hover:bg-slate-700/60 transition-colors touch-manipulation text-left border-b border-slate-800/50 last:border-0 ${
                        bank.id === value ? "bg-indigo-900/40" : ""
                      }`}
                      type="button"
                    >
                      <span className="text-2xl leading-none">{bank.logo}</span>
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="text-white font-medium text-sm">{bank.name}</span>
                        {bank.clabe_prefix && (
                          <span className="text-slate-500 text-xs">CLABE: {bank.clabe_prefix}...</span>
                        )}
                        {bank.routing && (
                          <span className="text-slate-500 text-xs">Routing: {bank.routing}</span>
                        )}
                      </div>
                      {bank.id === value && (
                        <span className="text-indigo-400 text-xs flex-shrink-0">✓</span>
                      )}
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

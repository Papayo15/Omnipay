"use client";

import { useEffect, useState } from "react";

interface Props {
  value: number;
  currency: string;
  onChange: (val: number) => void;
}

export default function AmountInput({ value, currency, onChange }: Props) {
  const [display, setDisplay] = useState(value > 0 ? value.toString() : "");

  useEffect(() => {
    if (value === 0 && display === "") return;
    setDisplay(value > 0 ? value.toString() : "");
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/[^0-9.]/g, "");
    // Máximo un punto decimal
    const parts = raw.split(".");
    const clean = parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : raw;
    setDisplay(clean);
    const num = parseFloat(clean);
    onChange(isNaN(num) ? 0 : num);
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-slate-400 text-lg font-medium">{currency}</span>
      <div className="relative flex items-center justify-center">
        <input
          type="tel"
          inputMode="decimal"
          value={display}
          onChange={handleChange}
          placeholder="0.00"
          className="text-center text-6xl font-bold bg-transparent text-white placeholder-slate-700 outline-none w-full max-w-xs tracking-tight"
          style={{ minWidth: 0 }}
        />
      </div>
      {value > 0 && (
        <span className="text-slate-500 text-sm">
          {new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(value)}
        </span>
      )}
    </div>
  );
}

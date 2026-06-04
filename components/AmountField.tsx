"use client";

interface AmountFieldProps {
  value: string;
  onChange: (value: string) => void;
  currency: string;
  placeholder?: string;
  label?: string;
}

export default function AmountField({
  value, onChange, currency, placeholder = "0.00", label
}: AmountFieldProps) {
  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    // Allow only digits and a single decimal point
    const raw = e.target.value.replace(/[^0-9.]/g, "");
    const parts = raw.split(".");
    const cleaned = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join("")}` : raw;
    onChange(cleaned);
  }

  return (
    <div className="flex flex-col gap-1 w-full">
      {label && <p className="text-slate-400 text-xs">{label}</p>}
      <div className="relative flex items-center">
        <span className="absolute left-4 text-slate-400 text-sm font-medium select-none">
          {currency}
        </span>
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={handleInput}
          placeholder={placeholder}
          className="w-full bg-slate-800/60 border border-slate-700 focus:border-indigo-500 rounded-xl pl-14 pr-4 py-4 text-white text-2xl font-bold placeholder-slate-600 focus:outline-none transition-colors"
        />
      </div>
    </div>
  );
}

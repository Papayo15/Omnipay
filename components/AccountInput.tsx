"use client";

import { smartDetectMX, type BankInfo } from "@/constants/banks";

interface Props {
  label: string;
  placeholder: string;
  value: string;
  country: string;
  onChange: (val: string, detectedBank?: BankInfo) => void;
}

export default function AccountInput({ label, placeholder, value, country, onChange }: Props) {
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    // Solo números (y letras para IBAN europeo)
    const numericOnly = ["MX", "US", "BR", "AR", "CO", "PE", "CL", "NG", "CA", "RU", "CN", "SG", "IN", "VE"].includes(country);
    const raw = numericOnly
      ? e.target.value.replace(/\D/g, "")
      : e.target.value.replace(/[^0-9A-Za-z@.\s]/g, "").toUpperCase();

    let detectedBank: BankInfo | undefined;

    if (country === "MX") {
      const { bank } = smartDetectMX(raw);
      if (bank) detectedBank = bank;
    }

    onChange(raw, detectedBank);
  }

  let hint = "";
  if (value.length > 0) {
    const digits = value.replace(/\D/g, "");
    if (country === "MX") {
      if (digits.length === 16) hint = "✓ Tarjeta de débito";
      else if (digits.length === 18) hint = "✓ CLABE interbancaria";
      else if (digits.length > 0 && digits.length < 16) hint = `${digits.length} dígitos`;
    } else if (country === "AR" && digits.length === 22) {
      hint = "✓ CBU / CVU válido";
    } else if (country === "NG" && digits.length === 10) {
      hint = "✓ NUBAN válido";
    } else if (country === "BR" && digits.length === 11) {
      hint = "✓ CPF / chave PIX";
    } else {
      if (digits.length === 16) {
        if (digits[0] === "4") hint = "✓ Tarjeta Visa";
        else if (digits[0] === "5" || digits[0] === "2") hint = "✓ Tarjeta Mastercard";
        else hint = "✓ Número de tarjeta";
      } else if (digits.length === 15 && (digits.startsWith("34") || digits.startsWith("37"))) {
        hint = "✓ Tarjeta American Express";
      }
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-slate-400 text-sm font-medium">{label}</label>
      <input
        type="tel"
        inputMode={["MX", "US", "BR", "AR", "CO", "PE", "CL", "NG", "CA", "RU", "CN", "SG", "VE"].includes(country) ? "numeric" : "text"}
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        maxLength={
          country === "MX" ? 18 :
          country === "AR" ? 22 :
          country === "NG" ? 10 :
          country === "BR" ? 11 :
          undefined
        }
        className="bg-slate-800/60 border border-slate-700 rounded-2xl px-5 py-5 text-white text-2xl font-mono placeholder-slate-600 outline-none focus:border-indigo-500 transition-colors tracking-wider"
      />
      {hint && (
        <p className={`text-xs px-1 ${hint.startsWith("✓") ? "text-emerald-400" : "text-slate-500"}`}>
          {hint}
        </p>
      )}
    </div>
  );
}

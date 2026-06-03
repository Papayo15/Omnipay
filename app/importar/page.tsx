"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ChevronRight, ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import AmountInput from "@/components/AmountInput";
import CountrySelector from "@/components/CountrySelector";
import BankCombobox from "@/components/BankCombobox";
import AccountInput from "@/components/AccountInput";
import ExchangeRateDisplay from "@/components/ExchangeRateDisplay";
import FeeBreakdown from "@/components/FeeBreakdown";
import { selectRailByTransactionType } from "@/constants/rails";
import { DEFAULT_COUNTRY, COUNTRIES, type Country } from "@/constants/countries";
import { BANKS_BY_COUNTRY, getUSRouting, getAccountInputMeta, type BankInfo } from "@/constants/banks";
import { getFXRate } from "@/lib/fx";
import { usePaymentStore } from "@/lib/store/paymentStore";

type Step = "invoice" | "account" | "confirm_step";

const DEFAULT_ORIGIN = COUNTRIES.find((c) => c.code === "MX") ?? DEFAULT_COUNTRY;
const DEFAULT_SUPPLIER = COUNTRIES.find((c) => c.code === "CN") ?? DEFAULT_COUNTRY;

export default function ImportarPage() {
  const router = useRouter();
  const t = useTranslations("importar");

  const [step, setStep] = useState<Step>("invoice");

  // Invoice step
  const [originCountry, setOriginCountry] = useState<Country>(DEFAULT_ORIGIN);
  const [supplierCountry, setSupplierCountry] = useState<Country>(DEFAULT_SUPPLIER);
  const [invoiceAmount, setInvoiceAmount] = useState(0); // in supplier currency
  const [invoiceRef, setInvoiceRef] = useState("");
  const [supplierName, setSupplierName] = useState("");

  // Account step
  const [selectedBank, setSelectedBank] = useState<BankInfo | null>(null);
  const [detectedBank, setDetectedBank] = useState<BankInfo | null>(null);
  const [accountId, setAccountId] = useState("");

  // FX
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [fxUpdatedAt, setFxUpdatedAt] = useState<number | null>(null);
  const [fxLoading, setFxLoading] = useState(false);

  const store = usePaymentStore();

  // Amount payer pays in their currency
  const payerAmount = invoiceAmount > 0 && exchangeRate
    ? parseFloat((invoiceAmount / exchangeRate).toFixed(2))
    : 0;

  const fxAgoSecs = fxUpdatedAt ? Math.floor((Date.now() - fxUpdatedAt) / 1000) : undefined;

  const fetchFX = useCallback(async (from: string, to: string) => {
    if (from === to) { setExchangeRate(1); return; }
    setFxLoading(true);
    const rate = await getFXRate(from, to);
    setExchangeRate(rate);
    setFxUpdatedAt(Date.now());
    setFxLoading(false);
  }, []);

  useEffect(() => {
    if (step !== "invoice" || invoiceAmount > 0) {
      fetchFX(originCountry.currency, supplierCountry.currency);
    }
  }, [originCountry.currency, supplierCountry.currency, step, invoiceAmount, fetchFX]);

  function buildBankToken(): string {
    const base = accountId.trim();
    if (supplierCountry.code === "US" && selectedBank) {
      const routing = getUSRouting(selectedBank.id) ?? selectedBank.routing ?? "";
      return `${routing}|${base}`;
    }
    return base;
  }

  function handleConfirm() {
    if (invoiceAmount <= 0 || !accountId.trim()) return;
    const rail = selectRailByTransactionType("importacion", supplierCountry.code);
    store.setAmount(invoiceAmount);
    store.setCurrency(supplierCountry.currency);
    store.setMode("A");
    store.setCountry(supplierCountry.code);
    store.setRail(rail);
    store.setAccountId(buildBankToken());
    store.setBankName(selectedBank?.name ?? supplierCountry.name);
    store.setTransactionType("importacion");
    store.setSourceCurrency(originCountry.currency);
    store.setSourceCountry(originCountry.code);
    store.setSenderAmount(payerAmount);
    store.setExchangeRate(exchangeRate, fxUpdatedAt ?? undefined);
    store.setInvoiceRef(invoiceRef);
    store.setConcept(invoiceRef);
    store.setSupplierName(supplierName || selectedBank?.name || supplierCountry.name);
    router.push("/confirmar");
  }

  const accountMeta = selectedBank
    ? getAccountInputMeta(selectedBank.accountType)
    : { label: "Número de cuenta del proveedor", placeholder: "Número de cuenta" };

  function goBack() {
    if (step === "invoice") router.back();
    else if (step === "account") setStep("invoice");
    else setStep("account");
  }

  function fmt(n: number, c: string) {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency: c }).format(n);
  }

  return (
    <main className="flex flex-col min-h-screen bg-[#0f172a] px-5 pt-10 pb-10">
      <div className="flex items-center gap-3 mb-8">
        <button onClick={goBack} className="p-2 rounded-xl hover:bg-slate-800 transition-colors touch-manipulation">
          <ArrowLeft className="w-6 h-6 text-slate-400" />
        </button>
        <h1 className="text-2xl font-bold text-white">{t("title")}</h1>
      </div>

      <div className="flex gap-2 mb-8">
        {(["invoice", "account", "confirm_step"] as Step[]).map((s, i) => (
          <div
            key={s}
            className={`h-1 flex-1 rounded-full transition-colors ${
              ["invoice", "account", "confirm_step"].indexOf(step) >= i ? "bg-amber-500" : "bg-slate-700"
            }`}
          />
        ))}
      </div>

      <AnimatePresence mode="wait">

        {step === "invoice" && (
          <motion.div key="invoice" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col gap-5 flex-1">
            <p className="text-slate-400 text-center">{t("invoice_data")}</p>

            <div className="flex flex-col gap-1">
              <label className="text-slate-400 text-sm">{t("supplier")}</label>
              <input
                type="text"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                placeholder="Ej. Guangzhou Trading Co."
                className="bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-slate-400 text-sm">{t("invoice")}</label>
              <input
                type="text"
                value={invoiceRef}
                onChange={(e) => setInvoiceRef(e.target.value)}
                placeholder="Ej. INV-2024-8821"
                className="bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-slate-400 text-sm">País proveedor</label>
              <CountrySelector value={supplierCountry.code} onChange={(c) => {
                setSupplierCountry(c);
                setAccountId("");
                const banks = BANKS_BY_COUNTRY[c.code] ?? [];
                setSelectedBank(banks[0] ?? null);
              }} />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-slate-400 text-sm">Monto de la factura ({supplierCountry.currency})</label>
              <AmountInput value={invoiceAmount} currency={supplierCountry.currency} onChange={setInvoiceAmount} />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-slate-400 text-sm">Tu país (pagas desde)</label>
              <CountrySelector value={originCountry.code} onChange={setOriginCountry} />
            </div>

            {invoiceAmount > 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-3">
                {fxLoading ? (
                  <div className="text-center text-slate-500 text-sm">Obteniendo tipo de cambio...</div>
                ) : exchangeRate ? (
                  <>
                    <ExchangeRateDisplay
                      fromCurrency={originCountry.currency}
                      toCurrency={supplierCountry.currency}
                      fromFlag={originCountry.flag}
                      toFlag={supplierCountry.flag}
                      rate={exchangeRate}
                      updatedAgo={fxAgoSecs}
                    />
                    <div className="bg-amber-950/40 border border-amber-800/40 rounded-2xl p-4">
                      <div className="flex items-center justify-between">
                        <div className="text-center">
                          <p className="text-slate-500 text-xs mb-1">{t("you_pay")}</p>
                          <p className="text-white font-bold">{fmt(payerAmount, originCountry.currency)}</p>
                        </div>
                        <ArrowRight className="w-4 h-4 text-amber-400" />
                        <div className="text-center">
                          <p className="text-slate-500 text-xs mb-1">{t("they_receive")}</p>
                          <p className="text-amber-300 font-bold">{fmt(invoiceAmount, supplierCountry.currency)}</p>
                        </div>
                      </div>
                    </div>
                  </>
                ) : null}
              </motion.div>
            )}

            <div className="mt-auto">
              <button
                disabled={invoiceAmount <= 0}
                onClick={() => {
                  setStep("account");
                  if (!selectedBank) {
                    const banks = BANKS_BY_COUNTRY[supplierCountry.code] ?? [];
                    setSelectedBank(banks[0] ?? null);
                  }
                }}
                className="w-full bg-amber-600 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold text-lg py-5 rounded-2xl flex items-center justify-center gap-2 transition-colors touch-manipulation"
              >
                Cuenta del proveedor <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </motion.div>
        )}

        {step === "account" && (
          <motion.div key="account" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col gap-5 flex-1">
            <p className="text-slate-400 text-center">Datos bancarios del proveedor</p>

            <div className="flex items-center justify-between bg-slate-800/50 rounded-2xl px-5 py-4">
              <div className="text-center">
                <p className="text-slate-500 text-xs mb-1">{t("you_pay")}</p>
                <p className="text-white font-bold">{fmt(payerAmount, originCountry.currency)}</p>
              </div>
              <ArrowRight className="w-5 h-5 text-amber-400" />
              <div className="text-center">
                <p className="text-slate-500 text-xs mb-1">{t("they_receive")}</p>
                <p className="text-amber-300 font-bold">{fmt(invoiceAmount, supplierCountry.currency)}</p>
              </div>
            </div>

            <BankCombobox
              country={supplierCountry.code}
              value={selectedBank?.id ?? ""}
              detectedBank={detectedBank}
              onChange={(bank) => { setSelectedBank(bank); setDetectedBank(null); setAccountId(""); }}
            />
            <AccountInput
              label={accountMeta.label}
              placeholder={accountMeta.placeholder}
              value={accountId}
              country={supplierCountry.code}
              onChange={(val, autoDetected) => {
                setAccountId(val);
                if (autoDetected) { setDetectedBank(autoDetected); setSelectedBank(autoDetected); }
              }}
            />

            {invoiceAmount > 0 && exchangeRate && (
              <FeeBreakdown
                amount={invoiceAmount}
                currency={supplierCountry.currency}
                mode="A"
                senderAmount={payerAmount}
                sourceCurrency={originCountry.currency}
                exchangeRate={exchangeRate}
                transactionType="remesa"
              />
            )}

            <div className="mt-auto">
              <button
                disabled={!accountId.trim()}
                onClick={handleConfirm}
                className="w-full bg-amber-600 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold text-lg py-5 rounded-2xl flex items-center justify-center gap-2 transition-colors touch-manipulation"
              >
                Revisar y confirmar <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </main>
  );
}

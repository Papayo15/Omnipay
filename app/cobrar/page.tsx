"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ChevronRight, Store, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import AmountInput from "@/components/AmountInput";
import CommissionToggle from "@/components/CommissionToggle";
import FeeBreakdown from "@/components/FeeBreakdown";
import MerchantSavings from "@/components/MerchantSavings";
import CountrySelector from "@/components/CountrySelector";
import BankCombobox from "@/components/BankCombobox";
import AccountInput from "@/components/AccountInput";
import ShareButton from "@/components/ShareButton";
import { buildPayload, buildPaymentURL } from "@/lib/payload";
import { selectRailByTransactionType } from "@/constants/rails";
import { DEFAULT_COUNTRY, type Country } from "@/constants/countries";
import { BANKS_BY_COUNTRY, getUSRouting, getAccountInputMeta, type BankInfo } from "@/constants/banks";
import { calcFees } from "@/constants/fees";
import { usePaymentStore } from "@/lib/store/paymentStore";

type Step = "type" | "amount" | "account" | "share";
type CobrarType = "business" | "family";

export default function CobrarPage() {
  const router = useRouter();
  const t = useTranslations("cobrar");
  const [step, setStep] = useState<Step>("type");
  const [cobrarType, setCobrarType] = useState<CobrarType>("family");
  const [amount, setAmount] = useState(0);
  const [mode, setMode] = useState<"A" | "B">("A");
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [selectedBank, setSelectedBank] = useState<BankInfo | null>(null);
  const [detectedBank, setDetectedBank] = useState<BankInfo | null>(null);
  const [accountId, setAccountId] = useState("");
  const [invoiceRef, setInvoiceRef] = useState("");
  const [concept, setConcept] = useState("");
  const [paymentUrl, setPaymentUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const clearAll = usePaymentStore((s) => s.clearAll);

  const steps: Step[] = ["type", "amount", "account", "share"];
  const stepIndex = steps.indexOf(step);

  function handleCountryChange(c: Country) {
    setCountry(c);
    setAccountId("");
    const banks = BANKS_BY_COUNTRY[c.code] ?? [];
    setSelectedBank(banks[0] ?? null);
  }

  function handleAccountChange(val: string, autoDetected?: BankInfo) {
    setAccountId(val);
    if (autoDetected) {
      setDetectedBank(autoDetected);
      setSelectedBank(autoDetected);
    }
  }

  function buildBankToken(): string {
    const base = accountId.trim();
    if (country.code === "US" && selectedBank) {
      const routing = getUSRouting(selectedBank.id) ?? selectedBank.routing ?? "";
      return `${routing}|${base}`;
    }
    return base;
  }

  async function handleGenerate() {
    if (!accountId.trim() || amount <= 0) return;
    setLoading(true);
    setError("");
    try {
      const rail = selectRailByTransactionType("terminal");
      const bankToken = buildBankToken();

      const encoded = await buildPayload({
        amount,
        currency: country.currency,
        mode,
        rail,
        bankToken,
        bankName: selectedBank?.name ?? country.name,
        country: country.code,
        receiverName: cobrarType === "business"
          ? (concept || selectedBank?.name || "Negocio")
          : (selectedBank?.name ?? "Familiar"),
        transactionType: "terminal",
      });

      const url = buildPaymentURL(encoded);
      setPaymentUrl(url);
      setStep("share");
    } catch (e) {
      setError("Error al generar el cobro. Intenta de nuevo.");
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const { receiverGets, fee } = amount > 0 ? calcFees(amount, mode) : { receiverGets: 0, fee: 0 };
  const amountLabel = amount > 0
    ? new Intl.NumberFormat("es-MX", { style: "currency", currency: country.currency }).format(amount)
    : "";

  const accountMeta = selectedBank
    ? getAccountInputMeta(selectedBank.accountType)
    : { label: "Número de cuenta", placeholder: "Número de cuenta" };

  function goBack() {
    if (step === "type") router.back();
    else if (step === "amount") setStep("type");
    else if (step === "account") setStep("amount");
    else if (step === "share") setStep("account");
  }

  return (
    <main className="flex flex-col min-h-screen bg-[#0f172a] px-5 pt-10 pb-10">
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={goBack}
          className="p-2 rounded-xl hover:bg-slate-800 transition-colors touch-manipulation"
        >
          <ArrowLeft className="w-6 h-6 text-slate-400" />
        </button>
        <h1 className="text-2xl font-bold text-white">{t("title")}</h1>
      </div>

      <div className="flex gap-2 mb-8">
        {steps.map((s, i) => (
          <div
            key={s}
            className={`h-1 flex-1 rounded-full transition-colors ${
              stepIndex >= i ? "bg-emerald-500" : "bg-slate-700"
            }`}
          />
        ))}
      </div>

      <AnimatePresence mode="wait">

        {step === "type" && (
          <motion.div key="type" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="flex flex-col gap-4 flex-1">
            <p className="text-slate-400 text-center mb-2">{t("type_title")}</p>

            <button
              onClick={() => { setCobrarType("business"); setStep("amount"); }}
              className="w-full border border-emerald-700/50 bg-emerald-900/20 rounded-2xl p-5 flex items-center gap-4 hover:bg-emerald-900/40 touch-manipulation transition-colors text-left"
            >
              <div className="bg-emerald-900/60 rounded-xl p-3">
                <Store className="w-6 h-6 text-emerald-400" />
              </div>
              <div className="flex-1">
                <p className="text-white font-semibold">{t("type_business")}</p>
                <p className="text-slate-400 text-sm">{t("type_business_sub")}</p>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-500" />
            </button>

            <button
              onClick={() => { setCobrarType("family"); setStep("amount"); }}
              className="w-full border border-slate-700 rounded-2xl p-5 flex items-center gap-4 hover:bg-slate-800/40 touch-manipulation transition-colors text-left"
            >
              <div className="bg-slate-800 rounded-xl p-3">
                <Users className="w-6 h-6 text-slate-300" />
              </div>
              <div className="flex-1">
                <p className="text-white font-semibold">{t("type_family")}</p>
                <p className="text-slate-400 text-sm">{t("type_family_sub")}</p>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-500" />
            </button>
          </motion.div>
        )}

        {step === "amount" && (
          <motion.div key="amount" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col gap-5 flex-1">
            <p className="text-slate-400 text-center">{t("how_much")}</p>
            <AmountInput value={amount} currency={country.currency} onChange={setAmount} />

            {cobrarType === "business" && (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-slate-400 text-sm">{t("invoice_ref")}</label>
                  <input
                    type="text"
                    value={invoiceRef}
                    onChange={(e) => setInvoiceRef(e.target.value)}
                    placeholder="Ej. FAC-2024-001"
                    className="bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-slate-400 text-sm">{t("concept")}</label>
                  <input
                    type="text"
                    value={concept}
                    onChange={(e) => setConcept(e.target.value)}
                    placeholder="Ej. Servicios de diseño"
                    className="bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>
              </div>
            )}

            <MerchantSavings amount={amount} currency={country.currency} />
            <CommissionToggle mode={mode} onChange={setMode} transactionType="terminal" />
            <FeeBreakdown amount={amount} currency={country.currency} mode={mode} transactionType="terminal" />

            <div className="mt-auto">
              <button
                disabled={amount <= 0}
                onClick={() => {
                  setStep("account");
                  if (!selectedBank) {
                    const banks = BANKS_BY_COUNTRY[country.code] ?? [];
                    setSelectedBank(banks[0] ?? null);
                  }
                }}
                className="w-full bg-emerald-600 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold text-lg py-5 rounded-2xl flex items-center justify-center gap-2 transition-colors touch-manipulation"
              >
                {t("to_which_account")} <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </motion.div>
        )}

        {step === "account" && (
          <motion.div key="account" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col gap-5 flex-1">
            <p className="text-slate-400 text-center">{t("to_which_account")}</p>
            <CountrySelector value={country.code} onChange={handleCountryChange} />
            <BankCombobox
              country={country.code}
              value={selectedBank?.id ?? ""}
              detectedBank={detectedBank}
              onChange={(bank) => { setSelectedBank(bank); setDetectedBank(null); setAccountId(""); }}
            />
            <AccountInput
              label={accountMeta.label}
              placeholder={accountMeta.placeholder}
              value={accountId}
              country={country.code}
              onChange={handleAccountChange}
            />
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            <div className="mt-auto">
              <button
                disabled={!accountId.trim() || loading}
                onClick={handleGenerate}
                className="w-full bg-emerald-600 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold text-lg py-5 rounded-2xl transition-colors touch-manipulation flex items-center justify-center gap-2"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>{t("generate")} <ChevronRight className="w-5 h-5" /></>
                )}
              </button>
            </div>
          </motion.div>
        )}

        {step === "share" && (
          <motion.div key="share" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col gap-5 flex-1">
            <div className="bg-emerald-900/30 border border-emerald-700/50 rounded-2xl p-4 text-center">
              <p className="text-slate-400 text-sm">{t("share_title")}</p>
              <p className="text-emerald-400 text-3xl font-bold mt-1">
                {new Intl.NumberFormat("es-MX", { style: "currency", currency: country.currency }).format(amount)}
              </p>
              {cobrarType === "business" && (invoiceRef || concept) && (
                <div className="mt-2 text-left bg-slate-800/40 rounded-xl px-4 py-2">
                  {invoiceRef && <p className="text-slate-400 text-xs">Ref: <span className="text-white">{invoiceRef}</span></p>}
                  {concept && <p className="text-slate-400 text-xs">Concepto: <span className="text-white">{concept}</span></p>}
                </div>
              )}
              <p className="text-slate-400 text-sm mt-2">
                {t("business_receives")}{" "}
                <span className="text-emerald-300 font-semibold">
                  {new Intl.NumberFormat("es-MX", { style: "currency", currency: country.currency }).format(receiverGets)}
                </span>
                {" · "}{t("commission")}:{" "}
                <span className="text-slate-500">
                  {new Intl.NumberFormat("es-MX", { style: "currency", currency: country.currency }).format(fee)}
                </span>
              </p>
              <p className="text-slate-600 text-xs mt-1">{t("valid_15")}</p>
            </div>

            <ShareButton url={paymentUrl} amount={amountLabel} transactionType="terminal" />

            <button onClick={() => { clearAll(); router.push("/"); }} className="text-slate-500 text-sm text-center mt-2 touch-manipulation">
              {t("back_home")}
            </button>
          </motion.div>
        )}

      </AnimatePresence>
    </main>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { TrustBanner } from "@/components/TrustBanner";

type Step = "loading" | "form" | "submitting" | "completed" | "error";

// Countries routed through Alchemy Pay — i.e. everything with no native Bridge
// rail (see lib/funding-provider.ts). Kept in sync manually since the sender
// picks their OWN country here, independent of the recipient's.
const SENDER_COUNTRIES = [
  { code: "AU", currency: "AUD", flag: "🇦🇺" },
  { code: "NG", currency: "NGN", flag: "🇳🇬" },
  { code: "KE", currency: "KES", flag: "🇰🇪" },
  { code: "GH", currency: "GHS", flag: "🇬🇭" },
  { code: "IN", currency: "INR", flag: "🇮🇳" },
  { code: "PH", currency: "PHP", flag: "🇵🇭" },
  { code: "ID", currency: "IDR", flag: "🇮🇩" },
  { code: "VN", currency: "VND", flag: "🇻🇳" },
  { code: "TH", currency: "THB", flag: "🇹🇭" },
  { code: "MY", currency: "MYR", flag: "🇲🇾" },
  { code: "SG", currency: "SGD", flag: "🇸🇬" },
  { code: "JP", currency: "JPY", flag: "🇯🇵" },
  { code: "KR", currency: "KRW", flag: "🇰🇷" },
  { code: "PK", currency: "PKR", flag: "🇵🇰" },
  { code: "BD", currency: "BDT", flag: "🇧🇩" },
  { code: "ZA", currency: "ZAR", flag: "🇿🇦" },
  { code: "EG", currency: "EGP", flag: "🇪🇬" },
  { code: "MA", currency: "MAD", flag: "🇲🇦" },
  { code: "AE", currency: "AED", flag: "🇦🇪" },
  { code: "SA", currency: "SAR", flag: "🇸🇦" },
];

interface Preview {
  order_type: "p2p" | "b2b-bridge";
  recipient: { name: string; country: string; amount: number; currency: string };
}

interface PayResponse {
  order_id: string;
  pay_link: string;
  error?:   string;
}

export default function PagarAlchemyPayPage() {
  const t = useTranslations("pagar_alchemypay");
  const [token, setToken]           = useState<string | null>(null);
  const [step, setStep]             = useState<Step>("loading");
  const [preview, setPreview]       = useState<Preview | null>(null);
  const [senderName, setSenderName] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [senderCountry, setSenderCountry] = useState("AU");
  const [amount, setAmount]         = useState("");
  const [errorMsg, setErrorMsg]     = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [completedOrderId, setCompletedOrderId] = useState<string | null>(null);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);

    // Alchemy Pay redirects back here after the sender finishes payment (and
    // any inline verification it required) on its own hosted page — this is
    // the "OmniPay handshake" return leg, same idea as Bridge's ?kyc_done=1.
    const orderId  = p.get("order_id");
    const apStatus = p.get("ap_status");
    if (orderId && apStatus === "completed") {
      setCompletedOrderId(orderId);
      setStep("completed");
      return;
    }

    const tok = p.get("t");
    if (!tok) { window.location.href = "/"; return; }
    setToken(tok);
    fetch(`/api/alchemypay/order/preview?t=${encodeURIComponent(tok)}`)
      .then((r) => r.json())
      .then((d: Preview & { error?: string }) => {
        if (d.error) throw new Error(d.error);
        setPreview(d);
        setStep("form");
      })
      .catch((e) => { setErrorMsg(e.message); setStep("error"); });
  }, []);

  const selectedCountry = SENDER_COUNTRIES.find((c) => c.code === senderCountry) ?? SENDER_COUNTRIES[0];

  const submit = useCallback(async () => {
    const amt = parseFloat(amount);
    if (!token || !senderEmail.includes("@") || !amt || amt <= 0) return;
    setSubmitting(true);
    setStep("submitting");
    try {
      const res = await fetch("/api/alchemypay/order/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          senderName:         senderName.trim() || undefined,
          senderEmail:        senderEmail.toLowerCase().trim(),
          senderCountry,
          senderFiatAmount:   amt,
          senderFiatCurrency: selectedCountry.currency,
        }),
      });
      const data = await res.json() as PayResponse;
      if (!res.ok || !data.pay_link) throw new Error(data.error ?? "Error");
      window.location.href = data.pay_link;
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Error");
      setStep("error");
    } finally {
      setSubmitting(false);
    }
  }, [token, senderName, senderEmail, senderCountry, amount, selectedCountry]);

  if (step === "loading") {
    return (
      <main className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </main>
    );
  }

  if (step === "error") {
    return (
      <main className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center px-6 text-center gap-5">
        <div className="text-5xl">⚠️</div>
        <p className="text-slate-300 text-sm max-w-xs">{errorMsg}</p>
      </main>
    );
  }

  // Return leg from Alchemy Pay's hosted checkout — ?order_id=...&ap_status=completed
  if (step === "completed") {
    return (
      <main className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center px-6 text-center gap-5">
        <div className="text-5xl">✅</div>
        <div>
          <h2 className="text-white font-bold text-xl mb-1">{t("completed_title")}</h2>
          <p className="text-slate-400 text-sm max-w-xs">{t("completed_body")}</p>
        </div>
        {completedOrderId && (
          <a
            href={`/seguimiento?order_id=${completedOrderId}`}
            className="w-full max-w-xs bg-[#00C9C8] hover:bg-[#00b3b2] text-slate-900 text-sm font-bold py-3.5 rounded-2xl transition-colors"
          >
            {t("track_button")}
          </a>
        )}
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0f172a] flex flex-col pb-10 w-full">
      <div className="max-w-sm mx-auto w-full px-5 pt-6">
        <button onClick={() => (window.location.href = "/")} className="flex items-center gap-2 text-slate-400 hover:text-white text-sm transition-colors">
          <ArrowLeft className="w-4 h-4" /> OmniPay
        </button>
      </div>

      <div className="w-full max-w-sm mx-auto px-5 pt-5 pb-2">
        <h1 className="text-white font-bold text-lg mb-1">⚡ {t("page_title")}</h1>
        <p className="text-slate-500 text-xs mb-4">{t("powered_by_note")}</p>
      </div>

      <div className="space-y-4 flex-1 max-w-sm mx-auto w-full px-5">
        {preview && (
          <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-4">
            <p className="text-slate-400 text-xs">{t("recipient_gets")}</p>
            <p className="text-white font-bold text-xl">
              {preview.recipient.amount.toLocaleString()} {preview.recipient.currency}
            </p>
            <p className="text-slate-500 text-xs mt-1">{preview.recipient.name} · {preview.recipient.country}</p>
          </div>
        )}

        <div>
          <label className="block text-xs text-slate-400 mb-1">{t("email_label")}</label>
          <input type="email" inputMode="email" value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)}
            placeholder="tu@email.com"
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-[#00C9C8] text-sm" />
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1">{t("name_label")}</label>
          <input type="text" value={senderName} onChange={(e) => setSenderName(e.target.value)}
            placeholder={t("name_placeholder")}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-[#00C9C8] text-sm" />
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1">{t("your_country_label")}</label>
          <select value={senderCountry} onChange={(e) => setSenderCountry(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#00C9C8]">
            {SENDER_COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>{c.flag} {c.code} — {c.currency}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1">{t("amount_label")} ({selectedCountry.currency})</label>
          <input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-[#00C9C8] text-sm" />
        </div>

        <button
          onClick={submit}
          disabled={submitting || !senderEmail.includes("@") || !amount}
          className="w-full py-3.5 rounded-2xl bg-[#00C9C8] hover:bg-[#00b3b2] disabled:opacity-50 text-slate-900 text-sm font-bold transition-colors"
        >
          {submitting ? t("redirecting") : t("continue_button")}
        </button>

        <p className="text-slate-600 text-xs text-center">{t("footer_note")}</p>

        <div className="mt-4">
          <TrustBanner variant="checkout" />
        </div>
      </div>
    </main>
  );
}

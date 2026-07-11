"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, Copy, Check, Download, CreditCard, Building2 } from "lucide-react";
import { useRouter } from "next/navigation";

type Step     = "form" | "generating" | "share" | "checkout" | "done" | "error";
type PayMode  = "card" | "bank";

interface FeeBreakdown {
  amount_principal:     number;
  ramp_fee_estimate:    number;
  omnipay_platform_fee: number;
  network_delivery_fee: number;
  fx_buffer_applied:    boolean;
  total_sender_pays:    number;
  route_used:           "bitso" | "wise_emergency";
  target_currency:      string;
  rate_to_target:       number;
}

interface CheckoutData {
  partnerOrderId: string;
  provider:       string;
  widget_url:     string;
  estimate: {
    recipient_gets:        number;
    target_currency:       string;
    usdc_subtotal:         number;
    omnipay_fee_usdc:      number;
    ramp_fee_estimate:     number;
    total_sender_pays_usd: number;
    fx_buffer_applied:     boolean;
    route_used:            string;
  };
}

export default function P2PPage() {
  const t      = useTranslations("p2p");
  const router = useRouter();

  const [step,           setStep]          = useState<Step>("form");
  const [payMode,        setPayMode]       = useState<PayMode>("card");
  const [nombre,         setNombre]        = useState("");
  const [account,        setAccount]       = useState(""); // card number OR bank/CLABE
  const [amountTarget,   setAmountTarget]  = useState("");
  const [targetCountry,  setTargetCountry] = useState("MX");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [payerPhone,     setPayerPhone]    = useState("");
  const [checkout,       setCheckout]      = useState<CheckoutData | null>(null);
  const [shareLink,      setShareLink]     = useState("");
  const [copied,         setCopied]        = useState(false);
  const [errorMsg,       setErrorMsg]      = useState("");
  const [submitting,     setSubmitting]    = useState(false);
  const [breakdown,      setBreakdown]     = useState<FeeBreakdown | null>(null);
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Detect payer opening the link (?pid=...&n=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pid    = params.get("pid");
    const name   = params.get("n");
    if (pid && name) {
      setNombre(decodeURIComponent(name));
      setCheckout({ partnerOrderId: pid, provider: "ramp", widget_url: "", estimate: { recipient_gets: 0, target_currency: "MXN", usdc_subtotal: 0, omnipay_fee_usdc: 0, ramp_fee_estimate: 0, total_sender_pays_usd: 0, fx_buffer_applied: false, route_used: "bitso" } });
      setStep("checkout");
    }
  }, []);

  // ── Fee breakdown — debounced ────────────────────────────────────────────────
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!amountTarget || parseFloat(amountTarget) < 50) { setBreakdown(null); return; }

    debounceRef.current = setTimeout(async () => {
      setBreakdownLoading(true);
      try {
        const res  = await fetch(`/api/v1/p2p/rate?amount_target=${amountTarget}&target_country=${targetCountry}`);
        if (res.ok) setBreakdown(await res.json() as FeeBreakdown);
      } catch { /* ignore */ } finally {
        setBreakdownLoading(false);
      }
    }, 600);
  }, [amountTarget, targetCountry]);

  const generateLink = useCallback(async () => {
    const amt = parseFloat(amountTarget);
    if (!nombre.trim() || !account.trim() || !amt || amt < 50) return;
    if (payMode === "card" && account.replace(/\s/g, "").length !== 16) return;
    if (payMode === "bank" && targetCountry === "MX" && account.length !== 18) return;

    setSubmitting(true);
    setStep("generating");
    try {
      const res  = await fetch("/api/v1/p2p/checkout", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          nombre:          nombre.trim(),
          account:         account.replace(/\s/g, ""),
          payout_method:   payMode,
          amount_target:   amt,
          target_country:  targetCountry,
          recipient_phone: recipientPhone || undefined,
          payer_phone:     payerPhone     || undefined,
        }),
      });
      const data = await res.json() as CheckoutData & { error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "Error");

      setCheckout(data);
      const link = `${window.location.origin}/p2p?pid=${encodeURIComponent(data.partnerOrderId.slice(0, 12))}&n=${encodeURIComponent(nombre.trim())}`;
      setShareLink(link);
      setStep("share");
    } catch (err) {
      const e = err as Error;
      setErrorMsg(e.message.toLowerCase().includes("503") || e.message.toLowerCase().includes("configured")
        ? t("error_unavailable") : e.message);
      setStep("error");
    } finally {
      setSubmitting(false);
    }
  }, [nombre, account, amountTarget, payMode, targetCountry, recipientPhone, payerPhone, t]);

  const copyLink = useCallback(async () => {
    await navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [shareLink]);

  const openWhatsApp = useCallback(() => {
    const msg = t("share_message", { name: nombre, amount: parseFloat(amountTarget).toLocaleString(), link: shareLink });
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  }, [nombre, amountTarget, shareLink, t]);

  const openTelegram = useCallback(() => {
    const msg = t("share_message", { name: nombre, amount: parseFloat(amountTarget).toLocaleString(), link: shareLink });
    window.open(`https://t.me/share/url?url=${encodeURIComponent(shareLink)}&text=${encodeURIComponent(msg)}`, "_blank");
  }, [nombre, amountTarget, shareLink, t]);

  const scrollToForm = () => document.getElementById("p2p-form")?.scrollIntoView({ behavior: "smooth" });

  const isCardValid = payMode === "card" && account.replace(/\s/g, "").length === 16;
  const isBankValidMX = payMode === "bank" && targetCountry === "MX" && account.length === 18;
  const isBankValidOther = payMode === "bank" && targetCountry !== "MX" && account.length >= 5;
  const accountValid = isCardValid || isBankValidMX || isBankValidOther;
  const formReady = !!nombre.trim() && accountValid && parseFloat(amountTarget) >= 50;

  // ── Generating ──────────────────────────────────────────────────────────────
  if (step === "generating") {
    return (
      <main className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-slate-400 text-sm">{t("generate_button")}…</p>
        </div>
      </main>
    );
  }

  // ── Share ───────────────────────────────────────────────────────────────────
  if (step === "share" && checkout) {
    const est = checkout.estimate;
    return (
      <main className="min-h-screen bg-[#0f172a] flex flex-col px-5 pt-12 pb-10 max-w-sm mx-auto w-full">
        <button onClick={() => setStep("form")} className="flex items-center gap-1 text-slate-400 text-sm mb-8 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" /> {t("new_transfer")}
        </button>
        <div className="flex-1 flex flex-col items-center justify-center gap-5 text-center">
          <div className="text-5xl">🔗</div>
          <div>
            <h2 className="text-white font-bold text-xl mb-1">{t("share_title")}</h2>
            <p className="text-slate-400 text-sm">{t("share_hint")}</p>
          </div>
          <div className="w-full bg-slate-800/60 border border-slate-700 rounded-2xl p-4 text-center">
            <p className="text-slate-400 text-xs mb-1">{nombre}</p>
            <p className="text-white font-bold text-2xl">{est.recipient_gets.toLocaleString()} {est.target_currency}</p>
            <p className="text-slate-500 text-xs mt-1">~${est.total_sender_pays_usd.toFixed(2)} USD total · via {checkout.provider}</p>
            {est.fx_buffer_applied && (
              <p className="text-amber-400 text-xs mt-1">⚡ {t("route_wise_emergency")} · FX buffer applied</p>
            )}
          </div>
          <div className="w-full space-y-3">
            <button onClick={openWhatsApp} className="w-full bg-[#25D366] hover:bg-[#20ba59] text-white font-semibold py-3 rounded-xl text-sm flex items-center justify-center gap-2 transition-colors">
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              {t("share_whatsapp")}
            </button>
            <button onClick={openTelegram} className="w-full bg-[#229ED9] hover:bg-[#1a8bc2] text-white font-semibold py-3 rounded-xl text-sm flex items-center justify-center gap-2 transition-colors">
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
              {t("done_share_telegram")}
            </button>
            <button onClick={copyLink} className="w-full border border-slate-600 text-slate-300 hover:border-slate-400 py-3 rounded-xl text-sm flex items-center justify-center gap-2 transition-colors">
              {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
              {copied ? "✓ Copied" : t("share_copy")}
            </button>
          </div>
          <button onClick={() => { setStep("form"); setNombre(""); setAccount(""); setAmountTarget(""); setRecipientPhone(""); setPayerPhone(""); setBreakdown(null); }} className="text-slate-500 hover:text-slate-300 text-xs transition-colors">
            + {t("new_transfer")}
          </button>
        </div>
      </main>
    );
  }

  // ── Checkout — payer opens the link ─────────────────────────────────────────
  if (step === "checkout" && checkout) {
    const widgetUrl = checkout.widget_url;
    return (
      <main className="min-h-screen bg-[#0f172a] flex flex-col px-5 pt-12 pb-10 max-w-sm mx-auto w-full">
        <button onClick={() => router.push("/")} className="flex items-center gap-1 text-slate-400 text-sm mb-8 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" /> OmniPay
        </button>
        <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-6 space-y-5">
          <div className="text-center">
            <p className="text-slate-400 text-sm">{t("checkout_title", { name: nombre })}</p>
            <p className="text-white font-bold text-3xl mt-1">{checkout.estimate.recipient_gets.toLocaleString()} {checkout.estimate.target_currency}</p>
          </div>
          <div className="bg-[#0f172a] rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">{t("checkout_subtitle")}</span>
              <span className="text-emerald-400 font-bold">~${checkout.estimate.total_sender_pays_usd.toFixed(2)} USD</span>
            </div>
            <p className="text-xs text-slate-500">{t("checkout_fee")}</p>
          </div>

          {/* Widget embed */}
          {widgetUrl ? (
            <iframe
              src={widgetUrl}
              className="w-full h-[460px] rounded-xl border border-slate-700"
              allow="payment *; camera *"
              title="OmniPay P2P Payment"
            />
          ) : (
            <div className="bg-[#0f172a] border border-emerald-500/30 rounded-xl p-6 text-center space-y-3">
              <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-slate-400 text-sm">{t("widget_loading")}</p>
              <p className="text-xs text-slate-600">Ramp Network / Transak</p>
            </div>
          )}

          <p className="text-center text-xs text-slate-600">Powered by Ramp + Bitso · No Stripe · No data stored</p>
        </div>
      </main>
    );
  }

  // ── Done ─────────────────────────────────────────────────────────────────────
  if (step === "done") {
    return (
      <main className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center px-5 gap-5 text-center">
        <div className="text-5xl">✅</div>
        <h2 className="text-white font-bold text-xl">{t("done_title")}</h2>
        <p className="text-slate-400 text-sm max-w-xs">{t("done_message", { name: nombre, amount: parseFloat(amountTarget).toLocaleString() })}</p>
        <div className="w-full max-w-xs space-y-3">
          <button onClick={openWhatsApp} className="w-full bg-[#25D366] text-white py-3 rounded-xl text-sm font-semibold">{t("done_share_whatsapp")}</button>
          <button onClick={openTelegram} className="w-full bg-[#229ED9] text-white py-3 rounded-xl text-sm font-semibold">{t("done_share_telegram")}</button>
          <button onClick={() => window.print()} className="w-full border border-slate-600 text-slate-300 py-3 rounded-xl text-sm flex items-center justify-center gap-2">
            <Download size={16} /> {t("done_download")}
          </button>
        </div>
        <button onClick={() => { setStep("form"); setNombre(""); setAccount(""); setAmountTarget(""); }} className="text-slate-500 hover:text-slate-300 text-xs transition-colors">
          + {t("new_transfer")}
        </button>
      </main>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────────
  if (step === "error") {
    return (
      <main className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center px-6 text-center gap-5">
        <div className="text-5xl">⚠️</div>
        <p className="text-slate-300 text-sm max-w-xs">{errorMsg}</p>
        <button onClick={() => setStep("form")} className="text-emerald-400 text-sm underline">← {t("new_transfer")}</button>
      </main>
    );
  }

  // ── FORM — full layout matching B2B ─────────────────────────────────────────
  return (
    <main className="min-h-screen bg-[#0f172a] flex flex-col pb-10 w-full">

      {/* Back */}
      <div className="max-w-2xl mx-auto w-full px-6 pt-6">
        <button onClick={() => router.push("/")} className="flex items-center gap-2 text-slate-400 hover:text-white text-sm transition-colors">
          ← OmniPay Global
        </button>
      </div>

      {/* Header */}
      <section className="w-full max-w-2xl mx-auto px-6 pt-8 pb-4 text-center">
        <div className="text-4xl mb-3">🌍</div>
        <h1 className="text-white font-bold text-2xl mb-1">{t("page_title")}</h1>
        <p className="text-slate-400 text-sm mb-2">{t("feat2_title")}</p>
        <span className="text-[10px] text-slate-500 bg-slate-800 rounded-lg px-3 py-1.5 inline-block">
          Powered by Ramp + Bitso · No Stripe
        </span>
      </section>

      {/* Features */}
      <section className="w-full max-w-2xl mx-auto px-6 py-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { emoji: "🌍", title: t("feat1_title"), body: t("feat1_body") },
          { emoji: "💱", title: t("feat2_title"), body: t("feat2_body") },
          { emoji: "⚡", title: t("feat3_title"), body: t("feat3_body") },
        ].map((f) => (
          <div key={f.title} className="bg-slate-800/50 rounded-2xl p-5 border border-slate-700/50">
            <div className="text-2xl mb-3">{f.emoji}</div>
            <h3 className="text-white font-semibold text-sm mb-2">{f.title}</h3>
            <p className="text-slate-400 text-xs leading-relaxed">{f.body}</p>
          </div>
        ))}
      </section>

      {/* Pricing — 2 cards */}
      <section className="w-full max-w-2xl mx-auto px-6 pb-10">
        <h2 className="text-white font-bold text-xl text-center mb-2">{t("pricing_title")}</h2>
        <p className="text-slate-500 text-xs text-center mb-8">{t("pricing_sub")}</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="bg-slate-800/60 border border-emerald-500/40 rounded-2xl p-6 flex flex-col gap-4">
            <div>
              <span className="text-xs text-slate-400 uppercase tracking-widest font-semibold">{t("pricing_card1_label")}</span>
              <p className="text-emerald-400 text-4xl font-extrabold mt-1">~2%</p>
              <p className="text-slate-400 text-xs mt-1">{t("pricing_card1_fee")}</p>
            </div>
            <ul className="text-slate-400 text-xs space-y-1">
              {[t("pricing_card1_li1"), t("pricing_card1_li2"), t("pricing_card1_li3"), t("pricing_card1_li4")].map((li) => (
                <li key={li}>{li}</li>
              ))}
            </ul>
            <button onClick={scrollToForm} className="mt-auto w-full bg-emerald-500 hover:bg-emerald-400 active:scale-95 transition-all text-white font-semibold py-3 rounded-xl text-sm">
              {t("pricing_card1_cta")}
            </button>
          </div>
          <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-6 flex flex-col gap-4 relative">
            <span className="absolute top-4 right-4 bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">60% OFF</span>
            <div>
              <span className="text-xs text-slate-400 uppercase tracking-widest font-semibold">{t("pricing_card2_label")}</span>
              <p className="text-slate-200 text-4xl font-extrabold mt-1">vs.</p>
              <p className="text-slate-400 text-xs mt-1">{t("pricing_card2_fee")}</p>
            </div>
            <ul className="text-xs space-y-1">
              <li className="text-emerald-400 font-semibold">{t("pricing_card2_li1")}</li>
              {[t("pricing_card2_li2"), t("pricing_card2_li3"), t("pricing_card2_li4")].map((li) => (
                <li key={li} className="text-red-400">{li}</li>
              ))}
            </ul>
            <button onClick={scrollToForm} className="mt-auto w-full border border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10 active:scale-95 transition-all font-semibold py-3 rounded-xl text-sm">
              {t("pricing_card1_cta")}
            </button>
          </div>
        </div>
      </section>

      {/* Form header */}
      <div className="w-full max-w-sm mx-auto px-5 pb-4">
        <h2 className="text-white font-bold text-lg mb-1">{t("form_title")}</h2>
        <p className="text-slate-500 text-xs mb-6">{t("form_sub")}</p>
      </div>

      <div id="p2p-form" className="space-y-4 flex-1 max-w-sm mx-auto w-full px-5">

        {/* Recipient name */}
        <div>
          <label className="block text-xs text-slate-400 mb-1">{t("label_recipient")}</label>
          <input
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder={t("name_placeholder")}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-sm"
          />
        </div>

        {/* Payout mode toggle — Card (primary) vs Bank */}
        <div>
          <label className="block text-xs text-slate-400 mb-2">{t("card_or_bank")}</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setPayMode("card"); setAccount(""); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                payMode === "card"
                  ? "bg-emerald-500/20 border-emerald-500 text-emerald-400"
                  : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500"
              }`}
            >
              <CreditCard size={15} /> {t("payout_toggle_card")}
            </button>
            <button
              type="button"
              onClick={() => { setPayMode("bank"); setAccount(""); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                payMode === "bank"
                  ? "bg-blue-500/20 border-blue-500 text-blue-400"
                  : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500"
              }`}
            >
              <Building2 size={15} /> {t("payout_toggle_bank")}
            </button>
          </div>
        </div>

        {/* Card number OR Bank account */}
        {payMode === "card" ? (
          <div>
            <label className="block text-xs text-slate-400 mb-1">{t("card_number_label")}</label>
            <input
              type="text"
              inputMode="numeric"
              value={account}
              onChange={(e) => {
                const raw = e.target.value.replace(/\D/g, "").slice(0, 16);
                setAccount(raw.replace(/(.{4})/g, "$1 ").trim());
              }}
              placeholder={t("card_number_placeholder")}
              className={`w-full bg-slate-800 border rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none text-sm font-mono tracking-widest transition-colors ${
                account.replace(/\s/g, "").length > 0 && account.replace(/\s/g, "").length !== 16
                  ? "border-red-500"
                  : "border-slate-700 focus:border-emerald-500"
              }`}
            />
            {account.replace(/\s/g, "").length > 0 && account.replace(/\s/g, "").length !== 16 && (
              <p className="text-xs text-red-400 mt-1">16 digits required</p>
            )}
          </div>
        ) : (
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              {targetCountry === "MX" ? t("clabe_label") : "Bank Account / IBAN"}
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={account}
              onChange={(e) => setAccount(targetCountry === "MX" ? e.target.value.replace(/\D/g, "").slice(0, 18) : e.target.value)}
              placeholder={targetCountry === "MX" ? t("clabe_placeholder") : "Enter account number"}
              className={`w-full bg-slate-800 border rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none text-sm font-mono transition-colors ${
                targetCountry === "MX" && account.length > 0 && account.length !== 18
                  ? "border-red-500"
                  : "border-slate-700 focus:border-emerald-500"
              }`}
            />
            {targetCountry === "MX" && account.length > 0 && account.length !== 18 && (
              <p className="text-xs text-red-400 mt-1">{t("error_invalid_clabe")}</p>
            )}
          </div>
        )}

        {/* Amount + country */}
        <div>
          <label className="block text-xs text-slate-400 mb-1">{t("amount_label")}</label>
          <div className="flex gap-2">
            <input
              type="number"
              inputMode="numeric"
              value={amountTarget}
              onChange={(e) => setAmountTarget(e.target.value)}
              placeholder={t("amount_placeholder")}
              min="50"
              className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-sm"
            />
            <select
              value={targetCountry}
              onChange={(e) => { setTargetCountry(e.target.value); setBreakdown(null); }}
              className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-3 text-white text-sm focus:outline-none focus:border-emerald-500 min-w-[90px]"
            >
              <option value="MX">MXN 🇲🇽</option>
              <option value="BR">BRL 🇧🇷</option>
              <option value="CO">COP 🇨🇴</option>
              <option value="AR">ARS 🇦🇷</option>
              <option value="US">USD 🇺🇸</option>
              <option value="GB">GBP 🇬🇧</option>
              <option value="IN">INR 🇮🇳</option>
              <option value="PH">PHP 🇵🇭</option>
              <option value="NG">NGN 🇳🇬</option>
              <option value="DE">EUR 🇩🇪</option>
            </select>
          </div>
          {amountTarget && parseFloat(amountTarget) < 50 && (
            <p className="text-xs text-red-400 mt-1">{t("error_min_amount")}</p>
          )}
        </div>

        {/* Fee Breakdown ── live calculator */}
        {(breakdownLoading || breakdown) && (
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4 space-y-2">
            <p className="text-xs text-slate-400 font-semibold uppercase tracking-widest mb-3">{t("fee_breakdown_title")}</p>
            {breakdownLoading ? (
              <div className="flex items-center gap-2 text-slate-500 text-xs py-2">
                <div className="w-3 h-3 border border-slate-500 border-t-transparent rounded-full animate-spin" />
                {t("fee_loading")}
              </div>
            ) : breakdown ? (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">{t("fee_principal")}</span>
                  <span className="text-white font-semibold">{breakdown.amount_principal.toLocaleString()} {breakdown.target_currency}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">{t("fee_payin")} (~2.5%)</span>
                  <span className="text-slate-400">~${breakdown.ramp_fee_estimate.toFixed(2)} USD</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">{t("fee_platform")}</span>
                  <span className="text-slate-400">${breakdown.omnipay_platform_fee.toFixed(2)} USD</span>
                </div>
                {breakdown.network_delivery_fee > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">{t("fee_network")}</span>
                    <span className="text-slate-400">${breakdown.network_delivery_fee.toFixed(2)} USD</span>
                  </div>
                )}
                {breakdown.fx_buffer_applied && (
                  <div className="flex justify-between text-xs">
                    <span className="text-amber-500">{t("fee_fx_buffer")} (+0.75%)</span>
                    <span className="text-amber-400">included</span>
                  </div>
                )}
                <div className="border-t border-slate-700 pt-2 flex justify-between text-sm font-bold">
                  <span className="text-white">{t("fee_total")}</span>
                  <span className="text-emerald-400">~${breakdown.total_sender_pays.toFixed(2)} USD</span>
                </div>
                <p className="text-[10px] text-slate-600 text-center">
                  {t("fee_route")}: {breakdown.route_used === "bitso" ? t("route_bitso") : t("route_wise_emergency")}
                  {breakdown.rate_to_target > 1 && ` · 1 USD = ${breakdown.rate_to_target.toFixed(2)} ${breakdown.target_currency}`}
                </p>
              </>
            ) : null}
          </div>
        )}

        {/* Phones */}
        <div>
          <label className="block text-xs text-slate-400 mb-1">{t("label_recipient_phone")}</label>
          <input type="tel" inputMode="tel" value={recipientPhone} onChange={(e) => setRecipientPhone(e.target.value)} placeholder="+52 55 1234 5678" className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">{t("label_payer_phone")}</label>
          <input type="tel" inputMode="tel" value={payerPhone} onChange={(e) => setPayerPhone(e.target.value)} placeholder="+1 416 555 0123" className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-sm" />
        </div>

        {/* Submit */}
        <button
          onClick={generateLink}
          disabled={submitting || !formReady || breakdownLoading}
          className="w-full bg-emerald-500 hover:bg-emerald-400 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-white py-4 rounded-2xl font-semibold text-lg mt-2"
        >
          {submitting ? `${t("generate_button")}…` : t("pricing_card1_cta")}
        </button>

        <p className="text-center text-xs text-slate-600 pb-2">
          🔒 {t("feat3_title")} · No Stripe · No data stored
        </p>

      </div>
    </main>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, Copy, Check, Download } from "lucide-react";
import { useRouter } from "next/navigation";

type Step = "form" | "generating" | "share" | "checkout" | "done" | "error";

interface CheckoutData {
  partnerOrderId: string;
  widget: {
    swapAmount: string;
    swapAsset: string;
    userAddress: string;
    partnerOrderId: string;
    finalUrl: string;
  };
  estimate: {
    recipient_gets_mxn: number;
    usdc_total: number;
    omnipay_fee_usdc: number;
    rate_mxn_per_usdc: number;
  };
}

export default function P2PPage() {
  const t      = useTranslations("p2p");
  const router = useRouter();

  const [step,           setStep]          = useState<Step>("form");
  const [nombre,         setNombre]        = useState("");
  const [clabe,          setClabe]         = useState("");
  const [amountMxn,      setAmountMxn]     = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [payerPhone,     setPayerPhone]    = useState("");
  const [checkout,       setCheckout]      = useState<CheckoutData | null>(null);
  const [shareLink,      setShareLink]     = useState("");
  const [copied,         setCopied]        = useState(false);
  const [errorMsg,       setErrorMsg]      = useState("");
  const [submitting,     setSubmitting]    = useState(false);

  // Detectar si vienen con token de checkout (?pid=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pid    = params.get("pid");
    const amt    = params.get("amt");
    const name   = params.get("n");
    if (pid && amt && name) {
      setCheckout({
        partnerOrderId: pid,
        widget: { swapAmount: amt, swapAsset: "USDC_POLYGON", userAddress: "", partnerOrderId: pid, finalUrl: "" },
        estimate: { recipient_gets_mxn: parseFloat(amt), usdc_total: 0, omnipay_fee_usdc: 0, rate_mxn_per_usdc: 0 },
      });
      setNombre(decodeURIComponent(name));
      setStep("checkout");
    }
  }, []);

  const generateLink = useCallback(async () => {
    if (!nombre.trim() || !/^\d{18}$/.test(clabe) || !amountMxn || parseFloat(amountMxn) < 100) return;
    setSubmitting(true);
    setStep("generating");
    try {
      const res  = await fetch("/api/v1/p2p/checkout", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          nombre:     nombre.trim(),
          clabe,
          amount_mxn: parseFloat(amountMxn),
          recipient_phone: recipientPhone || undefined,
          payer_phone:     payerPhone     || undefined,
        }),
      });
      const data = await res.json() as CheckoutData & { error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "Error");

      setCheckout(data);
      const appUrl = window.location.origin;
      const link   = `${appUrl}/p2p?pid=${encodeURIComponent(data.partnerOrderId)}&amt=${data.estimate.usdc_total.toFixed(2)}&n=${encodeURIComponent(nombre.trim())}`;
      setShareLink(link);
      setStep("share");
    } catch (err) {
      const e = err as Error;
      setErrorMsg(e.message.includes("503") || e.message.toLowerCase().includes("configured")
        ? t("error_unavailable") : e.message);
      setStep("error");
    } finally {
      setSubmitting(false);
    }
  }, [nombre, clabe, amountMxn, recipientPhone, payerPhone, t]);

  const copyLink = useCallback(async () => {
    await navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [shareLink]);

  const openWhatsApp = useCallback((msg?: string) => {
    const text = msg ?? t("share_message", { name: nombre, amount: parseFloat(amountMxn).toLocaleString(), link: shareLink });
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  }, [nombre, amountMxn, shareLink, t]);

  const openTelegram = useCallback((msg?: string) => {
    const text = msg ?? t("share_message", { name: nombre, amount: parseFloat(amountMxn).toLocaleString(), link: shareLink });
    window.open(`https://t.me/share/url?url=${encodeURIComponent(shareLink)}&text=${encodeURIComponent(text)}`, "_blank");
  }, [nombre, amountMxn, shareLink, t]);

  const scrollToForm = () => {
    document.getElementById("p2p-form")?.scrollIntoView({ behavior: "smooth" });
  };

  // ── Loading ────────────────────────────────────────────────────────────────
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

  // ── Share ──────────────────────────────────────────────────────────────────
  if (step === "share" && checkout) {
    return (
      <main className="min-h-screen bg-[#0f172a] flex flex-col px-5 pt-12 pb-10 max-w-sm mx-auto w-full">
        <button
          onClick={() => setStep("form")}
          className="flex items-center gap-1 text-slate-400 text-sm mb-8 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> {t("new_transfer")}
        </button>

        <div className="flex-1 flex flex-col items-center justify-center gap-5 text-center">
          <div className="text-5xl">🔗</div>
          <div>
            <h2 className="text-white font-bold text-xl mb-1">{t("share_title")}</h2>
            <p className="text-slate-400 text-sm">{t("share_hint")}</p>
          </div>

          {/* Resumen */}
          <div className="w-full bg-slate-800/60 border border-slate-700 rounded-2xl p-4 text-center">
            <p className="text-slate-400 text-xs mb-1">{nombre}</p>
            <p className="text-white font-bold text-2xl">${parseFloat(amountMxn).toLocaleString()} MXN</p>
            <p className="text-slate-500 text-xs mt-1">~${checkout.estimate.usdc_total.toFixed(2)} USD (incl. fee)</p>
          </div>

          <div className="w-full space-y-3">
            <button
              onClick={() => openWhatsApp()}
              className="w-full bg-[#25D366] hover:bg-[#20ba59] text-white font-semibold py-3 rounded-xl text-sm flex items-center justify-center gap-2 transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              {t("share_whatsapp")}
            </button>
            <button
              onClick={() => openTelegram()}
              className="w-full bg-[#229ED9] hover:bg-[#1a8bc2] text-white font-semibold py-3 rounded-xl text-sm flex items-center justify-center gap-2 transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
              {t("done_share_telegram")}
            </button>
            <button
              onClick={copyLink}
              className="w-full border border-slate-600 text-slate-300 hover:border-slate-400 py-3 rounded-xl text-sm flex items-center justify-center gap-2 transition-colors"
            >
              {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
              {copied ? "✓ Copiado" : t("share_copy")}
            </button>
          </div>

          <button
            onClick={() => { setStep("form"); setNombre(""); setClabe(""); setAmountMxn(""); setRecipientPhone(""); setPayerPhone(""); }}
            className="text-slate-500 hover:text-slate-300 text-xs transition-colors"
          >
            + {t("new_transfer")}
          </button>
        </div>
      </main>
    );
  }

  // ── Checkout (el familiar abre el link) ────────────────────────────────────
  if (step === "checkout" && checkout) {
    return (
      <main className="min-h-screen bg-[#0f172a] flex flex-col px-5 pt-12 pb-10 max-w-sm mx-auto w-full">
        <button onClick={() => router.push("/")} className="flex items-center gap-1 text-slate-400 text-sm mb-8 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" /> OmniPay
        </button>

        <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-6 space-y-5">
          <div className="text-center">
            <p className="text-slate-400 text-sm">{t("checkout_title", { name: nombre })}</p>
            <p className="text-white font-bold text-3xl mt-1">${checkout.estimate.recipient_gets_mxn.toLocaleString()} MXN</p>
          </div>

          <div className="bg-[#0f172a] rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">{t("checkout_subtitle")}</span>
              <span className="text-emerald-400 font-bold">~${checkout.widget.swapAmount} USD</span>
            </div>
            {checkout.estimate.rate_mxn_per_usdc > 0 && (
              <p className="text-xs text-slate-500">{t("checkout_rate", { rate: checkout.estimate.rate_mxn_per_usdc.toFixed(2) })}</p>
            )}
            <p className="text-xs text-slate-500">{t("checkout_fee")}</p>
          </div>

          {/* Widget placeholder */}
          <div className="bg-[#0f172a] border border-emerald-500/30 rounded-xl p-6 text-center space-y-3">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-slate-400 text-sm">{t("widget_loading")}</p>
            <p className="text-xs text-slate-600">Ramp Network / Transak</p>
          </div>

          <p className="text-center text-xs text-slate-600">Powered by Ramp + Bitso · No Stripe · No data stored</p>
        </div>
      </main>
    );
  }

  // ── Done ───────────────────────────────────────────────────────────────────
  if (step === "done") {
    return (
      <main className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center px-5 gap-5 text-center">
        <div className="text-5xl">✅</div>
        <h2 className="text-white font-bold text-xl">{t("done_title")}</h2>
        <p className="text-slate-400 text-sm max-w-xs">
          {t("done_message", { name: nombre, amount: parseFloat(amountMxn).toLocaleString() })}
        </p>
        <div className="w-full max-w-xs space-y-3">
          <button onClick={() => openWhatsApp()} className="w-full bg-[#25D366] text-white py-3 rounded-xl text-sm font-semibold">{t("done_share_whatsapp")}</button>
          <button onClick={() => openTelegram()} className="w-full bg-[#229ED9] text-white py-3 rounded-xl text-sm font-semibold">{t("done_share_telegram")}</button>
          <button onClick={() => window.print()} className="w-full border border-slate-600 text-slate-300 py-3 rounded-xl text-sm flex items-center justify-center gap-2">
            <Download size={16} /> {t("done_download")}
          </button>
        </div>
        <button onClick={() => { setStep("form"); setNombre(""); setClabe(""); setAmountMxn(""); }} className="text-slate-500 hover:text-slate-300 text-xs transition-colors">
          + {t("new_transfer")}
        </button>
      </main>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (step === "error") {
    return (
      <main className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center px-6 text-center gap-5">
        <div className="text-5xl">⚠️</div>
        <p className="text-slate-300 text-sm max-w-xs">{errorMsg}</p>
        <button onClick={() => setStep("form")} className="text-emerald-400 text-sm underline">← {t("new_transfer")}</button>
      </main>
    );
  }

  // ── FORM (default) — misma estructura que B2B ──────────────────────────────
  return (
    <main className="min-h-screen bg-[#0f172a] flex flex-col pb-10 w-full">

      {/* Back button */}
      <div className="max-w-2xl mx-auto w-full px-6 pt-6">
        <button onClick={() => router.push("/")} className="flex items-center gap-2 text-slate-400 hover:text-white text-sm transition-colors">
          ← OmniPay Global
        </button>
      </div>

      {/* ── P2P HEADER ────────────────────────────────────────────────────── */}
      <section className="w-full max-w-2xl mx-auto px-6 pt-8 pb-4 text-center">
        <div className="text-4xl mb-3">🌍</div>
        <h1 className="text-white font-bold text-2xl mb-1">{t("page_title")}</h1>
        <p className="text-slate-400 text-sm mb-2">{t("feat1_title")}</p>
        <span className="text-[10px] text-slate-500 bg-slate-800 rounded-lg px-3 py-1.5 inline-block">
          Powered by Ramp + Bitso · No Stripe
        </span>
      </section>

      {/* ── FEATURES ──────────────────────────────────────────────────────── */}
      <section className="w-full max-w-2xl mx-auto px-6 py-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-800/50 rounded-2xl p-5 border border-slate-700/50">
          <div className="text-2xl mb-3">🌍</div>
          <h3 className="text-white font-semibold text-sm mb-2">{t("feat1_title")}</h3>
          <p className="text-slate-400 text-xs leading-relaxed">{t("feat1_body")}</p>
        </div>
        <div className="bg-slate-800/50 rounded-2xl p-5 border border-slate-700/50">
          <div className="text-2xl mb-3">💱</div>
          <h3 className="text-white font-semibold text-sm mb-2">{t("feat2_title")}</h3>
          <p className="text-slate-400 text-xs leading-relaxed">{t("feat2_body")}</p>
        </div>
        <div className="bg-slate-800/50 rounded-2xl p-5 border border-slate-700/50">
          <div className="text-2xl mb-3">⚡</div>
          <h3 className="text-white font-semibold text-sm mb-2">{t("feat3_title")}</h3>
          <p className="text-slate-400 text-xs leading-relaxed">{t("feat3_body")}</p>
        </div>
      </section>

      {/* ── PRICING — 2 cards, misma estructura que B2B ───────────────────── */}
      <section className="w-full max-w-2xl mx-auto px-6 pb-10">
        <h2 className="text-white font-bold text-xl text-center mb-2">{t("pricing_title")}</h2>
        <p className="text-slate-500 text-xs text-center mb-8">{t("pricing_sub")}</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

          {/* Card 1 — OmniPay P2P fee */}
          <div className="bg-slate-800/60 border border-emerald-500/40 rounded-2xl p-6 flex flex-col gap-4">
            <div>
              <span className="text-xs text-slate-400 uppercase tracking-widest font-semibold">{t("pricing_card1_label")}</span>
              <p className="text-emerald-400 text-4xl font-extrabold mt-1">~2%</p>
              <p className="text-slate-400 text-xs mt-1">{t("pricing_card1_fee")}</p>
            </div>
            <ul className="text-slate-400 text-xs space-y-1">
              <li>{t("pricing_card1_li1")}</li>
              <li>{t("pricing_card1_li2")}</li>
              <li>{t("pricing_card1_li3")}</li>
              <li>{t("pricing_card1_li4")}</li>
            </ul>
            <button
              onClick={scrollToForm}
              className="mt-auto w-full bg-emerald-500 hover:bg-emerald-400 active:scale-95 transition-all text-white font-semibold py-3 rounded-xl text-sm"
            >
              {t("pricing_card1_cta")}
            </button>
          </div>

          {/* Card 2 — Comparación vs competencia */}
          <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-6 flex flex-col gap-4 relative">
            <span className="absolute top-4 right-4 bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">60% OFF</span>
            <div>
              <span className="text-xs text-slate-400 uppercase tracking-widest font-semibold">{t("pricing_card2_label")}</span>
              <p className="text-slate-200 text-4xl font-extrabold mt-1">vs.</p>
              <p className="text-slate-400 text-xs mt-1">{t("pricing_card2_fee")}</p>
            </div>
            <ul className="text-xs space-y-1">
              <li className="text-emerald-400 font-semibold">{t("pricing_card2_li1")}</li>
              <li className="text-red-400">{t("pricing_card2_li2")}</li>
              <li className="text-red-400">{t("pricing_card2_li3")}</li>
              <li className="text-red-400">{t("pricing_card2_li4")}</li>
            </ul>
            <button
              onClick={scrollToForm}
              className="mt-auto w-full border border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10 active:scale-95 transition-all font-semibold py-3 rounded-xl text-sm"
            >
              {t("pricing_card1_cta")}
            </button>
          </div>

        </div>
      </section>

      {/* ── FORM ──────────────────────────────────────────────────────────── */}
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

        {/* CLABE */}
        <div>
          <label className="block text-xs text-slate-400 mb-1">{t("clabe_label")}</label>
          <input
            type="text"
            inputMode="numeric"
            value={clabe}
            onChange={(e) => setClabe(e.target.value.replace(/\D/g, "").slice(0, 18))}
            placeholder={t("clabe_placeholder")}
            className={`w-full bg-slate-800 border rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none text-sm font-mono transition-colors ${
              clabe.length > 0 && clabe.length !== 18 ? "border-red-500" : "border-slate-700 focus:border-emerald-500"
            }`}
          />
          {clabe.length > 0 && clabe.length !== 18 && (
            <p className="text-xs text-red-400 mt-1">{t("error_invalid_clabe")}</p>
          )}
          {clabe.length === 18 && (
            <p className="text-xs text-slate-500 mt-1">18 dígitos — encuéntrala en tu app bancaria</p>
          )}
        </div>

        {/* Amount */}
        <div>
          <label className="block text-xs text-slate-400 mb-1">{t("amount_label")}</label>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">MXN</span>
              <input
                type="number"
                inputMode="numeric"
                value={amountMxn}
                onChange={(e) => setAmountMxn(e.target.value)}
                placeholder={t("amount_placeholder")}
                min="100"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-14 pr-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-sm"
              />
            </div>
            <div className="w-20 bg-slate-800 border border-slate-700 rounded-xl px-3 py-3 text-slate-400 text-sm flex items-center justify-center">
              MXN
            </div>
          </div>
          {amountMxn && parseFloat(amountMxn) < 100 && (
            <p className="text-xs text-red-400 mt-1">{t("error_min_amount")}</p>
          )}
        </div>

        {/* Recipient phone */}
        <div>
          <label className="block text-xs text-slate-400 mb-1">{t("label_recipient_phone")}</label>
          <input
            type="tel"
            inputMode="tel"
            value={recipientPhone}
            onChange={(e) => setRecipientPhone(e.target.value)}
            placeholder="+52 55 1234 5678"
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-sm"
          />
        </div>

        {/* Payer phone */}
        <div>
          <label className="block text-xs text-slate-400 mb-1">{t("label_payer_phone")}</label>
          <input
            type="tel"
            inputMode="tel"
            value={payerPhone}
            onChange={(e) => setPayerPhone(e.target.value)}
            placeholder="+1 416 555 0123"
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-sm"
          />
        </div>

        {/* Submit */}
        <button
          onClick={generateLink}
          disabled={submitting || !nombre.trim() || clabe.length !== 18 || !amountMxn || parseFloat(amountMxn) < 100}
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

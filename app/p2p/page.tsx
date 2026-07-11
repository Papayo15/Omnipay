"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, Copy, Check, Download } from "lucide-react";
import { useRouter } from "next/navigation";

type Step = "form" | "quote" | "generating" | "share" | "checkout" | "done" | "error";

interface Quote {
  amount_mxn: number;
  rate_mxn_per_usdc: number;
  usdc_needed: number;
  omnipay_fee_usdc: number;
  sender_pays_usd: number;
}

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

  const [step,         setStep]         = useState<Step>("form");
  const [nombre,       setNombre]       = useState("");
  const [clabe,        setClabe]        = useState("");
  const [amountMxn,    setAmountMxn]    = useState("");
  const [quote,        setQuote]        = useState<Quote | null>(null);
  const [checkout,     setCheckout]     = useState<CheckoutData | null>(null);
  const [shareLink,    setShareLink]    = useState("");
  const [copied,       setCopied]       = useState(false);
  const [errorMsg,     setErrorMsg]     = useState("");
  const [quoteLoading, setQuoteLoading] = useState(false);

  // Detectar si vienen con token de checkout (?t=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pid    = params.get("pid");
    const amt    = params.get("amt");
    const name   = params.get("n");
    if (pid && amt && name) {
      // Viene del link compartido — mostrar checkout simulado hasta widget
      setCheckout({
        partnerOrderId: pid,
        widget: { swapAmount: amt, swapAsset: "USDC_POLYGON", userAddress: "", partnerOrderId: pid, finalUrl: "" },
        estimate: { recipient_gets_mxn: parseFloat(amt), usdc_total: 0, omnipay_fee_usdc: 0, rate_mxn_per_usdc: 0 },
      });
      setNombre(decodeURIComponent(name));
      setStep("checkout");
    }
  }, []);

  const getQuote = useCallback(async () => {
    const mxn = parseFloat(amountMxn);
    if (!mxn || mxn < 100) return;
    setQuoteLoading(true);
    try {
      const res  = await fetch(`/api/v1/p2p/rate?amount_mxn=${mxn}`);
      const data = await res.json() as Quote & { error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "Error");
      setQuote(data);
      setStep("quote");
    } catch {
      setErrorMsg(t("error_unavailable"));
      setStep("error");
    } finally {
      setQuoteLoading(false);
    }
  }, [amountMxn, t]);

  const generateLink = useCallback(async () => {
    if (!nombre.trim() || !/^\d{18}$/.test(clabe) || !amountMxn) return;
    setStep("generating");
    try {
      const res  = await fetch("/api/v1/p2p/checkout", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ nombre: nombre.trim(), clabe, amount_mxn: parseFloat(amountMxn) }),
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
      if (e.message.includes("503") || e.message.toLowerCase().includes("configured")) {
        setErrorMsg(t("error_unavailable"));
      } else {
        setErrorMsg(e.message);
      }
      setStep("error");
    }
  }, [nombre, clabe, amountMxn, t]);

  const copyLink = useCallback(async () => {
    await navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [shareLink]);

  const openWhatsApp = useCallback(() => {
    const msg = t("share_message", { name: nombre, amount: parseFloat(amountMxn).toLocaleString(), link: shareLink });
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  }, [nombre, amountMxn, shareLink, t]);

  const openTelegram = useCallback(() => {
    const msg = t("share_message", { name: nombre, amount: parseFloat(amountMxn).toLocaleString(), link: shareLink });
    window.open(`https://t.me/share/url?url=${encodeURIComponent(shareLink)}&text=${encodeURIComponent(msg)}`, "_blank");
  }, [nombre, amountMxn, shareLink, t]);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#0f172a] to-[#1e293b] flex flex-col items-center justify-start px-4 py-8">

      {/* Header */}
      <div className="w-full max-w-md mb-6 flex items-center gap-3">
        <button
          onClick={() => router.push("/")}
          className="text-slate-400 hover:text-white transition-colors p-1"
          aria-label="Volver"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-lg font-bold text-white">{t("page_title")}</h1>
          <p className="text-xs text-emerald-400 font-medium">Powered by Ramp + Bitso</p>
        </div>
      </div>

      {/* ── P2P FEATURES — visible solo en el formulario ───────────────────────── */}
      {step === "form" && (
        <div className="w-full max-w-2xl mb-8 space-y-6">

          {/* Feature cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 px-0">
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
          </div>

          {/* Pricing card */}
          <div className="bg-slate-800/60 border border-emerald-500/30 rounded-2xl p-6">
            <h2 className="text-white font-bold text-base mb-1">{t("pricing_title")}</h2>
            <p className="text-slate-400 text-xs mb-4">{t("pricing_sub")}</p>
            <div className="bg-emerald-900/20 border border-emerald-700/30 rounded-xl px-4 py-3 mb-3">
              <p className="text-emerald-300 text-sm font-mono font-semibold">{t("pricing_formula")}</p>
            </div>
            <p className="text-slate-500 text-xs">{t("pricing_example")}</p>
          </div>

        </div>
      )}

      <div className="w-full max-w-md">

        {/* ── STEP: FORM ──────────────────────────────────────────────────── */}
        {step === "form" && (
          <div className="bg-[#1e293b] rounded-2xl p-6 space-y-5 border border-slate-700">
            <h2 className="text-slate-200 font-semibold text-sm">{t("step_form")}</h2>

            {/* Nombre */}
            <div>
              <label className="block text-xs text-slate-400 mb-1">{t("name_label")}</label>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder={t("name_placeholder")}
                className="w-full bg-[#0f172a] border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
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
                className={`w-full bg-[#0f172a] border rounded-xl px-4 py-3 text-white placeholder-slate-500 text-sm font-mono focus:outline-none transition-colors ${
                  clabe.length > 0 && clabe.length !== 18 ? "border-red-500" : "border-slate-600 focus:border-emerald-500"
                }`}
              />
              {clabe.length > 0 && clabe.length !== 18 && (
                <p className="text-xs text-red-400 mt-1">{t("error_invalid_clabe")}</p>
              )}
            </div>

            {/* Monto */}
            <div>
              <label className="block text-xs text-slate-400 mb-1">{t("amount_label")}</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">MXN</span>
                <input
                  type="number"
                  inputMode="numeric"
                  value={amountMxn}
                  onChange={(e) => setAmountMxn(e.target.value)}
                  placeholder={t("amount_placeholder")}
                  min="100"
                  className="w-full bg-[#0f172a] border border-slate-600 rounded-xl pl-14 pr-4 py-3 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>
              {amountMxn && parseFloat(amountMxn) < 100 && (
                <p className="text-xs text-red-400 mt-1">{t("error_min_amount")}</p>
              )}
            </div>

            <button
              onClick={getQuote}
              disabled={quoteLoading || !nombre.trim() || clabe.length !== 18 || !amountMxn || parseFloat(amountMxn) < 100}
              className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors text-sm"
            >
              {quoteLoading ? t("quote_loading") : t("quote_button")}
            </button>
          </div>
        )}

        {/* ── STEP: QUOTE ─────────────────────────────────────────────────── */}
        {step === "quote" && quote && (
          <div className="bg-[#1e293b] rounded-2xl p-6 space-y-5 border border-slate-700">
            <h2 className="text-slate-200 font-semibold text-sm">{t("quote_title")}</h2>

            <div className="bg-[#0f172a] rounded-xl p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-sm">{t("quote_recipient_gets")}</span>
                <span className="text-white font-bold text-lg">
                  ${parseFloat(amountMxn).toLocaleString()} MXN
                </span>
              </div>
              <div className="border-t border-slate-700" />
              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-sm">{t("quote_sender_pays")}</span>
                <span className="text-emerald-400 font-bold text-lg">
                  ~${quote.sender_pays_usd.toFixed(2)} USD
                </span>
              </div>
              <div className="border-t border-slate-700" />
              <div className="flex justify-between text-xs text-slate-500">
                <span>{t("quote_rate")}</span>
                <span>1 USD ≈ {quote.rate_mxn_per_usdc.toFixed(2)} MXN</span>
              </div>
              <div className="flex justify-between text-xs text-slate-500">
                <span>{t("quote_fee")}</span>
                <span>${quote.omnipay_fee_usdc.toFixed(2)} USD</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep("form")}
                className="flex-1 border border-slate-600 text-slate-300 py-3 rounded-xl text-sm hover:border-slate-400 transition-colors"
              >
                ← Atrás
              </button>
              <button
                onClick={generateLink}
                className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-white font-semibold py-3 rounded-xl text-sm transition-colors"
              >
                {t("generate_button")}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP: GENERATING ────────────────────────────────────────────── */}
        {step === "generating" && (
          <div className="text-center py-16 space-y-4">
            <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-slate-400 text-sm">{t("generate_button")}…</p>
          </div>
        )}

        {/* ── STEP: SHARE ─────────────────────────────────────────────────── */}
        {step === "share" && checkout && (
          <div className="bg-[#1e293b] rounded-2xl p-6 space-y-5 border border-slate-700">
            <div className="text-center">
              <div className="text-4xl mb-2">🔗</div>
              <h2 className="text-white font-bold text-lg">{t("share_title")}</h2>
              <p className="text-slate-400 text-sm mt-1">{t("share_hint")}</p>
            </div>

            {/* Resumen */}
            <div className="bg-[#0f172a] rounded-xl p-4 text-center">
              <p className="text-slate-400 text-xs mb-1">{nombre}</p>
              <p className="text-white font-bold text-2xl">
                ${parseFloat(amountMxn).toLocaleString()} MXN
              </p>
              <p className="text-slate-500 text-xs mt-1">
                ~${checkout.estimate.usdc_total.toFixed(2)} USD total (incl. fee)
              </p>
            </div>

            {/* Botones de compartir */}
            <button
              onClick={openWhatsApp}
              className="w-full bg-[#25D366] hover:bg-[#20ba59] text-white font-semibold py-3 rounded-xl text-sm flex items-center justify-center gap-2 transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              {t("share_whatsapp")}
            </button>

            <button
              onClick={openTelegram}
              className="w-full bg-[#229ED9] hover:bg-[#1a8bc2] text-white font-semibold py-3 rounded-xl text-sm flex items-center justify-center gap-2 transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
              {t("share_telegram") ?? "Compartir por Telegram"}
            </button>

            <button
              onClick={copyLink}
              className="w-full border border-slate-600 text-slate-300 hover:border-slate-400 py-3 rounded-xl text-sm flex items-center justify-center gap-2 transition-colors"
            >
              {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
              {copied ? "¡Copiado!" : t("share_copy")}
            </button>

            <button
              onClick={() => { setStep("form"); setNombre(""); setClabe(""); setAmountMxn(""); setQuote(null); }}
              className="w-full text-slate-500 hover:text-slate-300 text-xs py-2 transition-colors"
            >
              {t("new_transfer")}
            </button>
          </div>
        )}

        {/* ── STEP: CHECKOUT (el familiar abre el link) ───────────────────── */}
        {step === "checkout" && checkout && (
          <div className="bg-[#1e293b] rounded-2xl p-6 space-y-5 border border-slate-700">
            <div className="text-center">
              <p className="text-slate-400 text-sm">{t("checkout_title", { name: nombre })}</p>
              <p className="text-white font-bold text-3xl mt-1">
                ${checkout.estimate.recipient_gets_mxn.toLocaleString()} MXN
              </p>
            </div>

            <div className="bg-[#0f172a] rounded-xl p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">{t("checkout_subtitle")}</span>
                <span className="text-emerald-400 font-bold">~${checkout.widget.swapAmount} USD</span>
              </div>
              {checkout.estimate.rate_mxn_per_usdc > 0 && (
                <p className="text-xs text-slate-500">
                  {t("checkout_rate", { rate: checkout.estimate.rate_mxn_per_usdc.toFixed(2) })}
                </p>
              )}
              <p className="text-xs text-slate-500">{t("checkout_fee")}</p>
            </div>

            {/* Widget placeholder — en producción: Ramp / Transak iframe */}
            <div className="bg-[#0f172a] border border-emerald-500/30 rounded-xl p-6 text-center space-y-3">
              <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-slate-400 text-sm">{t("widget_loading")}</p>
              <p className="text-xs text-slate-600">Ramp Network / Transak</p>
              {/* En producción, aquí va el script del widget:
                  <script src="https://widget.ramp.network/..."></script>
                  o <iframe src="https://app.transak.com/..."></iframe>
                  usando checkout.widget.* como parámetros */}
            </div>

            <div className="text-center">
              <p className="text-xs text-slate-600">
                Powered by Ramp + Bitso · No Stripe · No data stored
              </p>
            </div>
          </div>
        )}

        {/* ── STEP: DONE ──────────────────────────────────────────────────── */}
        {step === "done" && (
          <div className="bg-[#1e293b] rounded-2xl p-6 space-y-5 border border-slate-700 text-center">
            <div className="text-5xl">✅</div>
            <h2 className="text-white font-bold text-xl">{t("done_title")}</h2>
            <p className="text-slate-400 text-sm">
              {t("done_message", { name: nombre, amount: parseFloat(amountMxn).toLocaleString() })}
            </p>

            <div className="flex flex-col gap-3">
              <button
                onClick={openWhatsApp}
                className="w-full bg-[#25D366] text-white py-3 rounded-xl text-sm font-semibold"
              >
                {t("done_share_whatsapp")}
              </button>
              <button
                onClick={openTelegram}
                className="w-full bg-[#229ED9] text-white py-3 rounded-xl text-sm font-semibold"
              >
                {t("done_share_telegram")}
              </button>
              <button
                onClick={() => window.print()}
                className="w-full border border-slate-600 text-slate-300 py-3 rounded-xl text-sm flex items-center justify-center gap-2"
              >
                <Download size={16} />
                {t("done_download")}
              </button>
            </div>

            <button
              onClick={() => { setStep("form"); setNombre(""); setClabe(""); setAmountMxn(""); }}
              className="text-slate-500 hover:text-slate-300 text-xs transition-colors"
            >
              {t("new_transfer")}
            </button>
          </div>
        )}

        {/* ── STEP: ERROR ─────────────────────────────────────────────────── */}
        {step === "error" && (
          <div className="bg-[#1e293b] rounded-2xl p-6 space-y-4 border border-red-500/30 text-center">
            <div className="text-4xl">⚠️</div>
            <p className="text-slate-300 text-sm">{errorMsg}</p>
            <button
              onClick={() => setStep("form")}
              className="w-full border border-slate-600 text-slate-300 py-3 rounded-xl text-sm hover:border-slate-400 transition-colors"
            >
              ← Reintentar
            </button>
          </div>
        )}

      </div>
    </main>
  );
}

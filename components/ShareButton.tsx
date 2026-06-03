"use client";

import { useState } from "react";
import { Share2, Copy, Check, MessageCircle, Send, Phone, Mail } from "lucide-react";
import { motion } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import { useTranslations } from "next-intl";

interface Props {
  url: string;
  amount: string;
  transactionType?: "remesa" | "terminal" | null;
}

export default function ShareButton({ url, amount, transactionType }: Props) {
  const t = useTranslations("share");
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  const isTerminal = transactionType === "terminal";
  const shareTitle = isTerminal ? t("title_terminal") : t("title_generic");
  const shareText = isTerminal
    ? t("text_terminal", { amount })
    : t("text_generic", { amount });
  const waText = isTerminal
    ? t("wa_terminal", { amount, url })
    : t("wa_generic", { amount, url });
  const mainButtonLabel = isTerminal
    ? (canShare ? t("btn_show_client") : t("btn_copy"))
    : (canShare ? t("btn_send_whatsapp") : t("btn_copy"));
  const waButtonLabel = isTerminal ? t("btn_wa_send") : t("btn_wa_open");
  const qrLabel = isTerminal ? t("qr_merchant") : t("qr_generic");

  async function handleShare() {
    if (canShare) {
      try {
        await navigator.share({ title: shareTitle, text: shareText, url });
      } catch {
        // user cancelled
      }
    } else {
      handleCopy();
    }
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Explain what the link does — so the recipient knows what to expect */}
      <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 text-sm">
        <p className="text-slate-300 font-semibold mb-1">
          {isTerminal ? "¿Para qué es este enlace?" : "¿Qué recibirá tu familiar?"}
        </p>
        <p className="text-slate-400">
          {isTerminal
            ? `Al abrirlo, el pagador verá un formulario seguro de ${amount} para pagar con cualquier tarjeta o OXXO. No necesita instalar nada. El dinero llega directo a tu cuenta.`
            : `Tu familiar verá el comprobante del envío de ${amount} y recibirá el dinero en su cuenta bancaria local. Sin apps, sin registro.`
          }
        </p>
        <p className="text-slate-600 text-xs mt-2">⏱ Este enlace expira en 5 minutos y es de un solo uso.</p>
      </div>

      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={handleShare}
        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-lg py-5 rounded-2xl flex items-center justify-center gap-3 shadow-xl shadow-emerald-900/50 touch-manipulation transition-colors"
      >
        {canShare ? <Share2 className="w-6 h-6" /> : <Copy className="w-6 h-6" />}
        {mainButtonLabel}
      </motion.button>

      {/* Direct channel buttons — always visible for cross-platform coverage */}
      <div className="grid grid-cols-2 gap-2">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(waText)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 bg-[#25D366] text-white font-semibold py-3 rounded-xl touch-manipulation active:scale-95 transition-transform text-sm"
        >
          <MessageCircle className="w-4 h-4" />
          WhatsApp
        </a>
        <a
          href={`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(shareText)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 bg-[#2AABEE] text-white font-semibold py-3 rounded-xl touch-manipulation active:scale-95 transition-transform text-sm"
        >
          <Send className="w-4 h-4" />
          Telegram
        </a>
        <a
          href={`sms:?&body=${encodeURIComponent(`${shareText} ${url}`)}`}
          className="flex items-center justify-center gap-2 bg-slate-700 text-white font-semibold py-3 rounded-xl touch-manipulation active:scale-95 transition-transform text-sm"
        >
          <Phone className="w-4 h-4" />
          {t("btn_sms")}
        </a>
        <a
          href={`mailto:?subject=${encodeURIComponent(shareTitle)}&body=${encodeURIComponent(`${shareText}\n\n${url}`)}`}
          className="flex items-center justify-center gap-2 bg-slate-700 text-white font-semibold py-3 rounded-xl touch-manipulation active:scale-95 transition-transform text-sm"
        >
          <Mail className="w-4 h-4" />
          {t("btn_email")}
        </a>
      </div>

      <button
        onClick={handleCopy}
        className="w-full border border-slate-700 text-slate-300 font-medium py-3 rounded-2xl flex items-center justify-center gap-2 touch-manipulation hover:bg-slate-800/50 transition-colors"
      >
        {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
        <span className={copied ? "text-emerald-400" : ""}>
          {copied ? t("btn_copied") : t("btn_copy_link")}
        </span>
      </button>

      <div className="flex flex-col items-center gap-3 mt-2">
        <p className="text-slate-500 text-xs">{qrLabel}</p>
        <div className="bg-white p-3 rounded-2xl">
          <QRCodeSVG value={url} size={isTerminal ? 200 : 160} level="M" />
        </div>
      </div>
    </div>
  );
}

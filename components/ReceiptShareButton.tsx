"use client";

import { useState } from "react";
import { Share2, Copy, Check, MessageCircle, Send, Phone, Mail } from "lucide-react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";

interface Props {
  auditUrl: string;
  amount: string; // formatted string e.g. "$100.00 MXN"
}

export default function ReceiptShareButton({ auditUrl, amount }: Props) {
  const t = useTranslations("share");
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  const title = t("receipt_title");
  const text = t("receipt_text", { amount });

  async function handleShare() {
    if (canShare) {
      try {
        await navigator.share({ title, text, url: auditUrl });
      } catch { /* cancelled */ }
    } else {
      handleCopy();
    }
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(auditUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-slate-400 text-sm text-center">{t("receipt_share_title")}</p>

      {canShare && (
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleShare}
          className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-3 touch-manipulation transition-colors"
        >
          <Share2 className="w-5 h-5" />
          {t("btn_show_client")}
        </motion.button>
      )}

      <div className="grid grid-cols-2 gap-2">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(`${text} ${auditUrl}`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 bg-[#25D366] text-white font-semibold py-3 rounded-xl touch-manipulation active:scale-95 transition-transform text-sm"
        >
          <MessageCircle className="w-4 h-4" />
          WhatsApp
        </a>
        <a
          href={`https://t.me/share/url?url=${encodeURIComponent(auditUrl)}&text=${encodeURIComponent(text)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 bg-[#2AABEE] text-white font-semibold py-3 rounded-xl touch-manipulation active:scale-95 transition-transform text-sm"
        >
          <Send className="w-4 h-4" />
          Telegram
        </a>
        <a
          href={`sms:?&body=${encodeURIComponent(`${text} ${auditUrl}`)}`}
          className="flex items-center justify-center gap-2 bg-slate-700 text-white font-semibold py-3 rounded-xl touch-manipulation active:scale-95 transition-transform text-sm"
        >
          <Phone className="w-4 h-4" />
          {t("btn_sms")}
        </a>
        <a
          href={`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`${text}\n\n${auditUrl}`)}`}
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
    </div>
  );
}

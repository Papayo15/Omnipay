"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import ProcessingMessages from "@/components/ProcessingMessages";
import { buildReceiptURL, type ReceiptPayload } from "@/lib/payload";
import { AIRWALLEX_COUNTRIES, FLUTTERWAVE_COUNTRIES, STABLECOIN_COUNTRIES } from "@/constants/rails";
import { usePaymentStore } from "@/lib/store/paymentStore";

export default function ProcesandoPage() {
  const router = useRouter();
  const t = useTranslations("procesando");
  const {
    decodedPayload,
    amount, currency, rail, accountId,
    transactionType, recipientPhone, receiverName, recipientName,
    bankName, country, sourceCurrency, senderAmount, sourceCountry,
    setTxStatus, setTxId, setTxReference, setError,
  } = usePaymentStore();
  const called = useRef(false);

  useEffect(() => {
    if (called.current) return;
    called.current = true;
    executePayment();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function makeAuditUrl(opts: {
    txId: string; amt: number; cur: string; bName: string;
    cn: string; tt: string; rl: string; sa?: number; sc?: string;
  }): Promise<string> {
    try {
      const receipt: ReceiptPayload = {
        id: opts.txId, a: opts.amt, c: opts.cur,
        nb: opts.bName, cn: opts.cn, ts: Date.now(),
        tt: opts.tt, r: opts.rl,
        ...(opts.sa && opts.sc ? { sa: opts.sa, sc: opts.sc } : {}),
      };
      return await buildReceiptURL(receipt);
    } catch { return ""; }
  }

  function getOutboundRail(cn: string, token: string): string {
    if (AIRWALLEX_COUNTRIES.has(cn)) return "airwallex";
    const digits = token.replace(/\D/g, "");
    if (digits.length === 16) return "visa_direct";       // tarjeta → Visa Direct siempre
    if (FLUTTERWAVE_COUNTRIES.has(cn)) return "flutterwave"; // África sin tarjeta
    if (STABLECOIN_COUNTRIES.has(cn)) return "stablecoin";   // sancionados
    if (digits.length > 0) return "stripe_connect";          // cuenta bancaria
    return "";
  }

  async function executePayment() {
    if (!rail) { setError("Riel no definido"); router.push("/resultado"); return; }

    try {
      const p = decodedPayload;

      // ── Stripe (inbound card / local method) ──
      if (rail === "stripe") {
        const amt   = p?.a  ?? amount;
        const cur   = p?.c  ?? currency;
        const bName = p?.nb ?? bankName;
        const cn    = p?.cn ?? country;
        const token = p?.t  ?? accountId;

        const outboundRail = getOutboundRail(cn, token);
        const auditUrl = await makeAuditUrl({ txId: "", amt, cur, bName, cn, tt: "terminal", rl: "stripe" });

        const res = await fetch("/api/payment/stripe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: amt, currency: cur,
            description: p?.rn ?? "Cobro OmniPay",
            bankName: bName,
            recipientPhone: recipientPhone || "",
            auditUrl,
            sourceCountry: sourceCountry || "MX",
            // Conciliation metadata
            ...(token.trim() ? {
              bankToken:      token,
              country:        cn,
              receiverName:   p?.rn ?? (receiverName || recipientName || "Receptor"),
              targetCurrency: cur,
              sourceCurrency: p?.sc ?? (sourceCurrency || cur),
              outboundRail,
            } : {}),
          }),
        });
        const data = await res.json() as { tx_id?: string; checkout_url?: string; error?: string };

        if (!res.ok || data.error) throw new Error(data.error ?? "Error Stripe");

        if (data.checkout_url) {
          setTxId(data.tx_id ?? "");
          setTxReference(data.tx_id ?? "");
          sessionStorage.setItem("omnipay_stripe_pending", JSON.stringify({
            txId: data.tx_id ?? "", amount: amt, currency: cur,
            bankName: bName, country: cn, transactionType: "terminal",
            rail: "stripe", recipientPhone: recipientPhone || "",
          }));
          window.location.href = data.checkout_url;
          return;
        }

      // ── Airwallex (Asia Oriental) ──
      } else if (rail === "airwallex") {
        const amt  = p?.a  ?? amount;
        const tgt  = p?.c  ?? currency;
        const src  = p?.sc ?? (sourceCurrency || tgt);
        const rn   = p?.rn ?? (receiverName || recipientName || "Receptor");
        const fee  = p?.f  ?? parseFloat((amt * 0.0025).toFixed(2));
        const bTkn = p?.t  ?? accountId;
        const bNm  = p?.nb ?? bankName;
        const cn   = p?.cn ?? country;

        const res = await fetch("/api/payment/airwallex", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: amt, sourceCurrency: src, targetCurrency: tgt,
            bankToken: bTkn, bankName: bNm, country: cn,
            receiverName: rn, feeAmount: fee,
          }),
        });
        const data = await res.json() as { tx_id?: string; status?: string; error?: string };

        if (!res.ok || data.error) throw new Error(data.error ?? "Error Airwallex");

        const txId = data.tx_id ?? "";
        setTxId(txId); setTxReference(txId); setTxStatus("success");

        if (recipientPhone && txId) {
          const notifyUrl = await makeAuditUrl({
            txId, amt, cur: tgt, bName: bNm, cn,
            tt: transactionType ?? "remesa", rl: "airwallex",
            sa: senderAmount || undefined, sc: sourceCurrency || undefined,
          });
          fetch("/api/webhooks/notify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tx_id: txId, rail: "airwallex", amount: amt, currency: tgt, recipient_phone: recipientPhone, audit_url: notifyUrl }),
          }).catch(() => {});
        }

        if (data.status === "pending") await pollStatus("airwallex", txId);
        else router.push("/resultado?s=success");

      // ── Stablecoin (Binance Pay — Rusia + países restringidos) ──
      } else if (rail === "flutterwave") {
        const amt  = p?.a  ?? amount;
        const tgt  = p?.c  ?? currency;
        const src  = p?.sc ?? (sourceCurrency || tgt);
        const rn   = p?.rn ?? (receiverName || recipientName || "Receptor");
        const fee  = p?.f  ?? parseFloat((amt * 0.0025).toFixed(2));
        const bTkn = p?.t  ?? accountId;
        const bNm  = p?.nb ?? bankName;
        const cn   = p?.cn ?? country;

        const res = await fetch("/api/payment/flutterwave", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: amt, currency: src, targetCurrency: tgt,
            bankToken: bTkn, bankName: bNm, country: cn,
            receiverName: rn, feeAmount: fee,
          }),
        });
        const data = await res.json() as { tx_id?: string; status?: string; error?: string };
        if (!res.ok || data.error) throw new Error(data.error ?? "Error Flutterwave");

        const txId = data.tx_id ?? "";
        setTxId(txId); setTxReference(txId); setTxStatus("success");

        if (recipientPhone && txId) {
          const notifyUrl = await makeAuditUrl({
            txId, amt, cur: tgt, bName: bNm, cn,
            tt: transactionType ?? "remesa", rl: "flutterwave",
            sa: senderAmount || undefined, sc: sourceCurrency || undefined,
          });
          fetch("/api/webhooks/notify", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tx_id: txId, rail: "flutterwave", amount: amt, currency: tgt, recipient_phone: recipientPhone, audit_url: notifyUrl }),
          }).catch(() => {});
        }

        if (data.status === "pending") await pollStatus("flutterwave", txId);
        else router.push("/resultado?s=success");

      } else if (rail === "stablecoin") {
        const amt  = p?.a ?? amount;
        const cur  = p?.c ?? currency;
        const fee  = p?.f ?? parseFloat((amt * 0.0025).toFixed(2));
        const rTkn = p?.t ?? accountId;

        const res = await fetch("/api/payment/stablecoin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ receiverToken: rTkn, amount: amt, feeAmount: fee, currency: cur }),
        });
        const data = await res.json() as { tx_id?: string; status?: string; error?: string };

        if (!res.ok || data.error) throw new Error(data.error ?? "Error stablecoin bridge");

        const txId = data.tx_id ?? "";
        setTxId(txId); setTxReference(txId); setTxStatus("success");

        if (recipientPhone && txId) {
          const notifyUrl = await makeAuditUrl({
            txId, amt, cur, bName: bankName, cn: country,
            tt: transactionType ?? "remesa", rl: "stablecoin",
          });
          fetch("/api/webhooks/notify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tx_id: txId, rail: "stablecoin", amount: amt, currency: cur, recipient_phone: recipientPhone, audit_url: notifyUrl }),
          }).catch(() => {});
        }

        router.push("/resultado?s=success");

      } else {
        throw new Error(`Riel no soportado: ${rail}`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error desconocido";
      setError(msg);
      router.push("/resultado?s=error");
    }
  }

  async function pollStatus(r: string, txId: string) {
    const MAX = 20;
    let n = 0;
    while (n < MAX) {
      await new Promise((res) => setTimeout(res, 3000));
      try {
        const res = await fetch(`/api/status/${r}?tx_id=${txId}`);
        const d   = await res.json() as { status?: string };
        if (d.status === "completed") { router.push("/resultado?s=success"); return; }
        if (d.status === "failed")    { setError("El banco rechazó la transacción"); router.push("/resultado?s=error"); return; }
      } catch { /* continue */ }
      n++;
    }
    setError("Tiempo de espera agotado. Verifica con tu banco.");
    router.push("/resultado?s=error");
  }

  const heading = transactionType === "remesa"   ? t("sending")
    : transactionType === "terminal" ? t("charging")
    : t("paying");

  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-[#0f172a] px-6">
      <motion.div className="flex flex-col items-center gap-8" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div className="relative">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
            className="w-24 h-24 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full"
          />
          <motion.div
            animate={{ rotate: -360 }}
            transition={{ repeat: Infinity, duration: 3, ease: "linear" }}
            className="absolute inset-3 w-18 h-18 border-4 border-emerald-500/20 border-b-emerald-500 rounded-full"
          />
        </div>
        <div className="flex flex-col items-center gap-3">
          <h2 className="text-white text-xl font-bold">{heading}</h2>
          <ProcessingMessages transactionType={transactionType} />
        </div>
        <p className="text-slate-600 text-xs text-center max-w-xs">{t("no_close")}</p>
      </motion.div>
    </main>
  );
}

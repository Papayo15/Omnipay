"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { Zap, Shield, CheckCircle, AlertCircle, Clock, Copy, Check } from "lucide-react";

type Step = "loading" | "welcome" | "kyc" | "polling" | "completing" | "done" | "error";

interface InviteData {
  recipient_name: string;
  recipient_email: string;
  recipient_country: string;
  sender_name: string;
  amount_target: number;
  exp: number;
}

function RecibirContent() {
  const t = useTranslations("recibir");
  const router = useRouter();
  const searchParams = useSearchParams();

  const [step, setStep] = useState<Step>("loading");
  const [error, setError] = useState("");
  const [inviteData, setInviteData] = useState<InviteData | null>(null);
  const [kycUrl, setKycUrl] = useState("");
  const [pollCount, setPollCount] = useState(0);
  const [payLink, setPayLink] = useState("");
  const [waLink, setWaLink] = useState("");
  const [copied, setCopied] = useState(false);
  const inviteToken = searchParams.get("i") ?? "";

  const decryptInvite = useCallback(async (token: string): Promise<InviteData | null> => {
    try {
      const res = await fetch(`/api/bridge/invite/decode?i=${encodeURIComponent(token)}`);
      if (!res.ok) return null;
      return await res.json() as InviteData;
    } catch { return null; }
  }, []);

  const checkCustomerStatus = useCallback(async (email: string): Promise<"active" | "pending" | "not_found"> => {
    try {
      const res = await fetch(`/api/bridge/customer/status?email=${encodeURIComponent(email)}`);
      if (!res.ok) return "not_found";
      const data = await res.json() as { status: string };
      if (data.status === "active" || data.status === "approved") return "active";
      if (data.status === "pending" || data.status === "under_review") return "pending";
      return "not_found";
    } catch { return "not_found"; }
  }, []);

  // Complete the checkout: create liq address + generate pay link for the sender
  const completeCheckout = useCallback(async (token: string) => {
    setStep("completing");
    try {
      const res = await fetch("/api/bridge/invite/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json() as { pay_link?: string; wa_link?: string; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "Error generando link de pago");
      setPayLink(data.pay_link ?? "");
      setWaLink(data.wa_link ?? "");
      setStep("done");
    } catch (e) {
      setError((e as Error).message);
      setStep("error");
    }
  }, []);

  useEffect(() => {
    if (!inviteToken) { setError(t("no_token")); setStep("error"); return; }

    decryptInvite(inviteToken).then(async (data) => {
      if (!data) { setError(t("invalid_token")); setStep("error"); return; }
      if (Date.now() > data.exp) { setError(t("expired")); setStep("error"); return; }

      setInviteData(data);

      const status = await checkCustomerStatus(data.recipient_email);
      if (status === "active") {
        await completeCheckout(inviteToken);
      } else if (status === "pending") {
        setStep("polling");
      } else {
        setStep("welcome");
      }
    });
  }, [inviteToken, decryptInvite, checkCustomerStatus, completeCheckout, t]);

  // Poll Bridge every 5s until active (max 60s)
  useEffect(() => {
    if (step !== "polling" || !inviteData) return;
    if (pollCount >= 12) { setStep("kyc"); return; }

    const timer = setTimeout(async () => {
      const status = await checkCustomerStatus(inviteData.recipient_email);
      if (status === "active") {
        await completeCheckout(inviteToken);
      } else {
        setPollCount(c => c + 1);
      }
    }, 5000);

    return () => clearTimeout(timer);
  }, [step, pollCount, inviteData, inviteToken, checkCustomerStatus, completeCheckout]);

  const handleStartKyc = useCallback(async () => {
    if (!inviteData) return;
    setStep("kyc");
    try {
      const res = await fetch("/api/bridge/invite/kyc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: inviteToken,
          redirect_uri: `${window.location.origin}/recibir?i=${inviteToken}&kyc_done=1`,
        }),
      });
      const data = await res.json() as { kyc_url?: string; tos_url?: string; status?: string; error?: string };
      if (data.error) { setError(data.error); setStep("error"); return; }
      // already_active: skip KYC, go straight to complete
      if (data.status === "already_active") {
        await completeCheckout(inviteToken);
        return;
      }
      const url = data.tos_url ?? data.kyc_url;
      if (url) { setKycUrl(url); } else { setError(t("kyc_error")); setStep("error"); }
    } catch { setError(t("kyc_error")); setStep("error"); }
  }, [inviteData, inviteToken, completeCheckout, t]);

  // Return from Bridge KYC → poll or complete directly in sandbox
  useEffect(() => {
    const kycDone = searchParams.get("kyc_done") === "1";
    if (kycDone && inviteData) {
      completeCheckout(inviteToken);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, inviteData]);

  const currency = inviteData?.recipient_country === "MX" ? "MXN"
    : inviteData?.recipient_country === "GB" ? "GBP"
    : inviteData?.recipient_country === "CO" ? "COP"
    : inviteData?.recipient_country === "US" ? "USD"
    : "EUR";

  const copyLink = useCallback(() => {
    if (!payLink) return;
    navigator.clipboard.writeText(payLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [payLink]);

  return (
    <main className="min-h-screen bg-[#0f172a] flex flex-col items-center px-5 pt-8 pb-16">
      <div className="w-full max-w-md">

        <div className="flex items-center gap-2 mb-8">
          <Zap className="w-5 h-5 text-[#00C9C8]" />
          <span className="text-white font-bold">OmniPay</span>
        </div>

        {/* LOADING */}
        {step === "loading" && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
            <Zap className="w-8 h-8 text-[#00C9C8] animate-pulse" />
            <p className="text-slate-400 text-sm">{t("loading")}</p>
          </div>
        )}

        {/* COMPLETING — creando liq address */}
        {step === "completing" && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
            <Zap className="w-8 h-8 text-[#00C9C8] animate-pulse" />
            <p className="text-white font-semibold">{t("completing_title")}</p>
            <p className="text-slate-400 text-sm text-center">{t("completing_body")}</p>
          </div>
        )}

        {/* WELCOME */}
        {step === "welcome" && inviteData && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-white mb-2">
                {t("welcome_title", { sender: inviteData.sender_name })}
              </h1>
              <p className="text-slate-400 text-sm leading-relaxed">
                {t("welcome_body", { sender: inviteData.sender_name, amount: inviteData.amount_target, currency })}
              </p>
            </div>

            <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-[#00C9C8]" />
                <p className="text-white font-semibold text-sm">{t("kyc_title")}</p>
              </div>
              <p className="text-slate-400 text-sm leading-relaxed">{t("kyc_why")}</p>
              <ul className="space-y-2">
                {[t("kyc_li1"), t("kyc_li2"), t("kyc_li3"), t("kyc_li4")].map((li, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                    <span className="text-emerald-400 mt-0.5">✓</span>{li}
                  </li>
                ))}
              </ul>
            </div>

            <button onClick={handleStartKyc}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-2xl transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2">
              <Shield className="w-4 h-4" />
              {t("kyc_cta")}
            </button>
            <p className="text-slate-500 text-xs text-center leading-relaxed">{t("kyc_footer")}</p>
          </div>
        )}

        {/* KYC — esperando URL */}
        {step === "kyc" && (
          <div className="space-y-6">
            {!kycUrl ? (
              <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <Shield className="w-8 h-8 text-[#00C9C8] animate-pulse" />
                <p className="text-white font-semibold">{t("kyc_preparing")}</p>
              </div>
            ) : (
              <>
                <div>
                  <h1 className="text-2xl font-bold text-white mb-2">{t("kyc_ready_title")}</h1>
                  <p className="text-slate-400 text-sm leading-relaxed">{t("kyc_ready_body")}</p>
                </div>
                <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-4 space-y-2">
                  <p className="text-slate-400 text-xs">{t("kyc_need")}</p>
                  <ul className="space-y-1">
                    {[t("kyc_need1"), t("kyc_need2")].map((item, i) => (
                      <li key={i} className="text-sm text-slate-300 flex items-center gap-2">
                        <span className="text-[#00C9C8]">→</span> {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <a href={kycUrl}
                  className="flex items-center justify-center gap-2 w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-2xl transition-all duration-200 active:scale-[0.98]">
                  <Shield className="w-4 h-4" />
                  {t("kyc_go")}
                </a>
                <p className="text-slate-500 text-xs text-center">{t("kyc_secure")}</p>
              </>
            )}
          </div>
        )}

        {/* POLLING */}
        {step === "polling" && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
            <Clock className="w-12 h-12 text-[#00C9C8] animate-spin" style={{ animationDuration: "3s" }} />
            <div className="text-center space-y-2">
              <p className="text-white font-semibold">{t("polling_title")}</p>
              <p className="text-slate-400 text-sm leading-relaxed">{t("polling_body")}</p>
            </div>
            <div className="flex gap-2">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-2 h-2 rounded-full bg-[#00C9C8] animate-bounce"
                  style={{ animationDelay: `${i * 0.2}s` }} />
              ))}
            </div>
            <p className="text-slate-500 text-xs text-center max-w-xs leading-relaxed">{t("polling_wait")}</p>
          </div>
        )}

        {/* DONE — link de pago listo para compartir con el emisor */}
        {step === "done" && inviteData && (
          <div className="space-y-6">
            <div className="flex flex-col items-center gap-4 pt-4">
              <CheckCircle className="w-16 h-16 text-emerald-400" />
              <div className="text-center">
                <h1 className="text-2xl font-bold text-white mb-2">{t("done_title")}</h1>
                <p className="text-slate-400 text-sm leading-relaxed">
                  {t("done_body", { sender: inviteData.sender_name })}
                </p>
              </div>
            </div>

            <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-2xl p-5 space-y-3">
              <p className="text-emerald-400 font-semibold text-sm">{t("done_what_next_title")}</p>
              <p className="text-slate-300 text-sm leading-relaxed">
                {t("done_what_next_body", { sender: inviteData.sender_name })}
              </p>
              <div className="pt-2 border-t border-emerald-500/20 space-y-1">
                <p className="text-slate-500 text-xs">{t("done_amount_label")}</p>
                <p className="text-white font-mono font-semibold">
                  {inviteData.amount_target.toLocaleString()} {currency}
                </p>
              </div>
            </div>

            {/* WhatsApp al emisor */}
            {waLink && (
              <a href={waLink} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-3 w-full bg-[#25D366] hover:bg-[#20ba58] text-white font-bold py-4 rounded-2xl transition-all duration-200 active:scale-[0.98]">
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                {t("done_send_whatsapp", { sender: inviteData.sender_name })}
              </a>
            )}

            {/* Copiar link manualmente */}
            {payLink && (
              <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-slate-500 text-[10px] uppercase tracking-wide">{t("done_link_label")}</p>
                  <button onClick={copyLink}
                    className="text-slate-400 hover:text-[#00C9C8] transition-colors flex items-center gap-1 text-xs">
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? t("done_copied") : t("done_copy")}
                  </button>
                </div>
                <p className="text-slate-400 text-xs font-mono break-all">{payLink}</p>
              </div>
            )}

            <button onClick={() => router.push("/")}
              className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-3 rounded-xl transition-all text-sm">
              {t("go_home")}
            </button>
          </div>
        )}

        {/* ERROR */}
        {step === "error" && (
          <div className="space-y-6 pt-8">
            <div className="flex flex-col items-center gap-4">
              <AlertCircle className="w-12 h-12 text-red-400" />
              <div className="text-center">
                <h1 className="text-xl font-bold text-white mb-2">{t("error_title")}</h1>
                <p className="text-red-300 text-sm leading-relaxed">{error}</p>
              </div>
            </div>
            <button onClick={() => router.push("/")}
              className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-3 rounded-xl transition-all text-sm">
              {t("go_home")}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

export default function RecibirPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <Zap className="w-8 h-8 text-[#00C9C8] animate-pulse" />
      </main>
    }>
      <RecibirContent />
    </Suspense>
  );
}

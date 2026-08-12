"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { Zap, Shield, CheckCircle, AlertCircle } from "lucide-react";

// Simplified: /recibir only does KYC.
// Once the recipient is verified, /enviar (emisor polling) detects it
// via /api/bridge/invite/status and shows VA instructions inline.

type Step = "loading" | "welcome" | "kyc" | "done" | "error";

interface InviteData {
  recipient_name:    string;
  recipient_email:   string;
  recipient_country: string;
  sender_name:       string;
  amount_target:     number;
  exp:               number;
}

function RecibirContent() {
  const t           = useTranslations("recibir");
  const router      = useRouter();
  const searchParams = useSearchParams();

  const [step, setStep]             = useState<Step>("loading");
  const [error, setError]           = useState("");
  const [inviteData, setInviteData] = useState<InviteData | null>(null);
  const [kycUrl, setKycUrl]         = useState("");
  const inviteToken                  = searchParams.get("i") ?? "";

  const decryptInvite = useCallback(async (token: string): Promise<InviteData | null> => {
    try {
      const res = await fetch(`/api/bridge/invite/decode?i=${encodeURIComponent(token)}`);
      if (!res.ok) return null;
      return await res.json() as InviteData;
    } catch { return null; }
  }, []);

  const checkCustomerStatus = useCallback(async (email: string): Promise<"active" | "other"> => {
    try {
      const res  = await fetch(`/api/bridge/customer/status?email=${encodeURIComponent(email)}`);
      if (!res.ok) return "other";
      const data = await res.json() as { status: string };
      return (data.status === "active" || data.status === "approved") ? "active" : "other";
    } catch { return "other"; }
  }, []);

  // Mount: decode invite token, check if already verified
  useEffect(() => {
    if (!inviteToken) { setError(t("no_token")); setStep("error"); return; }

    decryptInvite(inviteToken).then(async (data) => {
      if (!data) { setError(t("invalid_token")); setStep("error"); return; }
      if (Date.now() > data.exp) { setError(t("expired")); setStep("error"); return; }

      setInviteData(data);

      const status = await checkCustomerStatus(data.recipient_email);
      if (status === "active") {
        setStep("done"); // already verified — nothing more to do
      } else {
        setStep("welcome");
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inviteToken]);

  // Return from Bridge KYC
  useEffect(() => {
    if (searchParams.get("kyc_done") === "1" && inviteData) {
      setStep("done");
    }
  }, [searchParams, inviteData]);

  // Start KYC via /api/bridge/invite/kyc
  const handleStartKyc = useCallback(async () => {
    if (!inviteData) return;
    setStep("kyc");
    try {
      const res  = await fetch("/api/bridge/invite/kyc", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          token:        inviteToken,
          redirect_uri: `${window.location.origin}/recibir?i=${inviteToken}&kyc_done=1`,
        }),
      });
      const data = await res.json() as { kyc_url?: string; tos_url?: string; status?: string; error?: string };
      if (data.error) { setError(data.error); setStep("error"); return; }
      if (data.status === "already_active") { setStep("done"); return; }

      const url = data.tos_url ?? data.kyc_url;
      if (url) {
        setKycUrl(url);
      } else {
        // Sandbox: KYC was simulated server-side — already done
        setStep("done");
      }
    } catch { setError(t("kyc_error")); setStep("error"); }
  }, [inviteData, inviteToken, t]);

  const currency = inviteData?.recipient_country === "MX" ? "MXN"
    : inviteData?.recipient_country === "GB" ? "GBP"
    : inviteData?.recipient_country === "CO" ? "COP"
    : inviteData?.recipient_country === "US" ? "USD"
    : "EUR";

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

        {/* WELCOME — explain KYC, ask to proceed */}
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

            <button
              onClick={handleStartKyc}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-2xl transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2"
            >
              <Shield className="w-4 h-4" />
              {t("kyc_cta")}
            </button>
            <p className="text-slate-500 text-xs text-center leading-relaxed">{t("kyc_footer")}</p>
          </div>
        )}

        {/* KYC — waiting for URL or showing the Bridge link */}
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
                <a
                  href={kycUrl}
                  className="flex items-center justify-center gap-2 w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-2xl transition-all duration-200 active:scale-[0.98]"
                >
                  <Shield className="w-4 h-4" />
                  {t("kyc_go")}
                </a>
                <p className="text-slate-500 text-xs text-center">{t("kyc_secure")}</p>
              </>
            )}
          </div>
        )}

        {/* DONE — recipient verified, emisor will get notified via polling */}
        {step === "done" && inviteData && (
          <div className="space-y-6">
            <div className="flex flex-col items-center gap-4 pt-4">
              <CheckCircle className="w-16 h-16 text-emerald-400" />
              <div className="text-center space-y-2">
                <h1 className="text-2xl font-bold text-white">{t("done_title")}</h1>
                <p className="text-slate-400 text-sm leading-relaxed">
                  {t("done_body", { sender: inviteData.sender_name })}
                </p>
              </div>
            </div>

            <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-2xl p-5 space-y-2">
              <p className="text-emerald-400 font-semibold text-sm">{t("done_what_next_title")}</p>
              <p className="text-slate-300 text-sm leading-relaxed">
                {t("done_what_next_body", { sender: inviteData.sender_name })}
              </p>
              <div className="pt-2 border-t border-emerald-500/20">
                <p className="text-slate-500 text-xs">{t("done_amount_label")}</p>
                <p className="text-white font-mono font-semibold mt-0.5">
                  {inviteData.amount_target.toLocaleString()} {currency}
                </p>
              </div>
            </div>

            <button
              onClick={() => router.push("/")}
              className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-3 rounded-xl transition-all text-sm"
            >
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
            <button
              onClick={() => router.push("/")}
              className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-3 rounded-xl transition-all text-sm"
            >
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

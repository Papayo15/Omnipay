import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

export const metadata: Metadata = {
  title: "Privacy Policy — OmniPay",
  description: "OmniPay Privacy Policy",
};

export default async function PrivacyPage() {
  const t = await getTranslations("privacy");

  return (
    <main className="max-w-3xl mx-auto px-6 py-12 text-[#f8fafc]">
      <div className="mb-8">
        <Link href="/" className="text-sm text-[#6366f1] hover:underline">{t("back")}</Link>
      </div>

      <h1 className="text-3xl font-bold mb-2">{t("title")}</h1>
      <p className="text-sm text-[#94a3b8] mb-10">{t("updated")}</p>

      <div className="space-y-8 text-[#cbd5e1] leading-relaxed">

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">{t("s1_h")}</h2>
          <p>{t("s1_p")}</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">{t("s2_h")}</h2>
          <p className="mb-3">{t("s2_intro")}</p>
          <ul className="list-disc pl-6 space-y-2">
            <li><strong className="text-white">{t("s2_li1_bold")}</strong> {t("s2_li1")}</li>
            <li><strong className="text-white">{t("s2_li2_bold")}</strong> {t("s2_li2")}</li>
            <li><strong className="text-white">{t("s2_li3_bold")}</strong> {t("s2_li3")}</li>
            <li><strong className="text-white">{t("s2_li4_bold")}</strong> {t("s2_li4")}</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">{t("s3_h")}</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>{t("s3_li1")}</li>
            <li>{t("s3_li2")}</li>
            <li>{t("s3_li3")}</li>
            <li>{t("s3_li4")}</li>
            <li>{t("s3_li5")}</li>
            <li>{t("s3_li6")}</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">{t("s4_h")}</h2>
          <p className="mb-3">{t("s4_intro")}</p>
          <div className="space-y-3">
            <div className="bg-[#1e293b] rounded-lg p-4">
              <p className="font-semibold text-white mb-1">{t("s4_bridge_name")}</p>
              <p className="text-sm">{t("s4_bridge_desc")} <a href="https://bridge.xyz/privacy" className="text-[#6366f1] hover:underline" target="_blank" rel="noopener">bridge.xyz/privacy</a></p>
            </div>
            <div className="bg-[#1e293b] rounded-lg p-4">
              <p className="font-semibold text-white mb-1">{t("s4_stripe_name")}</p>
              <p className="text-sm">{t("s4_stripe_desc")} <a href="https://stripe.com/privacy" className="text-[#6366f1] hover:underline" target="_blank" rel="noopener">stripe.com/privacy</a></p>
            </div>
            <div className="bg-[#1e293b] rounded-lg p-4">
              <p className="font-semibold text-white mb-1">{t("s4_wise_name")}</p>
              <p className="text-sm">{t("s4_wise_desc")} <a href="https://wise.com/privacy-policy" className="text-[#6366f1] hover:underline" target="_blank" rel="noopener">wise.com/privacy-policy</a></p>
            </div>
            <div className="bg-[#1e293b] rounded-lg p-4">
              <p className="font-semibold text-white mb-1">{t("s4_twilio_name")}</p>
              <p className="text-sm">{t("s4_twilio_desc")}</p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">{t("s5_h")}</h2>
          <p>{t("s5_p")}</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">{t("s6_h")}</h2>
          <p>{t("s6_p")}</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">{t("s7_h")}</h2>
          <p className="mb-3">{t("s7_intro")}</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>{t("s7_li1")}</li>
            <li>{t("s7_li2")}</li>
            <li>{t("s7_li3")}</li>
            <li>{t("s7_li4")}</li>
            <li>{t("s7_li5")}</li>
          </ul>
          <p className="mt-3">{t("s7_contact")}</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">{t("s8_h")}</h2>
          <p>{t("s8_p")}</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">{t("s9_h")}</h2>
          <p>{t("s9_p")}</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">{t("s10_h")}</h2>
          <p>{t("s10_p")}</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">{t("s11_h")}</h2>
          <p>{t("s11_p")}</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">{t("s12_h")}</h2>
          <p>{t("s12_p")}</p>
        </section>

      </div>

      <div className="mt-12 pt-8 border-t border-[#1e293b] flex gap-6 text-sm text-[#64748b]">
        <Link href="/terms" className="hover:text-[#6366f1]">{t("footer_terms")}</Link>
        <Link href="/" className="hover:text-[#6366f1]">{t("footer_home")}</Link>
      </div>
    </main>
  );
}

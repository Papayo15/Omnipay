import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

export const metadata: Metadata = {
  title: "Terms of Service — OmniPay",
  description: "OmniPay Terms of Service",
};

export default async function TermsPage() {
  const t = await getTranslations("terms");

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
          <p>{t("s2_p")}</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">{t("s3_h")}</h2>
          <p>{t("s3_p")}</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">{t("s4_h")}</h2>
          <p>{t("s4_p")}</p>
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
          <p>{t("s7_p")}</p>
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
        <Link href="/privacy" className="hover:text-[#6366f1]">{t("footer_privacy")}</Link>
        <Link href="/" className="hover:text-[#6366f1]">{t("footer_home")}</Link>
      </div>
    </main>
  );
}

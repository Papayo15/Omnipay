import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service — OmniPay",
  description: "OmniPay Terms of Service",
};

export default function TermsPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-12 text-[#f8fafc]">
      <div className="mb-8">
        <Link href="/" className="text-sm text-[#6366f1] hover:underline">← Back to OmniPay</Link>
      </div>

      <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
      <p className="text-sm text-[#94a3b8] mb-10">Last updated: July 21, 2026</p>

      <div className="space-y-8 text-[#cbd5e1] leading-relaxed">

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">1. Acceptance of Terms</h2>
          <p>By accessing or using OmniPay (&quot;Service&quot;), you agree to be bound by these Terms of Service. If you do not agree to these terms, do not use the Service. OmniPay is operated by OmniPay Technologies Inc. (&quot;Company&quot;, &quot;we&quot;, &quot;us&quot;).</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">2. Description of Service</h2>
          <p>OmniPay provides international money transfer and business payment services. We facilitate transfers between senders and recipients in supported countries using licensed third-party payment processors including Bridge.xyz, Stripe, Paysend, and Wise. OmniPay does not hold, store, or manage funds directly.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">3. Eligibility</h2>
          <p>You must be at least 18 years of age and legally capable of entering into contracts to use the Service. By using OmniPay, you represent that you meet these requirements and that all information you provide is accurate and complete.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">4. Identity Verification (KYC/KYB)</h2>
          <p>To comply with applicable Anti-Money Laundering (AML) and Know Your Customer (KYC) regulations, we are required to verify your identity before processing transactions. Identity verification is performed by Bridge.xyz, our licensed compliance partner. A one-time verification fee of $2.00 USD (individuals) or $10.00 USD (businesses) is charged and passed through directly to Bridge.xyz.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">5. Fees and Pricing</h2>
          <p>OmniPay charges a service fee of 0.50% of the transferred amount plus a flat operational fee ($0.99 for P2P, $1.99 for B2B transfers). Additional fees charged by payment processors (Bridge.xyz 0.75%, Stripe 2.9%+$0.30, Paysend ~1.5%) are passed through transparently. All fees are disclosed before you confirm a transaction. Exchange rates are provided by Bridge.xyz and may fluctuate.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">6. Prohibited Uses</h2>
          <p>You may not use OmniPay to: (a) violate any law or regulation; (b) send funds related to illegal activities; (c) circumvent sanctions or export controls; (d) engage in money laundering, fraud, or financing of terrorism; (e) make payments to countries or individuals on OFAC sanctions lists; (f) process transactions on behalf of third parties without disclosure.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">7. Transaction Limits and Restrictions</h2>
          <p>OmniPay reserves the right to impose transaction limits, require additional verification, delay, or decline transactions that we reasonably believe may violate applicable laws or our policies. We are not liable for delays caused by our payment processors or correspondent banks.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">8. Zero Data Retention Policy</h2>
          <p>OmniPay does not maintain a proprietary database of customer financial information. All customer identity data, account details, and transaction records are stored and managed by our licensed payment processor partners (primarily Bridge.xyz). OmniPay stores only the minimum data necessary to facilitate a transaction (encrypted payment tokens that expire). We do not sell your data to third parties.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">9. Disclaimers and Limitation of Liability</h2>
          <p>THE SERVICE IS PROVIDED &quot;AS IS&quot; WITHOUT WARRANTIES OF ANY KIND. TO THE FULLEST EXTENT PERMITTED BY LAW, OMNIPAY AND ITS AFFILIATES SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES. OUR TOTAL LIABILITY FOR ANY CLAIM ARISING FROM THE USE OF THE SERVICE SHALL NOT EXCEED THE FEES PAID BY YOU IN THE THREE MONTHS PRECEDING THE CLAIM.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">10. Governing Law</h2>
          <p>These Terms shall be governed by the laws of the Province of Ontario, Canada, without regard to conflict of law principles. Any disputes shall be resolved exclusively in the courts of Ontario, Canada.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">11. Changes to Terms</h2>
          <p>We reserve the right to modify these Terms at any time. We will provide notice of material changes by updating the &quot;Last updated&quot; date. Continued use of the Service after changes constitutes acceptance of the new Terms.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">12. Contact</h2>
          <p>For questions about these Terms, contact us at: <a href="mailto:legal@omnipay.ca" className="text-[#6366f1] hover:underline">legal@omnipay.ca</a></p>
        </section>

      </div>

      <div className="mt-12 pt-8 border-t border-[#1e293b] flex gap-6 text-sm text-[#64748b]">
        <Link href="/privacy" className="hover:text-[#6366f1]">Privacy Policy</Link>
        <Link href="/" className="hover:text-[#6366f1]">OmniPay Home</Link>
      </div>
    </main>
  );
}

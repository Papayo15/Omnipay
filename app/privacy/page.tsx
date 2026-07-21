import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — OmniPay",
  description: "OmniPay Privacy Policy",
};

export default function PrivacyPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-12 text-[#f8fafc]">
      <div className="mb-8">
        <Link href="/" className="text-sm text-[#6366f1] hover:underline">← Back to OmniPay</Link>
      </div>

      <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
      <p className="text-sm text-[#94a3b8] mb-10">Last updated: July 21, 2026</p>

      <div className="space-y-8 text-[#cbd5e1] leading-relaxed">

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">1. Overview</h2>
          <p>OmniPay Technologies Inc. (&quot;OmniPay&quot;, &quot;we&quot;, &quot;us&quot;) is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and protect your information when you use our international payment services. OmniPay operates a zero data retention architecture — we do not maintain a proprietary database of your financial information.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">2. Information We Collect</h2>
          <p className="mb-3">We collect only the minimum information necessary to process your transactions:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li><strong className="text-white">Identity information:</strong> Name, email address, country of residence — collected to comply with KYC regulations and passed to Bridge.xyz for verification.</li>
            <li><strong className="text-white">Payment information:</strong> Bank account details (CLABE, IBAN, routing numbers, PIX keys) — encrypted and used only to create payment instructions. Not stored on OmniPay servers after transaction completion.</li>
            <li><strong className="text-white">Transaction metadata:</strong> Amount, currency, destination country, timestamp — retained in encrypted form for 90 days for dispute resolution.</li>
            <li><strong className="text-white">Device and technical data:</strong> IP address, browser type, operating system — collected automatically for security and fraud prevention. Retained for 30 days.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">3. How We Use Your Information</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>To process and track your international transfers</li>
            <li>To comply with AML/KYC regulatory requirements</li>
            <li>To send transaction confirmations and receipts via SMS or WhatsApp (with your consent)</li>
            <li>To detect and prevent fraud and unauthorized transactions</li>
            <li>To respond to customer support inquiries</li>
            <li>To improve our services (using aggregated, anonymized data only)</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">4. Third-Party Service Providers</h2>
          <p className="mb-3">OmniPay shares your information with the following licensed service providers to fulfill transactions:</p>
          <div className="space-y-3">
            <div className="bg-[#1e293b] rounded-lg p-4">
              <p className="font-semibold text-white mb-1">Bridge.xyz</p>
              <p className="text-sm">KYC/KYB identity verification, payment rails (SPEI, ACH, SEPA, PIX, FPS, Bre-B), customer data storage. Bridge.xyz is a licensed Money Services Business. <a href="https://bridge.xyz/privacy" className="text-[#6366f1] hover:underline" target="_blank" rel="noopener">bridge.xyz/privacy</a></p>
            </div>
            <div className="bg-[#1e293b] rounded-lg p-4">
              <p className="font-semibold text-white mb-1">Stripe Inc.</p>
              <p className="text-sm">Card payment processing for B2B transfers. Stripe is PCI-DSS Level 1 certified. <a href="https://stripe.com/privacy" className="text-[#6366f1] hover:underline" target="_blank" rel="noopener">stripe.com/privacy</a></p>
            </div>
            <div className="bg-[#1e293b] rounded-lg p-4">
              <p className="font-semibold text-white mb-1">Wise (TransferWise Ltd.)</p>
              <p className="text-sm">International payout fallback for countries not covered by Bridge. <a href="https://wise.com/privacy-policy" className="text-[#6366f1] hover:underline" target="_blank" rel="noopener">wise.com/privacy-policy</a></p>
            </div>
            <div className="bg-[#1e293b] rounded-lg p-4">
              <p className="font-semibold text-white mb-1">Twilio Inc.</p>
              <p className="text-sm">SMS notifications for transaction confirmations (opt-in only).</p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">5. Zero Data Retention Architecture</h2>
          <p>OmniPay is designed with a zero data retention principle. Your financial account details (bank accounts, card numbers, identity documents) are stored exclusively by our licensed payment processor partners, not on OmniPay servers. Payment links use AES-256-GCM encrypted tokens that contain only the minimum data needed to complete a transaction and are not stored in a database.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">6. Data Security</h2>
          <p>We implement industry-standard security measures including TLS 1.3 encryption in transit, AES-256-GCM encryption for payment tokens, webhook signature verification (RSA-SHA256), and strict access controls. However, no method of transmission over the internet is 100% secure. We encourage you to use strong, unique passwords and report any suspected security incidents to <a href="mailto:security@omnipay.ca" className="text-[#6366f1] hover:underline">security@omnipay.ca</a>.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">7. Your Rights</h2>
          <p className="mb-3">Depending on your jurisdiction, you may have the right to:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Access the personal information we hold about you</li>
            <li>Request correction of inaccurate data</li>
            <li>Request deletion of your data (subject to regulatory retention requirements)</li>
            <li>Object to processing of your personal data</li>
            <li>Data portability (receive your data in a structured format)</li>
          </ul>
          <p className="mt-3">To exercise these rights, contact us at <a href="mailto:privacy@omnipay.ca" className="text-[#6366f1] hover:underline">privacy@omnipay.ca</a>. We will respond within 30 days.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">8. Cookies and Tracking</h2>
          <p>OmniPay uses a single functional cookie (<code className="text-[#818cf8] bg-[#1e293b] px-1 rounded">OMNIPAY_LOCALE</code>) to remember your preferred language. We do not use advertising cookies or third-party tracking pixels. Essential security cookies may be set by Stripe for fraud prevention during payment flows.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">9. International Transfers</h2>
          <p>Your data may be processed in Canada, the United States, and other countries where our service providers operate. By using OmniPay, you consent to the transfer of your information to these countries. We ensure appropriate safeguards are in place through Standard Contractual Clauses or equivalent mechanisms.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">10. Children&apos;s Privacy</h2>
          <p>OmniPay is not directed to children under 18. We do not knowingly collect personal information from anyone under 18. If you believe we have inadvertently collected such information, please contact us immediately.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">11. Changes to This Policy</h2>
          <p>We may update this Privacy Policy periodically. We will notify you of significant changes by updating the &quot;Last updated&quot; date at the top of this page. Continued use of OmniPay after changes constitutes acceptance of the updated policy.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">12. Contact Us</h2>
          <p>Privacy inquiries: <a href="mailto:privacy@omnipay.ca" className="text-[#6366f1] hover:underline">privacy@omnipay.ca</a><br />
          Legal inquiries: <a href="mailto:legal@omnipay.ca" className="text-[#6366f1] hover:underline">legal@omnipay.ca</a><br />
          Security reports: <a href="mailto:security@omnipay.ca" className="text-[#6366f1] hover:underline">security@omnipay.ca</a></p>
        </section>

      </div>

      <div className="mt-12 pt-8 border-t border-[#1e293b] flex gap-6 text-sm text-[#64748b]">
        <Link href="/terms" className="hover:text-[#6366f1]">Terms of Service</Link>
        <Link href="/" className="hover:text-[#6366f1]">OmniPay Home</Link>
      </div>
    </main>
  );
}

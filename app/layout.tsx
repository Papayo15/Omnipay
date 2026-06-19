import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });

export const metadata: Metadata = {
  title: "OmniPay Global — B2B International Settlement Suite",
  description: "Secure, transparent B2B payment settlement for international freelancers, remote contractors, and digital agencies. 1% flat fee. Zero data retention.",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "OmniPay Global" },
  icons: { apple: "/icon-192.png" },
  openGraph: {
    title: "OmniPay Global — B2B Settlement Suite",
    description: "International invoice settlement with transparent pricing. Standard & Instant tiers available.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#00C9C8",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <html lang={locale} className={geist.variable}>
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
              navigator.serviceWorker.register('/sw.js');
            });
          }
        ` }} />
      </head>
      <body className="min-h-screen flex flex-col bg-[#0f172a] text-[#f8fafc] antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

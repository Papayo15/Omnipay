import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { headers } from "next/headers";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });

const SUPPORTED = ["es", "en", "de"] as const;
type SupportedLocale = (typeof SUPPORTED)[number];

async function loadLocale() {
  const h = await headers();
  // next-intl middleware sets x-next-intl-locale; fallback to Accept-Language
  const fromMiddleware = h.get("x-next-intl-locale") ?? "";
  const fromHeader = (h.get("accept-language") ?? "es")
    .split(",")[0].split(";")[0].split("-")[0].toLowerCase();
  const raw = (SUPPORTED as readonly string[]).includes(fromMiddleware)
    ? fromMiddleware
    : fromHeader;
  const locale = (SUPPORTED as readonly string[]).includes(raw) ? (raw as SupportedLocale) : "es";
  switch (locale) {
    case "en": return { locale, messages: (await import("../messages/en.json")).default };
    case "de": return { locale, messages: (await import("../messages/de.json")).default };
    default:   return { locale: "es", messages: (await import("../messages/es.json")).default };
  }
}

export const metadata: Metadata = {
  title: "OmniPay Protocol",
  description: "Transfiere dinero directo de banco a banco en todo el mundo. Sin terminales. Sin tarjetas.",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "OmniPay" },
  openGraph: {
    title: "OmniPay Protocol",
    description: "Te están pidiendo dinero. Paga en segundos.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#6366f1",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale, messages } = await loadLocale();
  return (
    <html lang={locale} className={geist.variable}>
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className="min-h-screen flex flex-col bg-[#0f172a] text-[#f8fafc] antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

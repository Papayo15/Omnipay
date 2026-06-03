import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { headers } from "next/headers";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });

const SUPPORTED = ["es", "en", "ru", "de", "zh", "ja", "ko", "hi", "fr", "nl"] as const;

async function loadLocale() {
  const h = await headers();
  const lang = (h.get("accept-language") ?? "es")
    .split(",")[0].split(";")[0].split("-")[0].toLowerCase();
  const locale = (SUPPORTED as readonly string[]).includes(lang) ? lang : "es";
  switch (locale) {
    case "en": return { locale, messages: (await import("../messages/en.json")).default };
    case "ru": return { locale, messages: (await import("../messages/ru.json")).default };
    case "de": return { locale, messages: (await import("../messages/de.json")).default };
    case "zh": return { locale, messages: (await import("../messages/zh.json")).default };
    case "ja": return { locale, messages: (await import("../messages/ja.json")).default };
    case "ko": return { locale, messages: (await import("../messages/ko.json")).default };
    case "hi": return { locale, messages: (await import("../messages/hi.json")).default };
    case "fr": return { locale, messages: (await import("../messages/fr.json")).default };
    case "nl": return { locale, messages: (await import("../messages/nl.json")).default };
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

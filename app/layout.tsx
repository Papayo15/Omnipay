import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { headers } from "next/headers";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });

const SUPPORTED = ["am","ar","de","en","es","fr","ha","hi","id","it","ja","ko","nl","pt","ru","sw","tr","vi","zh"] as const;
type SupportedLocale = (typeof SUPPORTED)[number];

async function loadLocale() {
  const h = await headers();
  const lang = (h.get("accept-language") ?? "en")
    .split(",")[0].split(";")[0].split("-")[0].toLowerCase() as SupportedLocale;
  const locale: SupportedLocale = SUPPORTED.includes(lang) ? lang : "en";
  switch (locale) {
    case "am": return { locale, messages: (await import("../messages/am.json")).default };
    case "ar": return { locale, messages: (await import("../messages/ar.json")).default };
    case "de": return { locale, messages: (await import("../messages/de.json")).default };
    case "es": return { locale, messages: (await import("../messages/es.json")).default };
    case "fr": return { locale, messages: (await import("../messages/fr.json")).default };
    case "ha": return { locale, messages: (await import("../messages/ha.json")).default };
    case "hi": return { locale, messages: (await import("../messages/hi.json")).default };
    case "id": return { locale, messages: (await import("../messages/id.json")).default };
    case "it": return { locale, messages: (await import("../messages/it.json")).default };
    case "ja": return { locale, messages: (await import("../messages/ja.json")).default };
    case "ko": return { locale, messages: (await import("../messages/ko.json")).default };
    case "nl": return { locale, messages: (await import("../messages/nl.json")).default };
    case "pt": return { locale, messages: (await import("../messages/pt.json")).default };
    case "ru": return { locale, messages: (await import("../messages/ru.json")).default };
    case "sw": return { locale, messages: (await import("../messages/sw.json")).default };
    case "tr": return { locale, messages: (await import("../messages/tr.json")).default };
    case "vi": return { locale, messages: (await import("../messages/vi.json")).default };
    case "zh": return { locale, messages: (await import("../messages/zh.json")).default };
    default:   return { locale: "en" as const, messages: (await import("../messages/en.json")).default };
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

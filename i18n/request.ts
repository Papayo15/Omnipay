import { getRequestConfig } from "next-intl/server";
import { headers } from "next/headers";

const SUPPORTED = ["am","ar","de","en","es","fr","ha","hi","id","it","ja","ko","nl","pt","ru","sw","tr","vi","zh"] as const;
type Locale = (typeof SUPPORTED)[number];

export default getRequestConfig(async () => {
  const h = await headers();
  const lang = (h.get("accept-language") ?? "en")
    .split(",")[0].split(";")[0].split("-")[0].toLowerCase();
  const locale: Locale = SUPPORTED.includes(lang as Locale) ? (lang as Locale) : "en";

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
    default:   return { locale: "en", messages: (await import("../messages/en.json")).default };
  }
});

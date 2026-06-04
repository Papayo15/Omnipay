import { NextRequest, NextResponse } from "next/server";

// Middleware de idiomas — sin dependencia de next-intl server setup
// Solo detecta el idioma del header Accept-Language y lo pasa como header al layout.
// El layout lee "x-next-intl-locale" y carga el JSON de mensajes correspondiente.

const LOCALES = ["es", "en", "de"];

export function proxy(req: NextRequest) {
  const acceptLang = req.headers.get("accept-language") ?? "es";
  const raw   = acceptLang.split(",")[0].split(";")[0].split("-")[0].toLowerCase();
  const locale = LOCALES.includes(raw) ? raw : "es";

  const res = NextResponse.next();
  res.headers.set("x-next-intl-locale", locale);
  return res;
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};

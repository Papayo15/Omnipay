import createMiddleware from "next-intl/middleware";

export default createMiddleware({
  locales: ["es", "en", "de"],
  defaultLocale: "es",
  localePrefix: "never",   // sin prefijo /en/ /de/ en las URLs
  localeDetection: true,   // detecta por Accept-Language header y cookie
  alternateLinks: false,   // sin Link: alternate headers (SEO opcional)
});

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};

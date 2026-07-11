import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Frame-Options",           value: "SAMEORIGIN" },
        { key: "X-Content-Type-Options",    value: "nosniff" },
        { key: "Referrer-Policy",           value: "strict-origin-when-cross-origin" },
        {
          key: "Content-Security-Policy",
          value: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://buy.ramp.network https://global.transak.com",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "font-src 'self' https://fonts.gstatic.com",
            "img-src 'self' data: blob: https:",
            // Allow Ramp + Transak widget iframes
            "frame-src https://js.stripe.com https://hooks.stripe.com https://buy.ramp.network https://global.transak.com",
            "worker-src 'self'",
            "connect-src 'self' https://ipinfo.io https://open.er-api.com https://api.stripe.com https://api.wise.com https://api.thunes.com https://bitso.com https://api.ramp.network https://api.transak.com",
            "media-src 'self' blob:",
          ].join("; "),
        },
      ],
    },
  ],
};

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");
export default withNextIntl(nextConfig);

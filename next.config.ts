import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Frame-Options",           value: "DENY" },
        { key: "X-Content-Type-Options",    value: "nosniff" },
        { key: "Referrer-Policy",           value: "strict-origin-when-cross-origin" },
        {
          key: "Content-Security-Policy",
          value: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "font-src 'self' https://fonts.gstatic.com",
            "img-src 'self' data: blob: https:",
            "frame-src https://js.stripe.com https://hooks.stripe.com",
            "worker-src 'self'",
            "connect-src 'self' https://ipinfo.io https://open.er-api.com https://api.stripe.com https://api.wise.com https://api.thunes.com",
            "media-src 'self' blob:",
          ].join("; "),
        },
      ],
    },
  ],
};

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");
export default withNextIntl(nextConfig);

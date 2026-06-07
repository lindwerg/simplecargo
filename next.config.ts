import type { NextConfig } from "next";

// Security headers applied to every response (ARCHITECTURE §6, §13.2).
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  output: "standalone", // required for Railway (D6)
  // NO experimental.ppr — boring stable SSR at launch (D6). Pinned to Next 15.x.
  // withSerwist wrapper is added in Phase 6, after CSP verification.
  // pdfjs-dist должен грузиться из node_modules (там его worker), а не бандлиться —
  // иначе в standalone-сборке распознавание PDF падает с
  // «Cannot find module .../chunks/pdf.worker.mjs». Плюс жёстко включаем сам
  // worker в трейс standalone (динамический импорт nft не ловит).
  serverExternalPackages: ["pdfjs-dist"],
  outputFileTracingIncludes: {
    "/api/**": [
      "./node_modules/pdfjs-dist/legacy/build/pdf.mjs",
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "./node_modules/pdfjs-dist/package.json",
    ],
  },
  headers: async () => [{ source: "/(.*)", headers: securityHeaders }],
};

export default nextConfig;

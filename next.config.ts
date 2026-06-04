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
  headers: async () => [{ source: "/(.*)", headers: securityHeaders }],
};

export default nextConfig;

import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: "SimpleCargo", template: "%s · SimpleCargo" },
  description: "Учёт вагонных перевозок — Приоритет Логистика",
  applicationName: "SimpleCargo",
  // Installed-app behaviour. The manifest link + real icon files (apple-touch 180,
  // 192/512 maskable) land in P0-9; here we only ship asset-free head meta.
  appleWebApp: { capable: true, title: "SimpleCargo", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

// theme-color tracks --color-bg per theme (approx hex; oklch isn't universally
// honored in the meta tag). Dark is the product default (ADR-D19).
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafbfc" },
    { media: "(prefers-color-scheme: dark)", color: "#15161a" },
  ],
};

// The per-request CSP nonce (set by src/middleware.ts) can only be injected into
// framework <script> tags when the render happens at request time. Statically
// prerendered HTML is built without the runtime nonce, so its inline scripts get
// blocked by `script-src 'nonce-…'`. Force dynamic rendering app-wide so Next
// reads the request CSP header and nonces its scripts. Fine here: every surface
// is a behind-auth dynamic dashboard, no static marketing pages.
export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Dark is the default (ADR-D19). Reading the persisted choice server-side means
  // returning light-theme users get the right theme in the first paint — no FOUC,
  // and no inline theme script (which would need the CSP nonce).
  const theme =
    (await cookies()).get("theme")?.value === "light" ? "light" : "dark";

  return (
    <html lang="ru" data-theme={theme}>
      <head>
        {/* Preload the money typeface (Geist Mono) — its swap is the CLS risk the
            design budget guards (fix L3) — plus the primary UI subsets (Cyrillic
            first: the UI is Russian). */}
        <link
          rel="preload"
          href="/fonts/GeistMono.var.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/inter-cyrillic.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/inter-latin.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

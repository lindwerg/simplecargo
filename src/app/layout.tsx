import type { Metadata, Viewport } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: "SimpleCargo", template: "%s · SimpleCargo" },
  description: "Учёт вагонных перевозок — Приоритет Логистика",
  applicationName: "SimpleCargo",
  // Installed-app behaviour. The manifest link is auto-injected by app/manifest.ts;
  // real icon files (apple-touch 180, 192/512 maskable) ship from public/icons (P0-9).
  appleWebApp: { capable: true, title: "SimpleCargo", statusBarStyle: "default" },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
  },
  formatDetection: { telephone: false },
  // iOS launches a home-screen icon in fullscreen STANDALONE only when this
  // apple-prefixed meta is present. Next's `appleWebApp.capable` does NOT emit it
  // on this version (only the standardized `mobile-web-app-capable` for Android),
  // so set it explicitly — without it iOS opens the icon as a normal Safari tab.
  other: { "apple-mobile-web-app-capable": "yes" },
};

// Светлая тема — единственная (PWA light-only). theme-color = --color-bg светлой темы.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // App-like behaviour: lock zoom (no pinch / double-tap zoom) and let content
  // extend under the notch / Dynamic Island so env(safe-area-inset-*) is non-zero.
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#fafbfc",
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
  // PWA — только светлая тема. Жёстко фиксируем data-theme="light" на сервере
  // (без FOUC; переключатель темы убран).
  return (
    <html lang="ru" data-theme="light">
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

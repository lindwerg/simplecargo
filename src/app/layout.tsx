import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SimpleCargo",
  description: "Учёт вагонных перевозок — Приоритет Логистика",
};

// The per-request CSP nonce (set by src/middleware.ts) can only be injected into
// framework <script> tags when the render happens at request time. Statically
// prerendered HTML is built without the runtime nonce, so its inline scripts get
// blocked by `script-src 'nonce-…'`. Force dynamic rendering app-wide so Next
// reads the request CSP header and nonces its scripts. Fine here: every surface
// is a behind-auth dynamic dashboard, no static marketing pages.
export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}

import type { MetadataRoute } from "next";

// PWA manifest (P0-9). Next serves this at /manifest.webmanifest and auto-injects
// the <link rel="manifest"> tag. No service worker yet (deferred to Phase 6) —
// this only makes the app installable. Цвета — светлой темы (PWA light-only);
// те же хексы у <meta name="theme-color"> в layout.tsx.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SimpleCargo",
    short_name: "SimpleCargo",
    description: "Учёт вагонных перевозок — Приоритет Логистика",
    lang: "ru",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#fafbfc",
    theme_color: "#fafbfc",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

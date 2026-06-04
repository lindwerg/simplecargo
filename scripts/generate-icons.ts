import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

// Generates the PWA icon set from an inline SVG brand mark, so the icons are
// reproducible from source rather than hand-dropped binaries. Run once via
// `pnpm icons:generate`; the resulting PNGs are committed (production never runs
// this, so relying on a system sans-serif at generation time is fine). Mark = an
// accent "SC" monogram on the app's dark canvas (design tokens).

// Approximate sRGB of the locked dark tokens (oklch isn't honored in PNG/meta):
// --color-bg oklch(12% 0.012 260) and --color-accent oklch(78% 0.155 75).
const BG = "#15161a";
const ACCENT = "#e3a83c";

const ICONS_DIR = path.join(process.cwd(), "public", "icons");

// Authored in a 1024 box. font-size 440 keeps the "SC" comfortably inside the
// central ~80% maskable safe zone so Android's shape mask never clips it.
function markSvg(size: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="${BG}"/>
  <text x="512" y="512" font-family="Helvetica, Arial, sans-serif" font-size="440" font-weight="700" letter-spacing="-12" fill="${ACCENT}" text-anchor="middle" dominant-baseline="central">SC</text>
</svg>`;
}

async function render(size: number, file: string): Promise<void> {
  await sharp(Buffer.from(markSvg(size))).png().toFile(path.join(ICONS_DIR, file));
  // eslint-disable-next-line no-console
  console.log(`✓ ${file} (${size}×${size})`);
}

async function main(): Promise<void> {
  await mkdir(ICONS_DIR, { recursive: true });
  await render(192, "icon-192.png");
  await render(512, "icon-512.png");
  await render(180, "apple-touch-icon.png");
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error("Icon generation failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});

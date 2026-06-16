// One-off icon generator for the PWA.
// Run via: node scripts/generate-icons.mjs
// Produces public/icon-192.png, public/icon-512.png, public/icon-512-maskable.png,
// and public/apple-touch-icon.png. Uses a slate-900 rounded square with a bold
// white "H" monogram.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, "..", "public");
mkdirSync(publicDir, { recursive: true });

const BG = "#0f172a";
const FG = "#ffffff";

function svgIcon({ size, glyphScale }) {
  // glyphScale = fraction of the canvas the glyph occupies (height-wise).
  // Standard icon: 0.62. Maskable: 0.42 (sits inside the central 60% safe zone).
  const radius = Math.round(size * 0.22);
  const fontSize = Math.round(size * glyphScale);
  // Nudge the glyph baseline up slightly so the optical center lines up.
  const cx = size / 2;
  const cy = size / 2;
  return Buffer.from(
    `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect x="0" y="0" width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="${BG}"/>
  <text x="${cx}" y="${cy}"
        font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
        font-size="${fontSize}"
        font-weight="700"
        fill="${FG}"
        text-anchor="middle"
        dominant-baseline="central">H</text>
</svg>`
  );
}

async function render(svgBuf, outPath, size) {
  await sharp(svgBuf, { density: 384 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(outPath);
  console.log("wrote", outPath);
}

const targets = [
  { file: "icon-192.png", size: 192, glyphScale: 0.62 },
  { file: "icon-512.png", size: 512, glyphScale: 0.62 },
  // Maskable: H fits inside central 60% (Chrome's safe zone), slate fills the rest.
  { file: "icon-512-maskable.png", size: 512, glyphScale: 0.42 },
  { file: "apple-touch-icon.png", size: 180, glyphScale: 0.62 },
];

for (const t of targets) {
  const svg = svgIcon({ size: t.size, glyphScale: t.glyphScale });
  await render(svg, resolve(publicDir, t.file), t.size);
}

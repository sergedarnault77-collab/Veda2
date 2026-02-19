import sharp from "sharp";
import { mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT = join(ROOT, "public", "icons");

mkdirSync(OUT, { recursive: true });

// High-res SVG source — re-created at 1024px for crisp output
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" rx="224" fill="#6c5ce7"/>
  <text x="512" y="760" text-anchor="middle" fill="#fff"
        font-size="700" font-weight="bold"
        font-family="system-ui, -apple-system, sans-serif">V</text>
</svg>`;

// Maskable icon: extra padding (safe zone = inner 80%)
const SVG_MASKABLE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="#6c5ce7"/>
  <text x="512" y="700" text-anchor="middle" fill="#fff"
        font-size="540" font-weight="bold"
        font-family="system-ui, -apple-system, sans-serif">V</text>
</svg>`;

const sizes = [
  // PWA / Android
  { name: "icon-72x72.png",    size: 72 },
  { name: "icon-96x96.png",    size: 96 },
  { name: "icon-128x128.png",  size: 128 },
  { name: "icon-144x144.png",  size: 144 },
  { name: "icon-152x152.png",  size: 152 },
  { name: "icon-192x192.png",  size: 192 },
  { name: "icon-384x384.png",  size: 384 },
  { name: "icon-512x512.png",  size: 512 },
  // iOS
  { name: "apple-touch-icon.png", size: 180 },
  // Store submissions
  { name: "icon-1024x1024.png", size: 1024 },
];

const maskableSizes = [
  { name: "icon-maskable-192x192.png", size: 192 },
  { name: "icon-maskable-512x512.png", size: 512 },
];

async function generate() {
  const svgBuffer = Buffer.from(SVG);
  const svgMaskable = Buffer.from(SVG_MASKABLE);

  for (const { name, size } of sizes) {
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(join(OUT, name));
    console.log(`  ✓ ${name}`);
  }

  for (const { name, size } of maskableSizes) {
    await sharp(svgMaskable)
      .resize(size, size)
      .png()
      .toFile(join(OUT, name));
    console.log(`  ✓ ${name} (maskable)`);
  }

  // Also generate a 32x32 favicon.png for broader browser support
  await sharp(svgBuffer)
    .resize(32, 32)
    .png()
    .toFile(join(ROOT, "public", "favicon.png"));
  console.log(`  ✓ favicon.png`);

  console.log(`\nDone — ${sizes.length + maskableSizes.length + 1} icons generated.`);
}

generate().catch((err) => { console.error(err); process.exit(1); });

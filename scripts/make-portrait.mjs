// Prepares the hero portrait: clears the near-transparent haze around the cutout, trims the empty
// margin, and writes a PNG with no metadata (sharp drops EXIF unless asked to keep it).
// Astro makes the AVIF/WebP sizes from it.
//
//   node scripts/make-portrait.mjs [source.png]
import { mkdirSync } from 'node:fs';
import sharp from 'sharp';

const source = process.argv[2] ?? `${process.env.HOME}/Downloads/1B161A24-A03B-4EFD-A13F-0CB06C9A4563.PNG`;
const out = 'src/assets/portrait.png';

// Background removers leave faint, almost-transparent pixels around the subject. Drop-shadows and
// masks turn that haze into a visible box, so anything below this alpha becomes fully clear.
const ALPHA_FLOOR = 24;

const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
let cleared = 0;
for (let i = 3; i < data.length; i += 4) {
  if (data[i] > 0 && data[i] < ALPHA_FLOOR) {
    data[i] = 0;
    cleared++;
  }
}

mkdirSync('src/assets', { recursive: true });
const result = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
  .trim()
  .png({ compressionLevel: 9 })
  .toFile(out);
console.log(`cleared ${cleared} haze pixels; wrote ${out} (${result.width}×${result.height})`);

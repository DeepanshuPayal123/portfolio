// Prepares the hero portrait: trims the transparent margin around the cutout and writes a PNG
// with no metadata (sharp drops EXIF unless asked to keep it). Astro makes the AVIF/WebP sizes.
//
//   node scripts/make-portrait.mjs [source.png]
import { mkdirSync } from 'node:fs';
import sharp from 'sharp';

const source = process.argv[2] ?? `${process.env.HOME}/Downloads/1B161A24-A03B-4EFD-A13F-0CB06C9A4563.PNG`;
const out = 'src/assets/portrait.png';

mkdirSync('src/assets', { recursive: true });
const info = await sharp(source).trim().png({ compressionLevel: 9 }).toFile(out);
console.log(`wrote ${out} (${info.width}×${info.height})`);

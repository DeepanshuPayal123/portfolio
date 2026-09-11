// Builds the Earth textures the sky shader samples, from NASA's public-domain imagery.
// Sources are cached in .cache/earth so re-runs don't re-download.
//
//   node scripts/make-earth.mjs
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const SOURCES = {
  // Equirectangular, full globe: -180…180 lon, -90…90 lat.
  night: {
    url: 'https://eoimages.gsfc.nasa.gov/images/imagerecords/79000/79765/dnb_land_ocean_ice.2012.3600x1800.jpg',
    credit: 'NASA Earth Observatory — Earth at Night (2012)',
    quality: 52,
  },
  day: {
    url: 'https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57752/land_shallow_topo_2048.jpg',
    credit: 'NASA Visible Earth — Blue Marble',
    quality: 56,
  },
};

// Two sizes: full for desktops, half for phones and low-memory devices.
const SIZES = { high: 2048, low: 1024 };

const cache = '.cache/earth';
mkdirSync(cache, { recursive: true });
mkdirSync('src/assets', { recursive: true });

for (const [name, source] of Object.entries(SOURCES)) {
  const file = `${cache}/${name}.jpg`;
  if (!existsSync(file)) {
    const response = await fetch(source.url);
    if (!response.ok) throw new Error(`${source.url} → ${response.status}`);
    writeFileSync(file, Buffer.from(await response.arrayBuffer()));
    console.log(`downloaded ${file} (${source.credit})`);
  }

  for (const [quality, width] of Object.entries(SIZES)) {
    const out = `src/assets/earth-${name}-${quality}.avif`;
    const info = await sharp(file)
      .resize(width, width / 2, { fit: 'fill' })
      .avif({ quality: source.quality, effort: 6 })
      .toFile(out);
    console.log(`${out} — ${(info.size / 1024).toFixed(0)} KB`);
  }
}

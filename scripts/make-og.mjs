// Renders public/og.png — the 1200×630 link-preview card — in the site's night style, with the portrait.
// Text mirrors src/data/site.ts; rerun after changing the name, role, headline or the portrait.
//
//   node scripts/make-og.mjs
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const base64 = (path) => readFileSync(path).toString('base64');
const sans = base64('node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2');
const mono = base64('node_modules/@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2');
const portrait = base64('src/assets/portrait.png');

// A fixed scatter of stars: seeded, so the card comes out identical on every run.
let seed = 7;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const stars = Array.from({ length: 90 }, () => {
  const x = Math.round(rand() * 1200);
  const y = Math.round(rand() * 470);
  const size = rand() < 0.15 ? 1 : 0;
  return `${x}px ${y}px 0 ${size}px rgb(220 232 255 / ${(0.25 + rand() * 0.6).toFixed(2)})`;
}).join(',');

const html = `<!doctype html><html><head><style>
@font-face { font-family: Geist; font-weight: 100 900; src: url(data:font/woff2;base64,${sans}) format('woff2'); }
@font-face { font-family: GeistMono; font-weight: 100 900; src: url(data:font/woff2;base64,${mono}) format('woff2'); }
* { margin: 0; box-sizing: border-box; }
body {
  position: relative; width: 1200px; height: 630px; overflow: hidden;
  background: linear-gradient(to top, #0a1a3f, #050b1a 70%);
  color: #e6edff; font-family: Geist;
}
.stars { position: absolute; top: 0; left: 0; width: 1px; height: 1px; border-radius: 50%; box-shadow: ${stars}; }
.planet {
  position: absolute; left: -300px; top: 500px; width: 1800px; height: 1800px; border-radius: 50%;
  background: #01030a;
  box-shadow: 0 -3px 10px rgb(214 233 255 / 0.9), 0 -18px 60px rgb(61 123 255 / 0.85), 0 -80px 180px rgb(61 123 255 / 0.45);
}
.flare {
  position: absolute; left: 800px; top: 468px; width: 280px; height: 70px; transform: translateX(-50%);
  background: radial-gradient(closest-side, rgb(255 255 255 / 0.95), rgb(160 200 255 / 0.5) 40%, transparent 75%);
}
.streak {
  position: absolute; left: 0; right: 0; top: 497px; height: 6px; filter: blur(2px);
  background: linear-gradient(90deg, transparent, rgb(190 215 255 / 0.55) 55%, transparent);
}
.glow {
  position: absolute; right: 30px; top: 60px; width: 460px; height: 540px; border-radius: 50%; filter: blur(24px);
  background: radial-gradient(closest-side, rgb(79 141 255 / 0.45), transparent 72%);
}
.portrait {
  position: absolute; right: 80px; bottom: 40px; height: 560px;
  -webkit-mask-image: linear-gradient(to bottom, #000 70%, transparent 98%);
}
.text { position: absolute; left: 80px; top: 86px; width: 660px; }
.pill {
  display: inline-block; padding: 8px 16px; border: 1px solid rgb(79 141 255 / 0.45); border-radius: 999px;
  background: rgb(79 141 255 / 0.12); color: #6ea2ff; font-family: GeistMono; font-size: 16px; letter-spacing: 0.16em;
}
h1 { margin-top: 22px; font-size: 124px; line-height: 0.92; font-weight: 600; letter-spacing: -0.035em; }
h1 span {
  background: linear-gradient(100deg, #e6edff 10%, #4f8dff 55%, #5ee1ff 95%);
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
.role { margin-top: 26px; font-size: 30px; font-weight: 500; line-height: 1.3; }
.role span { color: #93a4c3; font-weight: 400; }
.chips { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 32px; }
.chip {
  padding: 9px 16px; border: 1px solid rgb(140 170 255 / 0.25); border-radius: 999px;
  background: rgb(12 22 48 / 0.7); color: #dbe5ff; font-family: GeistMono; font-size: 18px;
}
.chip em { font-style: normal; color: #ffb454; }
</style></head><body>
<div class="stars"></div>
<div class="glow"></div>
<div class="planet"></div>
<div class="streak"></div>
<div class="flare"></div>
<img class="portrait" src="data:image/png;base64,${portrait}" alt="">
<div class="text">
  <p class="pill">SOFTWARE ENGINEER</p>
  <h1>Deep<span>anshu</span></h1>
  <p class="role">IIT Jodhpur CSE '27 <span>· distributed systems &amp; databases</span></p>
  <div class="chips">
    <span class="chip"><em>PRQLite</em> · SQL engine from scratch</span>
    <span class="chip">123OfAI</span>
    <span class="chip">Decklar</span>
    <span class="chip">CGPA 9.17</span>
  </div>
</div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: 'public/og.png' });
await browser.close();
console.log('wrote public/og.png');

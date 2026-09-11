// Renders public/og.png — the 1200×630 link-preview card — from an inline HTML template.
// Text mirrors src/data/site.ts; rerun after changing the name, role or headline.
//
//   node scripts/make-og.mjs
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const font = (pkg, file) => readFileSync(`node_modules/@fontsource/${pkg}/files/${file}`).toString('base64');
const sans400 = font('ibm-plex-sans', 'ibm-plex-sans-latin-400-normal.woff2');
const sans600 = font('ibm-plex-sans', 'ibm-plex-sans-latin-600-normal.woff2');
const mono500 = font('ibm-plex-mono', 'ibm-plex-mono-latin-500-normal.woff2');

const html = `<!doctype html><html><head><style>
@font-face { font-family: Plex; font-weight: 400; src: url(data:font/woff2;base64,${sans400}) format('woff2'); }
@font-face { font-family: Plex; font-weight: 600; src: url(data:font/woff2;base64,${sans600}) format('woff2'); }
@font-face { font-family: PlexMono; src: url(data:font/woff2;base64,${mono500}) format('woff2'); }
* { margin: 0; box-sizing: border-box; }
body {
  position: relative; width: 1200px; height: 630px; padding: 84px 88px;
  display: flex; flex-direction: column; justify-content: space-between;
  background-color: #071426; color: #dbe7ff; font-family: Plex;
  background-image:
    linear-gradient(rgb(120 170 255 / 0.17) 1px, transparent 1px),
    linear-gradient(90deg, rgb(120 170 255 / 0.17) 1px, transparent 1px),
    linear-gradient(rgb(120 170 255 / 0.07) 1px, transparent 1px),
    linear-gradient(90deg, rgb(120 170 255 / 0.07) 1px, transparent 1px);
  background-size: 120px 120px, 120px 120px, 24px 24px, 24px 24px;
  background-position: -1px -1px;
}
.frame { position: absolute; inset: 32px; border: 1px solid rgb(94 225 255 / 0.35); }
.label { font-family: PlexMono; font-size: 18px; letter-spacing: 0.16em; text-transform: uppercase; color: #8fa6c8; }
h1 { margin-top: 18px; font-size: 136px; line-height: 0.9; font-weight: 600; letter-spacing: -0.02em; }
.role { margin-top: 30px; font-size: 32px; } .role b { color: #5ee1ff; font-weight: 400; } .role span { color: #8fa6c8; }
.chips { display: flex; gap: 14px; }
.chip { font-family: PlexMono; font-size: 20px; padding: 10px 16px; border: 1px solid rgb(120 170 255 / 0.3); background: #0a1b33; }
.chip em { font-style: normal; color: #ffb454; }
</style></head><body>
<div class="frame"></div>
<div>
  <p class="label">DWG-001 · Portfolio</p>
  <h1>Deepanshu</h1>
  <p class="role"><b>Software Engineer</b><span> · IIT Jodhpur CSE '27 · distributed systems &amp; databases</span></p>
</div>
<div class="chips">
  <span class="chip"><em>PRQLite</em> · SQL engine from scratch</span>
  <span class="chip">123OfAI</span>
  <span class="chip">Decklar</span>
  <span class="chip">CGPA 9.17</span>
</div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: 'public/og.png' });
await browser.close();
console.log('wrote public/og.png');

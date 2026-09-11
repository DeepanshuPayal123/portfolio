// Lighthouse CI (mobile preset) against the preview server on :4321, using Playwright's Chromium.
//
//   npm run build && npm run preview   # or reuse the running preview daemon
//   npm run lighthouse
import { spawnSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const { status } = spawnSync('npx', ['lhci', 'autorun'], {
  stdio: 'inherit',
  env: { ...process.env, CHROME_PATH: chromium.executablePath() },
});
process.exit(status ?? 1);

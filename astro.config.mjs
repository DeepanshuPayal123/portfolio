// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Production origin; override with SITE_URL once a custom domain is attached.
  site: process.env.SITE_URL ?? 'https://deepanshupayal.pages.dev',
  integrations: [react(), sitemap()],
  redirects: { '/resume': '/resume.pdf' },
  vite: { plugins: [tailwindcss()] },
});

// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: process.env.SITE_URL ?? 'http://localhost:4321',
  integrations: [react(), sitemap()],
  redirects: { '/resume': '/resume.pdf' },
  vite: { plugins: [tailwindcss()] },
});

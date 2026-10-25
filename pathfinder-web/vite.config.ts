import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(({mode}) => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      // Makes it an installable web app that works offline: a "service worker"
      // saves every file of the app on the phone the first time it's opened.
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icons/apple-touch-icon.png'],
        manifest: {
          name: 'Pathfinder – Offline Backcountry Navigation',
          short_name: 'Pathfinder',
          description: 'Find your way back on the trail, even without GPS.',
          theme_color: '#0b1311',
          background_color: '#0b1311',
          display: 'standalone',
          orientation: 'portrait',
          // Relative, so it works both at / (dev) and at /Pathfinder/app/ (GitHub Pages).
          start_url: '.',
          scope: '.',
          icons: [
            {src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png'},
            {src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png'},
            {src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable'},
          ],
        },
        workbox: {
          // Save the whole app, fonts and images included, for offline use.
          globPatterns: ['**/*.{js,css,html,woff2,png,jpg,svg,webmanifest,json}'],
        },
      }),
      // `npm run dev:phone` serves over HTTPS with a self-signed certificate,
      // because phone browsers only allow GPS and the compass on secure sites.
      mode === 'phone' && basicSsl(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    test: {
      include: ['tests/**/*.test.ts'],
      environment: 'node',
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

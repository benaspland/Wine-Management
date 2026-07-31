import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

const base = process.env.GITHUB_PAGES === 'true' ? '/Wine-Management/' : '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      // 'prompt', not 'autoUpdate': autoUpdate installs the new worker
      // silently and the running page keeps its already-cached assets,
      // so a deploy only appears on the launch after next. The app now
      // says when a build is waiting and reloads into it on a tap.
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'icons.svg'],
      manifest: {
        name: 'The Cellar - Wine Management',
        short_name: 'The Cellar',
        description: 'Manage your wine collection across multiple locations with smart scheduling and consumption planning.',
        theme_color: '#722F37',
        background_color: '#1a1a1a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Fonts and icons are self-hosted (fontsource + lucide SVGs), so the
        // precache below covers everything the UI needs offline.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
})

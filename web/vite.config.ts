import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import { VitePWA } from 'vite-plugin-pwa'
import { renderSVG } from 'vite-plugin-render-svg'

export default defineConfig({
  base: './',
  server: {
    proxy: {
      '/api': 'http://localhost:2342',
    },
  },
  build: {
    // Suppress large chunk warning. There's not much we can do about this.
    chunkSizeWarningLimit: 1500,
    sourcemap: true,
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, 'index.html'),
        'grist-widget': resolve(import.meta.dirname, 'grist-widget.html'),
        'component.js': resolve(import.meta.dirname, 'src/component.ts'),
        component: resolve(import.meta.dirname, 'component.html'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name == 'component.js') {
            // Component entrypoint
            return '[name]'
          }
          return '[name].[hash].js'
        },
        manualChunks: (id) => {
          if (id.includes('node_modules/maplibre-gl')) {
            return 'maplibre'
          }
        },
      },
    },
  },
  plugins: [
    VitePWA({
      devOptions: {
        enabled: false,
        type: 'module',
      },
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      includeAssets: ['fonts/**/0-255.pbf', 'sprites/**', 'icon.svg', 'favicon.ico', '*.png'],
      manifest: {
        id: '/',
        short_name: 'EMF Map',
        name: 'Electromagnetic Field 2026 Map',
        description: 'Map for Electromagnetic Field 2026',
        icons: [
          {
            src: 'pwa-64x64.png',
            sizes: '64x64',
            type: 'image/png',
          },
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        background_color: '#eeeeee',
        display: 'standalone',
        theme_color: '#FB48C4',
      },
    }),
    renderSVG({
      pattern: 'src/icons/*.svg',
      urlPrefix: 'icons/',
      outputOriginal: true,
    }),
  ],
})

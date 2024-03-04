import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
    base: './',
    build: {
        // Suppress large chunk warning. There's not much we can do about this.
        chunkSizeWarningLimit: 1000,
        sourcemap: true,
        rollupOptions: {
            output: {
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
                name: 'Electromagnetic Field 2024 Map',
                description: 'Map for Electromagnetic Field 2024',
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
                        src: 'pwa-512x512.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'any',
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
    ],
})

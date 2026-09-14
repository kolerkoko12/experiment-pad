import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

function serveDataDir(): Plugin {
  const root = import.meta.dirname
  const dataDir = path.resolve(root, 'data')
  return {
    name: 'serve-data-dir',
    configureServer(server) {
      server.middlewares.use('/data', (req, res, next) => {
        const rel = (req.url ?? '/').split('?')[0] ?? '/'
        const file = path.resolve(dataDir, `.${rel}`)
        if (!file.startsWith(dataDir) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
          next()
          return
        }
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Cache-Control', 'no-cache')
        fs.createReadStream(file).pipe(res)
      })
    },
    closeBundle() {
      fs.cpSync(dataDir, path.resolve(root, 'dist/data'), { recursive: true })
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    serveDataDir(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: '100% Control, 100% Experimental',
        short_name: '100% Ctrl',
        description:
          'Compositor táctil de prompts para usar junto a Mage.space en Split View.',
        theme_color: '#100e0c',
        background_color: '#100e0c',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        lang: 'es',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,json}'],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 4733,
    strictPort: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4733,
    strictPort: true,
  },
})

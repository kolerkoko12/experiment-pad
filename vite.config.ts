import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { defineConfig, loadEnv, type Plugin, type PreviewServer, type ViteDevServer } from 'vite'
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

function serveComfyFunction(): Plugin {
  const functionFile = path.resolve(import.meta.dirname, 'netlify/functions/comfy-generate.mjs')

  const attach = (server: ViteDevServer | PreviewServer) => {
    const run = async (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
      try {
        const mod = (await import(pathToFileURL(functionFile).href)) as {
          handleComfyGenerate: (event: {
            method: string
            query: Record<string, string>
            body: string | null
            env: NodeJS.ProcessEnv
          }) => Promise<{ statusCode: number; headers: Record<string, string>; body: string }>
        }
        const url = new URL(req.url || '/', 'http://control-experimental.local')
        const query = Object.fromEntries(url.searchParams.entries())
        const method = req.method || 'GET'
        let body: string | null = null
        if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
          body = await readRequestBody(req)
        }
        const result = await mod.handleComfyGenerate({
          method,
          query,
          body,
          env: process.env,
        })
        res.statusCode = result.statusCode
        for (const [key, value] of Object.entries(result.headers || {})) {
          res.setHeader(key, value)
        }
        res.end(result.body ?? '')
      } catch (err) {
        next(err)
      }
    }
    server.middlewares.use('/.netlify/functions/comfy-generate', run)
    server.middlewares.use('/api/comfy-generate', run)
  }

  return {
    name: 'serve-comfy-function',
    configureServer(server) {
      attach(server)
    },
    configurePreviewServer(server) {
      attach(server)
    },
  }
}

function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  for (const key of [
    'COMFY_CLOUD_API_KEY',
    'COMFY_BASE_URL',
    'COMFY_CHECKPOINT',
    'COMFY_CHECKPOINT_FLUX',
    'COMFY_CHECKPOINT_SDXL',
    'COMFY_CHECKPOINT_ILLUSTRIOUS',
  ]) {
    if (env[key] && !process.env[key]) process.env[key] = env[key]
  }

  return {
    plugins: [
      react(),
      tailwindcss(),
      serveDataDir(),
      serveComfyFunction(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png'],
        manifest: {
          name: '100% Control, 100% Experimental',
          short_name: '100% Ctrl',
          description:
            'Compositor táctil de prompts para Control / Experimental (Comfy).',
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
          runtimeCaching: [
            {
              urlPattern: /comfy-generate/,
              handler: 'NetworkOnly',
            },
          ],
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
  }
})

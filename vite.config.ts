import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const MIME: Record<string, string> = {
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf',
}

function archiveData(dir: string): Plugin {
  let outDir = 'dist'
  let base = '/'
  return {
    name: 'archive-data',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir)
      base = config.base
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = decodeURIComponent((req.url ?? '').split('?')[0])
        const prefix = base + 'data/'
        if (!url.startsWith(prefix)) return next()
        const file = path.resolve(dir, url.slice(prefix.length))
        if (!file.startsWith(dir + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
          res.statusCode = 404
          return res.end('not found')
        }
        res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream')
        res.setHeader('Cache-Control', 'no-cache')
        fs.createReadStream(file).pipe(res)
      })
    },
    closeBundle() {
      if (process.env.VITE_DATA_URL) return
      if (!fs.existsSync(dir)) {
        this.warn(`存档目录 ${dir} 不存在，站点将没有数据`)
        return
      }
      fs.cpSync(dir, path.join(outDir, 'data'), { recursive: true })
    },
  }
}

const pwa = (base: string) =>
  VitePWA({
    registerType: 'autoUpdate',
    injectRegister: 'script-defer',
    manifest: false,
    workbox: {
      globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
      globIgnores: ['data/**'],
      navigateFallback: `${base}index.html`,
      cleanupOutdatedCaches: true,
      runtimeCaching: [
        {
          urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.includes('/data/') && url.pathname.endsWith('.json'),
          handler: 'NetworkFirst',
          options: { cacheName: 'data-v2' },
        },
        {
          urlPattern: ({ url, sameOrigin, request }) => sameOrigin && url.pathname.includes('/data/') && !url.pathname.endsWith('.json') && !request.headers.has('range'),
          handler: 'CacheFirst',
          options: {
            cacheName: 'media-v2',
            expiration: { maxEntries: 600 },
            cacheableResponse: { statuses: [200] },
          },
        },
      ],
    },
  })

export default defineConfig(({ mode }) => ({
  base: process.env.BASE_PATH || '/',
  plugins: [react(), tailwindcss(), archiveData(path.resolve(mode === 'demo' ? '.demo-data' : process.env.DATA_DIR || 'data')), pwa(process.env.BASE_PATH || '/')],
  build: { target: 'es2022', chunkSizeWarningLimit: 800 },
}))

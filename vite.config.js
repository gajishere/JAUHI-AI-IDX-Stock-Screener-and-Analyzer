import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import process from 'node:process'

const IDX_HOST = 'indonesia-stock-exchange-idx.p.rapidapi.com'

// Dev-only stand-in for the Vercel serverless auto-screen endpoints (Vite's dev
// server doesn't execute /api functions). It runs the SAME autoScreen() in the
// dev Node process — its fetches hit this very dev server's /idx + /yf proxies
// (apiBase falls back to http://localhost:5177 in Node) — and caches the result
// in memory instead of Vercel Blob. So /api/auto-screen-latest and
// /api/auto-screen-run behave locally just like production.
function autoScreenDevApi() {
  let cache = null
  let scanning = false
  const runScan = async () => {
    scanning = true
    try {
      const { autoScreen } = await import('./src/lib/autoScreen.js')
      cache = await autoScreen({ count: 5 })
      return cache
    } finally {
      scanning = false
    }
  }
  const sendJson = (res, body, status = 200) => {
    res.statusCode = status
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify(body))
  }
  return {
    name: 'auto-screen-dev-api',
    configureServer(server) {
      // Point the in-process autoScreen() at THIS dev server's own origin (it
      // reaches the live data through our own /idx + /yf proxies). Set before the
      // first request so apiBase picks it up when autoScreen is dynamically
      // imported. Honors an explicit SELF_ORIGIN override if one is set.
      const setOrigin = () => {
        if (process.env.SELF_ORIGIN || process.env.DEV_PROXY_ORIGIN) return
        const addr = server.httpServer?.address()
        const port = addr && typeof addr === 'object' ? addr.port : server.config.server?.port || 5177
        process.env.DEV_PROXY_ORIGIN = `http://localhost:${port}`
      }
      server.httpServer?.once('listening', setOrigin)
      setOrigin()

      server.middlewares.use((req, res, next) => {
        const path = (req.url || '').split('?')[0]
        if (path === '/api/auto-screen-latest') {
          // Lazily kick off a background scan the first time; polling picks it up.
          if (!cache && !scanning) runScan().catch(() => {})
          return sendJson(res, cache || { status: scanning ? 'scanning' : 'no-snapshot', candidates: [] })
        }
        if (path === '/api/auto-screen-run') {
          runScan()
            .then((snap) => sendJson(res, snap))
            .catch((e) => sendJson(res, { ok: false, error: String(e?.message || e) }, 500))
          return
        }
        next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load every env var (empty prefix) so we can read the un-prefixed, server-only
  // IDX_RAPIDAPI_KEY here in the Node config without exposing it to the client.
  const env = loadEnv(mode, process.cwd(), '')
  const idxKey = env.IDX_RAPIDAPI_KEY
  const claudeKey = env.CLAUDE_API_KEY

  return {
  plugins: [react(), tailwindcss(), autoScreenDevApi()],
  server: {
    port: 5177,
    proxy: {
      // Live IDX data via RapidAPI. The key lives only on this Node proxy and is
      // attached here, so /idx/* requests from the browser carry no secret:
      // /idx/* -> https://indonesia-stock-exchange-idx.p.rapidapi.com/*
      '/idx': {
        target: `https://${IDX_HOST}`,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/idx/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('x-rapidapi-host', IDX_HOST)
            if (idxKey) proxyReq.setHeader('x-rapidapi-key', idxKey)
            proxyReq.removeHeader('origin')
            proxyReq.removeHeader('referer')
          })
        },
      },
      // Yahoo Finance has no CORS headers, so market-data requests are proxied
      // through the dev server: /yf/* -> https://query1.finance.yahoo.com/*
      '/yf': {
        target: 'https://query1.finance.yahoo.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/yf/, ''),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        },
      },
      // Anthropic blocks direct browser calls (CORS), so the AI request is
      // proxied: /anthropic/* -> https://api.anthropic.com/*. The browser sends
      // its x-api-key header (forwarded as-is); we drop the Origin header so the
      // API treats it as a normal server-side request rather than a browser one.
      '/anthropic': {
        target: 'https://api.anthropic.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/anthropic/, ''),
        // Web search tool requests take 20-30s (multiple internal search rounds);
        // raise the proxy timeout so the connection isn't killed mid-flight.
        proxyTimeout: 90000,
        timeout: 90000,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            if (claudeKey) proxyReq.setHeader('x-api-key', claudeKey)
            proxyReq.removeHeader('origin');
            proxyReq.removeHeader('referer');
          });
        },
      },
    },
  },
  }
})

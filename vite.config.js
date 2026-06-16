import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import process from 'node:process'

const IDX_HOST = 'indonesia-stock-exchange-idx.p.rapidapi.com'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load every env var (empty prefix) so we can read the un-prefixed, server-only
  // IDX_RAPIDAPI_KEY here in the Node config without exposing it to the client.
  const env = loadEnv(mode, process.cwd(), '')
  const idxKey = env.IDX_RAPIDAPI_KEY

  return {
  plugins: [react(), tailwindcss()],
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
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.removeHeader('origin');
            proxyReq.removeHeader('referer');
          });
        },
      },
    },
  },
  }
})

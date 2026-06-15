import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5177,
    proxy: {
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
})

// Resolve the base origin for the app's API proxies (/idx, /yf, /anthropic).
//
// In the BROWSER: relative paths served by the Vite dev proxy (dev) or
// Vercel rewrites (prod), so the base is '' and no prefix is needed.
//
// In NODE (serverless scan or local `node` script):
// - Yahoo Finance (/yf): called DIRECTLY — no CORS in Node so the self-call
//   chain through Vercel routing is unnecessary and adds latency / failure risk.
// - IDX & Anthropic (/idx, /anthropic): still need the Vercel proxy for
//   server-side API key injection, so they use the app's own deployment URL.
//
// We read env via globalThis.process (not `import process`) so this file stays
// safe to bundle for the browser, where `process` is undefined.

const env = (typeof globalThis !== 'undefined' && globalThis.process && globalThis.process.env) || {};
const isNode = typeof window === 'undefined';

function resolveOrigin() {
  if (!isNode) return ''; // browser → relative paths
  if (env.SELF_ORIGIN) return env.SELF_ORIGIN.replace(/\/+$/, ''); // explicit override
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`.replace(/\/+$/, ''); // Vercel deployment URL
  return (env.DEV_PROXY_ORIGIN || 'http://localhost:5177').replace(/\/+$/, ''); // local dev fallback
}

export const API_ORIGIN = resolveOrigin();
export const IDX_BASE = `${API_ORIGIN}/idx`;
export const ANTHROPIC_BASE = `${API_ORIGIN}/anthropic`;

// Yahoo Finance: in Node, call the CDN directly (no CORS needed server-side).
// In the browser, go through the /yf Vercel rewrite (avoids CORS).
export const YF_BASE = isNode
  ? (env.YF_DIRECT_BASE || 'https://query2.finance.yahoo.com')
  : `${API_ORIGIN}/yf`;

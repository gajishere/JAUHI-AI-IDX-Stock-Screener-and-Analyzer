// Resolve the base origin for the app's API proxies (/idx, /yf, /anthropic).
//
// In the BROWSER these are relative paths served by the Vite dev proxy (dev) or
// the Vercel rewrites (prod), so the base is just '' and nothing changes.
//
// In NODE — the auto-screening serverless scan, or a local `node` script —
// relative paths don't resolve, so we prefix them with an absolute origin
// pointing at the app's OWN deployment. That reuses the exact same proxy
// endpoints (with their server-side key injection + caching), so the scan code
// is identical in both environments and no secret is ever duplicated here.
//
// We read env via globalThis.process (not `import process`) so this file stays
// safe to bundle for the browser, where `process` is undefined.

const env = (typeof globalThis !== 'undefined' && globalThis.process && globalThis.process.env) || {};

function resolveOrigin() {
  if (typeof window !== 'undefined') return ''; // browser → relative paths
  if (env.SELF_ORIGIN) return env.SELF_ORIGIN.replace(/\/+$/, ''); // explicit override (CI / local node)
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`.replace(/\/+$/, ''); // current Vercel deployment
  return (env.DEV_PROXY_ORIGIN || 'http://localhost:5177').replace(/\/+$/, ''); // local dev-server fallback
}

export const API_ORIGIN = resolveOrigin();
export const IDX_BASE = `${API_ORIGIN}/idx`;
export const YF_BASE = `${API_ORIGIN}/yf`;
export const ANTHROPIC_BASE = `${API_ORIGIN}/anthropic`;

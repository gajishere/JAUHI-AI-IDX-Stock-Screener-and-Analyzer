// Vercel serverless proxy for the Anthropic (Claude) API. The browser calls
// /anthropic/* with no secret; vercel.json maps that to
// /api/anthropic?path=/*&<original query>, and this flat function (no dynamic
// catch-all route) forwards the POST to https://api.anthropic.com/* while
// attaching x-api-key from the server-side CLAUDE_API_KEY env var (set in the
// Vercel project settings — never shipped to the client). Mirrors api/idx.js:
// in local dev the same secret is injected by the /anthropic proxy in
// vite.config.js, so dev and prod behave identically.

import process from 'node:process';

const ANTHROPIC_HOST = 'api.anthropic.com';

export default async function handler(req, res) {
  // Every Claude call from this app is a POST to /v1/messages.
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const key = process.env.CLAUDE_API_KEY;
  if (!key) {
    return res
      .status(500)
      .json({ success: false, message: 'CLAUDE_API_KEY is not configured on the server' });
  }

  const { path, ...rest } = req.query;
  if (!path) {
    return res.status(400).json({ success: false, message: 'Missing path query parameter' });
  }

  const qs = new URLSearchParams(rest).toString();
  const target = `https://${ANTHROPIC_HOST}${path}${qs ? `?${qs}` : ''}`;

  // Forward only what Anthropic needs. The browser's anthropic-version travels
  // with the request; x-api-key is added here. We never echo back the browser's
  // origin/referer, so the API treats this as a normal server-side request.
  const anthropicVersion = req.headers['anthropic-version'] || '2023-06-01';
  // req.body is parsed by Vercel when content-type is application/json; fall back
  // to the raw string for any non-JSON or unparsed payload so nothing is dropped.
  const body = typeof req.body === 'string' && req.body ? req.body : JSON.stringify(req.body ?? {});

  try {
    const upstream = await fetch(target, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'anthropic-version': anthropicVersion,
        'x-api-key': key,
      },
      body,
    });
    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('content-type', upstream.headers.get('content-type') || 'application/json');
    return res.send(text);
  } catch (err) {
    return res
      .status(502)
      .json({ success: false, message: err?.message || 'Upstream Anthropic request failed' });
  }
}

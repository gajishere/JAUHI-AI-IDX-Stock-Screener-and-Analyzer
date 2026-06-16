// Vercel serverless proxy for the IDX RapidAPI. The browser calls /idx/* with
// no secret; a vercel.json rewrite maps that to /api/idx?path=/*&<original
// query>, and this flat function (no dynamic catch-all route) attaches the
// RapidAPI headers from the server-side IDX_RAPIDAPI_KEY env var (set in the
// Vercel project settings — never shipped to the client).

import process from 'node:process';

const IDX_HOST = 'indonesia-stock-exchange-idx.p.rapidapi.com';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const key = process.env.IDX_RAPIDAPI_KEY;
  if (!key) {
    return res
      .status(500)
      .json({ success: false, message: 'IDX_RAPIDAPI_KEY is not configured on the server' });
  }

  const { path, ...rest } = req.query;
  if (!path) {
    return res.status(400).json({ success: false, message: 'Missing path query parameter' });
  }

  const qs = new URLSearchParams(rest).toString();
  const target = `https://${IDX_HOST}${path}${qs ? `?${qs}` : ''}`;

  try {
    const upstream = await fetch(target, {
      method: 'GET',
      headers: {
        'x-rapidapi-host': IDX_HOST,
        'x-rapidapi-key': key,
      },
    });
    const body = await upstream.text();
    res.status(upstream.status);
    res.setHeader('content-type', upstream.headers.get('content-type') || 'application/json');
    // Brief CDN cache to soften the BASIC plan's ~1 req/s ceiling under load.
    res.setHeader('cache-control', 's-maxage=30, stale-while-revalidate=60');
    return res.send(body);
  } catch (err) {
    return res
      .status(502)
      .json({ success: false, message: err?.message || 'Upstream IDX request failed' });
  }
}

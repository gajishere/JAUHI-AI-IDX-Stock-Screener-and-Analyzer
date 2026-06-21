// Read endpoint for the latest auto-screen snapshot. The landing page polls
// this; it returns the JSON the cron run last wrote to Vercel Blob. Never runs a
// scan itself (cheap + fast). Degrades to an empty-but-valid shape so the page
// can always render.

const LATEST_BLOB_PATH = 'auto-screen/latest.json';

export default async function handler(req, res) {
  res.setHeader('content-type', 'application/json');
  try {
    const { list } = await import('@vercel/blob');
    const { blobs } = await list({ prefix: LATEST_BLOB_PATH, limit: 1 });
    if (!blobs || blobs.length === 0) {
      return res.status(200).json({ status: 'no-snapshot', candidates: [] });
    }
    // Fetch the public blob (no-store so we always get what the cron wrote).
    const upstream = await fetch(blobs[0].url, { cache: 'no-store' });
    const snapshot = await upstream.json();
    // Short CDN cache softens polling load without hiding a fresh scan for long.
    res.setHeader('cache-control', 's-maxage=30, stale-while-revalidate=60');
    return res.status(200).json(snapshot);
  } catch (err) {
    return res.status(200).json({ status: 'error', error: err?.message || String(err), candidates: [] });
  }
}

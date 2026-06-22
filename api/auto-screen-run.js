// Cron target for the live auto-screener. An external scheduler (GitHub Actions)
// POSTs here at each fixed WIB scan slot with a bearer token; this runs the scan
// SERVER-SIDE and persists the snapshot to Vercel Blob so every visitor reads
// the same fresh result. The function self-guards on the WIB schedule, so an
// over-firing or late cron is harmless (it just no-ops outside scan slots).
//
// Requires env: AUTO_SCREEN_TOKEN (shared secret) and a connected Vercel Blob
// store (BLOB_READ_WRITE_TOKEN, auto-injected on Vercel). `?force=1` bypasses
// the schedule gate for manual testing.

import process from 'node:process';
import { autoScreen } from '../src/lib/autoScreen.js';
import { shouldScanNow } from '../src/lib/marketHours.js';

// The full-universe scan takes ~20s; give it headroom (Vercel allows up to 60s).
export const config = { maxDuration: 60 };

export const LATEST_BLOB_PATH = 'auto-screen/latest.json';

export default async function handler(req, res) {
  const token = process.env.AUTO_SCREEN_TOKEN;
  const auth = req.headers.authorization || '';
  if (!token || auth !== `Bearer ${token}`) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  const force = req.query.force === '1' || req.query.force === 'true';
  const gate = shouldScanNow();
  if (!gate.ok && !force) {
    return res.status(200).json({ ok: true, skipped: true, reason: gate.reason, wib: gate.dateStr });
  }

  // Dedup: the gate is drift-tolerant (a slot "owns" the whole window until the
  // next slot), and the cron fires several times per slot to survive GitHub's
  // late/dropped runs — so the SAME slot can hit this endpoint many times. Skip
  // if the last snapshot already covers this slot on this trading day. `force`
  // bypasses (manual re-run / testing).
  if (!force && gate.ok) {
    try {
      const { list } = await import('@vercel/blob');
      const { blobs } = await list({ prefix: LATEST_BLOB_PATH, limit: 1 });
      if (blobs && blobs.length > 0) {
        const prev = await (await fetch(blobs[0].url, { cache: 'no-store' })).json();
        if (prev?.scanSlot === gate.slot && prev?.wibDate === gate.dateStr) {
          return res.status(200).json({
            ok: true,
            skipped: true,
            reason: 'already-scanned-this-slot',
            slot: gate.slot,
            wib: gate.dateStr,
          });
        }
      }
    } catch {
      /* dedup is best-effort — if the read fails, fall through and scan */
    }
  }

  try {
    const count = Number(req.query.count) || 5;
    const snapshot = await autoScreen({ count });

    // Persist to Vercel Blob (dynamic import so a missing package surfaces as a
    // clear runtime error rather than blocking unrelated routes).
    const { put } = await import('@vercel/blob');
    const blob = await put(LATEST_BLOB_PATH, JSON.stringify(snapshot), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 0, // the read endpoint adds its own short CDN cache
    });

    return res.status(200).json({
      ok: true,
      skipped: false,
      scanType: snapshot.scanType,
      scanSlot: snapshot.scanSlot,
      count: snapshot.count,
      summary: snapshot.summary,
      url: blob.url,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
}

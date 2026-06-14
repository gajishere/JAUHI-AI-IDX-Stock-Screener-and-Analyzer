// Tier-1 universe scan for the screening engine.
//
// Instead of asking an LLM to recall IDX tickers from memory (which surfaces
// the famous banks/blue-chips JAUHI forbids), this scans the FULL emiten list
// on live data. Yahoo's batch quote endpoints are locked behind a crumb now,
// but the "spark" endpoint still serves close-price history for many symbols
// at once — so we batch-fetch closes for the whole universe, apply a cheap
// JAUHI + velocity pre-filter, and momentum-rank a shortlist. The shortlist is
// then deep-enriched with full OHLCV charts downstream (volume/ATR/liquidity +
// composite scoring), where the precise JAUHI checks live.

import { emiten } from '../data/emiten.js';
import { boardRisk, marketCap as calcMarketCap } from './universe.js';
import { resilientFetch } from './marketData.js';

const YF = '/yf';
const SPARK_CHUNK = 20; // Yahoo rejects spark requests with > 20 symbols
const SCAN_CONCURRENCY = 5; // keep the proxy/Yahoo happy under burst load

// Run async tasks with bounded concurrency, preserving input order.
export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Batch close-history for many IDX codes via spark. Returns
// Map(code -> { ts: number[], close: number[] }). Failed groups are skipped so
// a single bad chunk never sinks the whole scan.
async function fetchSparkHistories(codes, range = '1y') {
  const groups = chunk(codes, SPARK_CHUNK);
  const byCode = new Map();
  await mapLimit(groups, SCAN_CONCURRENCY, async (group) => {
    const syms = group.map((c) => `${c}.JK`).join(',');
    try {
      const r = await resilientFetch(
        `${YF}/v8/finance/spark?symbols=${encodeURIComponent(syms)}&range=${range}&interval=1d`
      );
      if (!r.ok) return;
      const j = await r.json();
      for (const code of group) {
        const entry = j[`${code}.JK`];
        if (entry?.close && entry?.timestamp) {
          byCode.set(code, { ts: entry.timestamp, close: entry.close });
        }
      }
    } catch {
      // Network/parse hiccup on this chunk — leave its codes unscanned.
    }
  });
  return byCode;
}

// Indonesian banks reliably carry "Bank" in the listed name — drop them before
// any network call (JAUHI BANK) to save requests.
const isBankName = (name) => /\bbank\b/i.test(name || '');

function ret(closes, n) {
  if (closes.length <= n) return null;
  const past = closes[closes.length - 1 - n];
  if (!past) return null;
  return (closes[closes.length - 1] - past) / past;
}

const fmtPct = (r) => (r == null ? 'n/a' : `${r >= 0 ? '+' : ''}${(r * 100).toFixed(1)}%`);

// Scan the whole universe as of `date` and return a momentum-ranked shortlist
// of plain candidate objects { ticker, sector, reason } for deep enrichment.
export async function scanUniverse(
  date,
  { count = 5, capMin = null, capMax = null, boardLevel = '', range = '1y' } = {}
) {
  // Pre-filter the emiten list before any network calls.
  let pool = emiten.filter((e) => !isBankName(e.name)); // JAUHI BANK
  if (boardLevel) pool = pool.filter((e) => boardRisk(e.board)?.level === boardLevel);

  const histories = await fetchSparkHistories(pool.map((e) => e.code), range);

  // Honor the "as of" date: trim each series to sessions on/before that date.
  const cutoff = Math.floor(Date.parse(`${date}T23:59:59+07:00`) / 1000);

  const scanned = [];
  let universeSize = 0;
  for (const e of pool) {
    const raw = histories.get(e.code);
    if (!raw) continue;

    const closes = [];
    for (let k = 0; k < raw.close.length; k++) {
      if (raw.ts[k] <= cutoff && raw.close[k] != null) closes.push(raw.close[k]);
    }
    if (closes.length < 25) continue; // delisted / suspended / too new
    universeSize++;

    const price = closes[closes.length - 1];
    const cap = calcMarketCap(e, price); // shares * price, or null

    // User market-cap filter (Rp).
    if (capMin != null && (cap == null || cap < capMin)) continue;
    if (capMax != null && (cap == null || cap > capMax)) continue;

    // JAUHI BLUE CHIP: drop >= Rp100T at scan time. (Blue-chip exceptions need
    // the full chart and are out of scope for a 900-name close-only scan.)
    if (cap != null && cap >= 1e14) continue;

    // NOTE: no velocity (SAHAM LAMBAT) pre-gate here. Tier 2 applies the precise
    // ATR/volume/3-day velocity check on the full chart; gating here too — on a
    // close-only proxy — double-filtered the pool and starved the final list on
    // calmer dates. Momentum ranking already floats the movers to the top.

    const r1w = ret(closes, 5);
    const r1m = ret(closes, 21);
    const high1y = Math.max(...closes);
    const nearHigh = high1y > 0 ? price / high1y : 0;

    // Reward 1-week and 1-month strength plus proximity to the yearly high, so
    // fast movers with clean structure rank first. A moderate size term keeps
    // some liquid names in the mix (Tier 1 is blind to volume), without letting
    // big flat caps dominate — they'd just fail the Tier-2 velocity check and
    // waste shortlist slots. Momentum contributions are mildly capped so a
    // single parabolic pump can't crowd out steadier movers.
    const sizeBias = cap ? Math.min(Math.log10(cap) / 14, 1) : 0;
    const momentum =
      Math.min(r1w ?? 0, 0.4) * 1.5 +
      Math.min(r1m ?? 0, 0.6) +
      nearHigh * 0.5 +
      sizeBias * 0.6;
    scanned.push({
      ticker: e.code,
      sector: null,
      reason: `Universe scan — 1W ${fmtPct(r1w)}, 1M ${fmtPct(r1m)}, ${Math.round(nearHigh * 100)}% of 1Y high`,
      _momentum: momentum,
    });
  }

  scanned.sort((a, b) => b._momentum - a._momentum);

  // Shortlist for Tier-2 enrichment. Kept moderate to limit the Yahoo request
  // burst (the main rate-limit trigger); the Tier-2 progressive fallback fills
  // `count` from this pool even when the strict gates prune hard, so a huge
  // shortlist is no longer needed to avoid starvation.
  const shortlistSize = Math.min(Math.max(count * 8, 45), 80);
  const shortlist = scanned.slice(0, shortlistSize).map(({ ticker, sector, reason }) => ({ ticker, sector, reason }));

  return { shortlist, universeSize, candidateCount: scanned.length, range };
}

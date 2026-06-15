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
import { capTierBounds, shortlistSizeFor } from './screeningCategories.js';

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

// Scan the whole universe as of `date` and return a ranked shortlist of plain
// candidate objects { ticker, sector, reason } for deep enrichment. The
// `category` descriptor (see screeningCategories.js) decides which names are
// eligible, how they're ranked, and how deep a shortlist to enrich.
export async function scanUniverse(
  date,
  { count = 5, category, capTier = 'every', sector = '', boardLevel = '', range = '1y' } = {}
) {
  const cap_t = capTierBounds(capTier);
  // Effective cap bounds = intersection of the cap-tier selector and the
  // category's intrinsic floor/ceiling (e.g. Penny is small-cap only, Blue
  // Chip is ≥Rp10T).
  const capMin = Math.max(cap_t.min ?? 0, category.capFloor ?? 0) || null;
  const capCeil =
    category.capCeil != null && cap_t.max != null
      ? Math.min(category.capCeil, cap_t.max)
      : (category.capCeil ?? cap_t.max);

  // Pre-filter the emiten list before any network calls.
  let pool = emiten;
  if (category.jauhi) pool = pool.filter((e) => !isBankName(e.name)); // JAUHI BANK
  if (category.members) pool = pool.filter((e) => category.members.has(e.code)); // group-gated screens (Conglomerate)
  if (boardLevel) pool = pool.filter((e) => boardRisk(e.board)?.level === boardLevel);
  if (sector) pool = pool.filter((e) => e.sector === sector);

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

    // Cap-tier + category cap bounds (Rp).
    if (capMin != null && (cap == null || cap < capMin)) continue;
    if (capCeil != null && (cap == null || cap > capCeil)) continue;

    // JAUHI BLUE CHIP: drop >= Rp100T at scan time — unless the category opts
    // out (Blue Chip & High Liquidity). Blue-chip exceptions otherwise need the
    // full chart and are out of scope for a 900-name close-only scan.
    if (category.jauhi && cap != null && cap >= 1e14) continue;

    // NOTE: no velocity (SAHAM LAMBAT) pre-gate here. Tier 2 applies the precise
    // ATR/volume/3-day velocity check on the full chart; gating here too — on a
    // close-only proxy — double-filtered the pool and starved the final list on
    // calmer dates. Momentum ranking already floats the movers to the top.

    const r1w = ret(closes, 5);
    const r1m = ret(closes, 21);
    const high1y = Math.max(...closes);
    const nearHigh = high1y > 0 ? price / high1y : 0;
    const sizeBias = cap ? Math.min(Math.log10(cap) / 14, 1) : 0;

    // Two ranking modes. 'momentum' floats fast movers with clean structure to
    // the top (Penny / Momentum). 'size' ranks by scale + proximity to highs —
    // used by fundamental + blue-chip screens, which have no fundamental signal
    // at Tier 1, so they enrich the larger, more-tradable names first.
    let scanScore;
    if (category.tier1 === 'size') {
      scanScore = sizeBias * 2 + nearHigh * 0.5;
    } else {
      scanScore =
        Math.min(r1w ?? 0, 0.4) * 1.5 +
        Math.min(r1m ?? 0, 0.6) +
        nearHigh * 0.5 +
        sizeBias * 0.6;
    }
    scanned.push({
      ticker: e.code,
      sector: e.sector ?? null,
      reason: `Universe scan — 1W ${fmtPct(r1w)}, 1M ${fmtPct(r1m)}, ${Math.round(nearHigh * 100)}% of 1Y high`,
      _scanScore: scanScore,
    });
  }

  scanned.sort((a, b) => b._scanScore - a._scanScore);

  // Shortlist for Tier-2 enrichment. Depth is category-dependent (fundamental
  // screens dig deeper); the Tier-2 progressive fallback fills `count` from
  // this pool even when the strict gates prune hard.
  const shortlistSize = shortlistSizeFor(category, count);
  const shortlist = scanned
    .slice(0, shortlistSize)
    .map(({ ticker, sector: sec, reason }) => ({ ticker, sector: sec, reason }));

  return { shortlist, universeSize, candidateCount: scanned.length, range };
}

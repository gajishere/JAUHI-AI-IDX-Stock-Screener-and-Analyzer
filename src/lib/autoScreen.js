// Live auto-screening orchestrator (momentum / breakout only).
//
// This is a LEAN, isomorphic cousin of screeningStage1 (screeningService.js):
// it reuses the same pure building blocks — the locked screening score, the
// Momentum category gate, the universe scan, and bandarmology — but is seeded
// from the LIVE IDX "movers" feed and runs server-side (Vercel serverless) on a
// fixed clock schedule. It deliberately does NOT import screeningService.js (to
// avoid pulling the browser-only AI-judge path) and NEVER touches the locked
// single-ticker Analysis engine — engine separation holds: this lives wholly on
// the Screening side and only ever uses the Momentum strategy.
//
// Pipeline:
//   1. Seed   = live IDX trending movers  ∪  Yahoo momentum universe shortlist
//   2. Enrich = Yahoo chart per seed → buildScreeningScore (momentum signals)   [free]
//   3. Gate   = a two-tier relaxation LADDER so the page never goes blank on a
//               quiet/red day while keeping the strict bar when the market gives
//               real setups. Tradability ALWAYS holds (no banks, no ≥Rp100T
//               mega-caps, no sub-Rp100M shells). On top of that:
//                 • Tier A (strict): turnover today ≥ Rp 10M + RVOL ≥ 2× MA20 +
//                   a full Momentum match (golden 50/200 stack + volume conf).
//                 • Tier B (relaxed): used ONLY to backfill when Tier A returns
//                   fewer than `count` — softer floors (turnover ≥ Rp 5M, RVOL
//                   ≥ 1.5×) + a DEVELOPING trend (price > MA50, not the full
//                   stack) + any one strength signal. Early breakouts/reversals
//                   surface here, clearly marked as the lower-conviction tier.
//               Cards carry their `tier`; the page badges Tier-B picks.
//   3c. Tier C (Sentiment Discount) — a SEPARATE, always-on counter-trend track
//       that runs alongside the momentum ladder (not a relaxation of it). It
//       surfaces fundamentally sound, liquid blue chips (≥ Rp1T, non-bank) that
//       are oversold by market sentiment rather than broken: trend still intact
//       (price ≥ ~MA200), pulled back below MA50, RSI washed out (30–48), and
//       confirmed by decent fundamentals (ROE > 10%, PER 0–20, PBV < 3, DER <
//       1.5). On a red IHSG day many quality names qualify; on a strong day the
//       list is naturally thin or empty (correct — the market isn't discounting).
//       IHSG's own day change is fetched as context for the section header.
//   4. Rank   = velocity-first, then composite (the Momentum category's own rank)
//   5. Live   = for the top `count` finalists only: IDX stock-info (live price/
//               volume overlay) + as-of-session bandarmology, folded into score   [≤2 IDX req each]
//   6. Snapshot = a small JSON object the landing page renders.
//
// IDX request budget per scan ≈ 1 (movers) + count (stock-info) + count
// (bandarmology) ≈ 11 at count=5 — inside the BASIC ~1 req/s ceiling.

import { fetchSymbolChart, fetchFundamentals } from './marketData.js';
import { buildScreeningScore } from './analysis.js';
import { fetchMarketMovers, fetchStockInfo, fetchBandarmology } from './idxApi.js';
import { findEmiten } from './universe.js';
import { scanUniverse, mapLimit } from './screeningUniverse.js';
import { getCategory, matchesCategory } from './screeningCategories.js';
import { wibNow, marketStatus, owningScanSlot } from './marketHours.js';

const RANGE = '1y'; // enough history for MA200 / RSI(14)
const ENRICH_CONCURRENCY = 5; // Yahoo charts (free, proxied)
const LIVE_CONCURRENCY = 2; // IDX finalists (the serial 1.2s throttle dominates anyway)

const isBankName = (name) => /\bbank\b/i.test(name || '');

// ---- lean copies of the screening helpers (kept here so the serverless scan
// ---- doesn't import the AI-coupled screeningService.js) ----

// Trim a chart to the as-of candles and refresh the rolling 52-week extremes.
function asOfChart(chart, candles) {
  const recent = candles.slice(-252);
  return {
    ...chart,
    candles,
    fiftyTwoWeekHigh: recent.length ? Math.max(...recent.map((c) => c.high)) : chart.fiftyTwoWeekHigh,
    fiftyTwoWeekLow: recent.length ? Math.min(...recent.map((c) => c.low)) : chart.fiftyTwoWeekLow,
  };
}

// SAHAM LAMBAT (slow-stock) velocity gate: a name is "active" if ≥2 of
// {volume, ATR, price-move} clear their thresholds. Mirrors passesVelocity in
// screeningService.js.
function passesVelocity(candles) {
  if (!candles || candles.length < 6) return false;
  const today = candles[candles.length - 1];

  const volLookback = Math.min(20, candles.length);
  let volSum = 0;
  for (let i = candles.length - volLookback; i < candles.length; i++) volSum += candles[i].volume ?? 0;
  const avgVolume = volSum / volLookback;
  const todayVolume = today.volume ?? 0;
  const volRatio = avgVolume > 0 ? todayVolume / avgVolume : todayVolume > 0 ? 1 : 0;
  const volumeActive = volRatio >= 0.5;

  let trSum = 0;
  for (let i = candles.length - 5; i < candles.length; i++) {
    const c = candles[i];
    const pc = candles[i - 1]?.close ?? c.close;
    trSum += Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc));
  }
  const atrPct = today.close > 0 ? trSum / 5 / today.close : 0;
  const atrActive = atrPct >= 0.012;

  const c3 = candles[candles.length - 4]?.close;
  const move3 = c3 > 0 ? Math.abs((today.close - c3) / c3) : 0;
  const c21 = candles[candles.length - 22]?.close;
  const move1m = c21 > 0 ? Math.abs((today.close - c21) / c21) : 0;
  const priceActive = move3 >= 0.025 || move1m >= 0.08;

  return [volumeActive, atrActive, priceActive].filter(Boolean).length >= 2;
}

// Deep-enrich one ticker with a Yahoo chart and the locked screening score.
// Returns a scored candidate (carrying chart + emiten info for the bandar
// re-score), or null if unscoreable.
async function enrich(ticker, date) {
  const chart = await fetchSymbolChart(`${ticker}.JK`, RANGE);
  const asOfCandles = chart?.candles?.filter((c) => c.date <= date) ?? [];
  if (asOfCandles.length < 30) return null;
  const datedChart = asOfChart(chart, asOfCandles);
  const emitenInfo = findEmiten(ticker);

  let score;
  try {
    score = buildScreeningScore({
      code: ticker,
      requestedDate: date,
      chart: datedChart,
      fundamentals: null, // momentum doesn't need fundamentals
      emitenInfo,
      bandarmology: null,
    });
  } catch {
    return null;
  }

  // Today's turnover (close × volume on the last candle) and RVOL (today / MA20).
  // Computed here from candles because buildScreeningScore only exposes avgValueTraded20.
  const lastCandle = asOfCandles[asOfCandles.length - 1];
  const lastValueTraded = lastCandle ? lastCandle.close * (lastCandle.volume ?? 0) : 0;
  const volLookback = Math.min(20, asOfCandles.length);
  let volSum = 0;
  for (let i = asOfCandles.length - volLookback; i < asOfCandles.length; i++) volSum += asOfCandles[i].volume ?? 0;
  const avgVol20 = volLookback > 0 ? volSum / volLookback : 0;
  const rvol = avgVol20 > 0 ? (lastCandle?.volume ?? 0) / avgVol20 : 0;

  // ATR(14) for a live trading plan (entry / stop / targets).
  // Stop = max(10-day swing low, close − 1.5×ATR). T1 = close + 2×ATR, T2 = close + 3.5×ATR.
  const atrLookback = Math.min(14, asOfCandles.length - 1);
  let atrTotal = 0;
  for (let i = asOfCandles.length - atrLookback; i < asOfCandles.length; i++) {
    const c = asOfCandles[i];
    const prevClose = asOfCandles[i - 1]?.close ?? c.close;
    atrTotal += Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
  }
  const atr14 = atrLookback > 0 ? atrTotal / atrLookback : 0;
  const recentLows = asOfCandles.slice(-10).map((c) => c.low);
  const swingLow10 = recentLows.length ? Math.min(...recentLows) : lastCandle?.low ?? 0;
  const recentHighs = asOfCandles.slice(-10).map((c) => c.high);
  const swingHigh10 = recentHighs.length ? Math.max(...recentHighs) : lastCandle?.high ?? 0;
  const entryRef = lastCandle?.close ?? 0;
  const plan = entryRef > 0 && atr14 > 0 ? (() => {
    const stop = Math.max(swingLow10, entryRef - 1.5 * atr14);
    const t1 = entryRef + 2 * atr14;
    const t2 = entryRef + 3.5 * atr14;
    const rr = stop < entryRef ? (t1 - entryRef) / (entryRef - stop) : null;
    return { entry: entryRef, stop, t1, t2, rr, atr14Pct: atr14 / entryRef, swingHigh10 };
  })() : null;

  return {
    ...score,
    sector: emitenInfo?.sector ?? score.sector ?? null,
    fundamentals: null,
    bandarmology: null,
    turnover: score.avgValueTraded20 ?? 0,
    lastValueTraded,
    rvol,
    plan,
    velocityOk: passesVelocity(asOfCandles),
    reason: null,
    _chart: datedChart,
    _emitenInfo: emitenInfo,
    _asOfSession: asOfCandles[asOfCandles.length - 1]?.date ?? date,
  };
}

const round = (v, dp = 2) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10 ** dp) / 10 ** dp : v ?? null);

// Relaxed momentum for the ladder's Tier B: a DEVELOPING trend (price above MA50
// — not the full 50/200 golden stack) plus any one strength signal. Lets early
// breakouts / reversals backfill empty slots on thin days, clearly marked as the
// lower-conviction tier rather than leaving the page blank.
function passesDevelopingMomentum(d) {
  const s = d.signals ?? {};
  const developing =
    !!s.goldenTrend || (s.sma50 != null && d.close != null && d.close > s.sma50);
  if (!developing) return false;
  return (
    (s.volumeRatio != null && s.volumeRatio > 1) ||
    (s.rsi14 != null && s.rsi14 >= 50 && s.rsi14 <= 80) ||
    (d.oneMonth != null && d.oneMonth > 0)
  );
}

// Strict picks always rank ahead of relaxed backfill.
const TIER_RANK = { strict: 0, relaxed: 1 };

// Strip the heavy internals and shape a compact, JSON-safe card for the snapshot.
function serialize(d, category) {
  const b = d.bandarmology;
  const s = d.signals ?? {};
  return {
    ticker: d.ticker,
    name: d.name ?? null,
    sector: d.sector ?? null,
    board: d.board ?? null,
    capTier: d.capTier ?? null,
    marketCap: d.marketCap ?? null,
    close: d.close ?? null,
    oneMonth: d.oneMonth ?? null,
    turnover: d.turnover ?? null,
    composite: round(d.composite, 2),
    overallRating: d.overallRating ?? null,
    scores: d.scores
      ? { shortTerm: round(d.scores.shortTerm), midTerm: round(d.scores.midTerm), longTerm: round(d.scores.longTerm) }
      : null,
    signals: {
      rsi14: round(s.rsi14, 1),
      sma50: round(s.sma50, 2),
      sma200: round(s.sma200, 2),
      volumeRatio: round(s.volumeRatio, 2),
      goldenTrend: !!s.goldenTrend,
    },
    velocityOk: !!d.velocityOk,
    tier: d.tier ?? 'strict',
    rvol: round(d.rvol, 2),
    lastValueTraded: typeof d.lastValueTraded === 'number' ? Math.round(d.lastValueTraded) : null,
    plan: d.plan ? {
      entry: Math.round(d.plan.entry),
      stop: Math.round(d.plan.stop),
      t1: Math.round(d.plan.t1),
      t2: Math.round(d.plan.t2),
      rr: d.plan.rr != null ? Math.round(d.plan.rr * 10) / 10 : null,
      atr14Pct: Math.round(d.plan.atr14Pct * 1000) / 1000,
      swingHigh10: Math.round(d.plan.swingHigh10),
    } : null,
    reason: (() => {
      try {
        return category.describe(d);
      } catch {
        return d.reason ?? 'Momentum mover';
      }
    })(),
    // Live intraday overlay (null if the IDX call failed).
    live: d.live
      ? {
          last: d.live.last,
          changePct: d.live.changePct,
          volume: d.live.volume,
          value: d.live.value,
          marketHourStatus: d.live.marketHourStatus,
        }
      : null,
    // Compact bandarmology read for the Acc/Dist pill (null if no broker rows).
    bandarmology: b
      ? {
          accdist: b.accdist,
          top5Accdist: b.top5Accdist,
          top5NetValue: b.top5NetValue,
          date: b.date,
        }
      : null,
  };
}

// ---- Tier C — Sentiment Discount (standing counter-trend track) ----

// Today's IHSG (Jakarta Composite, ^JKSE) day change — context for the discount
// section header. One Yahoo chart (proxied, cheap). Returns { last, changePct } | null.
async function fetchIhsgContext(date) {
  try {
    const chart = await fetchSymbolChart('^JKSE', '1mo');
    const candles = (chart?.candles ?? []).filter((c) => c.date <= date);
    if (candles.length < 2) return null;
    const last = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    const changePct = prev.close > 0 ? ((last.close - prev.close) / prev.close) * 100 : null;
    return { last: last.close, changePct };
  } catch {
    return null;
  }
}

// Discount-flavored trading plan: you're buying weakness, so targets revert
// toward the mean (MA50) and the pre-selloff swing high — not breakout highs.
// Reuses the momentum plan's ATR/levels so we never re-walk candles.
function discountPlanFrom(d) {
  const p = d.plan;
  if (!p) return null;
  const sma50 = d.signals?.sma50 ?? null;
  const atr = p.atr14Pct * p.entry;
  const t1 = sma50 != null && sma50 > p.entry ? sma50 : p.entry + 2 * atr; // mean reversion
  const t2 = Math.max(p.swingHigh10, p.entry + 3.5 * atr); // back toward pre-selloff high
  const rr = p.stop < p.entry ? (t1 - p.entry) / (p.entry - p.stop) : null;
  return { entry: p.entry, stop: p.stop, t1, t2, rr, atr14Pct: p.atr14Pct, swingHigh10: p.swingHigh10 };
}

// Shape a compact, JSON-safe sentiment-discount card for the snapshot.
function serializeDiscount(d) {
  const f = d.fundamentals ?? {};
  const s = d.signals ?? {};
  const plan = discountPlanFrom(d);
  const depth = d._depth ?? 'strict';
  return {
    kind: 'discount',
    depth, // 'strict' (headline thesis) | 'shallow' (relaxed fallback tier)
    ticker: d.ticker,
    name: d.name ?? null,
    sector: d.sector ?? null,
    board: d.board ?? null,
    capTier: d.capTier ?? null,
    marketCap: d.marketCap ?? null,
    close: d.close ?? null,
    oneMonth: d.oneMonth ?? null,
    rsi14: round(s.rsi14, 1),
    sma50: round(s.sma50, 2),
    discountPct: d._discountGap != null ? Math.round(d._discountGap * 1000) / 10 : null, // % below MA50
    rvol: round(d.rvol, 2),
    lastValueTraded: typeof d.lastValueTraded === 'number' ? Math.round(d.lastValueTraded) : null,
    fundamentals: {
      per: round(f.per, 1),
      pbv: round(f.pbv, 2),
      roe: round(f.roe, 3),
      roa: round(f.roa, 3),
      debtToEquity: round(f.debtToEquity, 2),
    },
    plan: plan
      ? {
          entry: Math.round(plan.entry),
          stop: Math.round(plan.stop),
          t1: Math.round(plan.t1),
          t2: Math.round(plan.t2),
          rr: plan.rr != null ? Math.round(plan.rr * 10) / 10 : null,
          atr14Pct: Math.round(plan.atr14Pct * 1000) / 1000,
          swingHigh10: Math.round(plan.swingHigh10),
        }
      : null,
    live: d.live
      ? {
          last: d.live.last,
          changePct: d.live.changePct,
          volume: d.live.volume,
          value: d.live.value,
          marketHourStatus: d.live.marketHourStatus,
        }
      : null,
    reason: (() => {
      const parts = [];
      if (d._discountGap != null) {
        // The widened band lets a name sit just above MA50 (negative gap) — call
        // that "at MA50" rather than rendering a nonsensical negative discount.
        parts.push(d._discountGap > 0.001 ? `${(d._discountGap * 100).toFixed(1)}% below MA50` : 'at MA50');
      }
      if (s.rsi14 != null) parts.push(`RSI ${Math.round(s.rsi14)}`);
      if (f.roe != null) parts.push(`ROE ${(f.roe * 100).toFixed(0)}%`);
      if (f.per != null && f.per > 0) parts.push(`PER ${f.per.toFixed(1)}×`);
      const label = depth === 'shallow' ? 'Shallow discount' : 'Sentiment discount';
      return `${label} — ${parts.join(', ') || 'oversold quality'}`;
    })(),
  };
}

// Technical gate for the discount track, parameterized so the relaxation ladder
// can reuse it. `ma200Mult` is the falling-knife floor (close ≥ MA200 × mult),
// `bandMult` widens the "below the mean" band (close < MA50 × mult), `rsiCeil`
// caps how un-washed-out a name may still be. Liquidity/cap floors never relax.
function passesDiscountGate(d, { rsiCeil, ma200Mult, bandMult }) {
  const s = d.signals ?? {};
  if (d.marketCap == null || d.marketCap < 1e12) return false; // ≥ Rp1T
  if (d.lastValueTraded < 1e10) return false; // still tradable today
  if (s.sma200 == null || d.close == null) return false;
  if (d.close < s.sma200 * ma200Mult) return false; // trend NOT broken (falling-knife guard)
  if (s.sma50 == null || d.close >= s.sma50 * bandMult) return false; // below the mean = a discount
  if (s.rsi14 == null || s.rsi14 < 30 || s.rsi14 > rsiCeil) return false; // washed out, not catastrophic
  return true;
}

// STRICT first (the headline thesis), then SHALLOW as a one-notch fallback that
// only fires when STRICT is empty. STRICT already runs looser than the original
// gate: RSI ceiling 52 (was 48) and a 1% band around MA50 so names hovering at
// the mean still count.
const DISCOUNT_TIERS = [
  { depth: 'strict', rsiCeil: 52, ma200Mult: 0.97, bandMult: 1.01 },
  { depth: 'shallow', rsiCeil: 58, ma200Mult: 0.93, bandMult: 1.03 },
];

// Tier C screener. Seeds from the non-bank quality universe (≥ Rp1T, size-ranked
// — the blue-chip scan shape with a Rp1T floor), enriches with charts, gates on
// "oversold but intact", confirms with fundamentals, ranks by discount depth ×
// quality, and overlays a live IDX price for the finalists. Returns serialized
// discount cards (possibly empty — a strong day yields no discounts).
async function screenSentimentDiscounts(date, count) {
  const seedCategory = {
    ...getCategory('bluechip'),
    id: 'discount-seed',
    jauhi: true, // non-bank, drop ≥Rp100T mega-caps — consistent with the site's JAUHI identity
    capFloor: 1e12, // ≥ Rp 1T (quality scale)
    capCeil: null,
  };
  let scan;
  try {
    scan = await scanUniverse(date, { count, category: seedCategory, range: RANGE });
  } catch {
    return [];
  }
  const seed = scan.shortlist.slice(0, 45).map((s) => s.ticker);

  // Enrich (chart + locked score). Fundamentals are fetched later, only for the
  // technical survivors, to keep the request budget tight.
  const enriched = (
    await mapLimit(seed, ENRICH_CONCURRENCY, (t) => enrich(t, date).catch(() => null))
  ).filter(Boolean);

  // Cheap technical gate, run as a relaxation LADDER (mirrors the A/B momentum
  // track): take the STRICT tier if it yields anything, else fall back one notch
  // to a SHALLOW tier so the section still lights up on a fresh red regime —
  // where quality names have dipped under the mean but RSI hasn't washed all the
  // way out yet. Shallow finalists are tagged so the card can flag the lower bar.
  let oversold = [];
  for (const tier of DISCOUNT_TIERS) {
    const hits = enriched
      .filter((d) => passesDiscountGate(d, tier))
      .map((d) => ({ ...d, _depth: tier.depth }));
    if (hits.length > 0) {
      oversold = hits;
      break;
    }
  }
  if (oversold.length === 0) return [];

  // Confirm quality with fundamentals (Yahoo, cheap) — survivors only.
  const withFun = await mapLimit(oversold, ENRICH_CONCURRENCY, async (d) => {
    let f = null;
    try {
      f = await fetchFundamentals(d.ticker);
    } catch {
      /* degrade — a name with no fundamentals can't be called "quality" below */
    }
    return { ...d, fundamentals: f };
  });
  // Quality gate — IDX-calibrated, Yahoo-gap-tolerant.
  //
  // Yahoo's fundamentals API is patchy for .JK stocks: a null return means "no
  // data", NOT "bad company". Hard-failing on null silently killed most survivors.
  // Instead, treat null fundamentals as a soft pass (unknown quality is still
  // candidate quality); only KNOWN bad values are hard disqualifying.
  //
  // Thresholds are relaxed for IDX market reality:
  //   PER: ceiling raised to 25× (was 20×) — BBCA, TLKM etc. structurally trade >20×
  //   PBV: removed as a hard gate; used only in the scoring step below (many quality
  //        IDX consumer/finance names structurally exceed 3×)
  //   ROE: >10% still required IF known — the only ratio that truly signals quality
  //   DER: ≤2.0 (was 1.5) — telco/infra names carry structural leverage legitimately
  const quality = withFun.filter((d) => {
    const f = d.fundamentals;
    // null fundamentals = Yahoo gap, not a red flag — let it through
    if (!f) return true;
    if (f.roe != null && f.roe <= 0.1) return false; // known unprofitable → hard fail
    if (f.per != null && (f.per <= 0 || f.per > 25)) return false; // known loss-maker or expensive
    if (f.debtToEquity != null && f.debtToEquity > 2.0) return false; // excessive leverage
    return true;
  });
  if (quality.length === 0) return [];

  // Rank: deepest discount among the best quality (below-MA50 gap × ROE).
  const scored = quality.map((d) => {
    const gap = (d.signals.sma50 - d.close) / d.close;
    return { ...d, _discountGap: gap, _discountScore: gap * (d.fundamentals?.roe ?? 0) };
  });
  scored.sort((a, b) => b._discountScore - a._discountScore);
  const finalists = scored.slice(0, count);

  // Live IDX price overlay. Skip bandarmology here to stay inside the request
  // budget — the discount thesis is fundamental, not tape-driven.
  const withLive = await mapLimit(finalists, LIVE_CONCURRENCY, async (d) => {
    let live = null;
    try {
      live = await fetchStockInfo(d.ticker);
    } catch {
      /* best-effort */
    }
    return { ...d, live };
  });

  return withLive.map((d) => serializeDiscount(d));
}

// Run one auto-screen. `now` lets callers (and tests) pin the clock; otherwise
// it's the real time, projected to WIB for the date + scan-type labels.
export async function autoScreen({ count = 5, now = new Date() } = {}) {
  const w = wibNow(now);
  const date = w.dateStr; // WIB trading date drives the as-of scoring
  const category = getCategory('momentum');

  // 1a. Live seed — IDX trending movers (drop banks up front per JAUHI).
  let trending = [];
  try {
    trending = await fetchMarketMovers();
  } catch {
    /* no live movers — fall back to the scan seed below */
  }
  const trendingCodes = trending
    .filter((t) => t.tradeable && !isBankName(t.name))
    .map((t) => t.code);

  // 1b. Breadth seed — the Yahoo momentum universe shortlist (already JAUHI +
  // cap pre-filtered inside scanUniverse).
  let scan = { shortlist: [], universeSize: 0 };
  try {
    scan = await scanUniverse(date, { count: Math.max(count, 6), category, range: RANGE });
  } catch {
    /* universe scan failed — rely on the live trending seed */
  }
  const scanCodes = scan.shortlist.map((s) => s.ticker);

  const seed = Array.from(new Set([...trendingCodes, ...scanCodes]));

  // 2. Enrich every seed name (Yahoo, free, bounded concurrency).
  const enriched = (
    await mapLimit(seed, ENRICH_CONCURRENCY, (t) => enrich(t, date).catch(() => null))
  ).filter(Boolean);

  // 3. Tradability floor (ALWAYS holds), then the relaxation LADDER.
  // JAUHI + the Rp100M cap floor are non-negotiable — a bank, a ≥Rp100T
  // mega-cap, or a sub-Rp100M shell must never surface however thin the day.
  const tradable = enriched.filter((d) => {
    if (category.jauhi && (isBankName(d.name) || (d.marketCap != null && d.marketCap >= 1e14))) return false;
    // Null cap (missing emiten data) passes through rather than being silently dropped.
    if (d.marketCap != null && d.marketCap < 1e11) return false;
    return true;
  });

  // Tier A (strict): a real 2× volume spike + Rp10M turnover + full Momentum match.
  const strict = tradable.filter(
    (d) => d.lastValueTraded >= 1e10 && d.rvol >= 2 && matchesCategory(category, d),
  );

  // Tier B (relaxed): ONLY to backfill when Tier A can't fill `count`. Softer
  // money/spike floors (Rp5M / 1.5×) + a developing (price > MA50) trend.
  let pool = strict.map((d) => ({ ...d, tier: 'strict' }));
  if (pool.length < count) {
    const strictSet = new Set(strict.map((d) => d.ticker));
    const relaxed = tradable
      .filter(
        (d) =>
          !strictSet.has(d.ticker) &&
          d.lastValueTraded >= 5e9 &&
          d.rvol >= 1.5 &&
          passesDevelopingMomentum(d),
      )
      .map((d) => ({ ...d, tier: 'relaxed' }));
    pool = [...pool, ...relaxed];
  }

  // 4. Strict always outranks relaxed; within a tier, velocity-first then the
  // category's composite rank.
  const ordered = pool.sort((a, b) => {
    if (TIER_RANK[a.tier] !== TIER_RANK[b.tier]) return TIER_RANK[a.tier] - TIER_RANK[b.tier];
    if (a.velocityOk !== b.velocityOk) return a.velocityOk ? -1 : 1;
    return category.rank(a, b);
  });

  // 5. Finalists only (top `count`): live IDX overlay + as-of bandarmology,
  // folded back into the locked screening score.
  const finalists = ordered.slice(0, count);
  const withLive = await mapLimit(finalists, LIVE_CONCURRENCY, async (d) => {
    let live = null;
    let bandar = null;
    try {
      live = await fetchStockInfo(d.ticker);
    } catch {
      /* live overlay is best-effort */
    }
    try {
      bandar = await fetchBandarmology(d.ticker, { date: d._asOfSession });
    } catch {
      /* bandar is best-effort */
    }
    let folded = d;
    if (bandar && !bandar.empty) {
      try {
        const rs = buildScreeningScore({
          code: d.ticker,
          requestedDate: date,
          chart: d._chart,
          fundamentals: null,
          emitenInfo: d._emitenInfo,
          bandarmology: bandar,
        });
        folded = {
          ...d,
          composite: rs.composite,
          overallRating: rs.overallRating,
          scores: rs.scores,
          keyDriver: rs.keyDriver,
        };
      } catch {
        /* keep the bandar-free score if the re-score throws */
      }
    }
    return { ...folded, bandarmology: bandar && !bandar.empty ? bandar : null, live };
  });

  // Bandarmology can nudge scores within the surfaced set — re-sort, but keep
  // strict picks ahead of any relaxed backfill.
  withLive.sort((a, b) => {
    if (TIER_RANK[a.tier] !== TIER_RANK[b.tier]) return TIER_RANK[a.tier] - TIER_RANK[b.tier];
    return (b.composite ?? 0) - (a.composite ?? 0);
  });
  const candidates = withLive.map((d) => serialize(d, category));
  const relaxedShown = candidates.filter((c) => c.tier === 'relaxed').length;

  // Tier C (Sentiment Discount) + IHSG context — the standing counter-trend
  // track, run after the momentum overlay so their IDX calls don't interleave.
  const [ihsg, discounts] = await Promise.all([
    fetchIhsgContext(date),
    screenSentimentDiscounts(date, count),
  ]);

  const slot = owningScanSlot(now);
  return {
    generatedAt: new Date().toISOString(),
    wibDate: date,
    wibTime: w.hm,
    weekday: w.weekday,
    marketStatus: marketStatus(now),
    scanType: slot?.scanType ?? 'manual',
    scanSlot: slot?.slot ?? null,
    category: 'momentum',
    count: candidates.length,
    candidates,
    ihsg,
    discounts,
    summary:
      `Seeded ${trendingCodes.length} live movers + ${scanCodes.length} scan names ` +
      `(${seed.length} unique) → ${enriched.length} scored → ${tradable.length} tradable → ` +
      `${strict.length} strict` +
      (relaxedShown > 0 ? ` + ${relaxedShown} relaxed backfill` : '') +
      ` → top ${candidates.length}` +
      `; ${discounts.length} sentiment discount${discounts.length === 1 ? '' : 's'}` +
      (ihsg?.changePct != null ? ` (IHSG ${ihsg.changePct >= 0 ? '+' : ''}${ihsg.changePct.toFixed(2)}%)` : '') +
      `.`,
  };
}

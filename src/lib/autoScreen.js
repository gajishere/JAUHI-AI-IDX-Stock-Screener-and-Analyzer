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
//   3. Gate   = JAUHI (bank / ≥Rp100T) + liquidity floor + RVOL spike +
//               Momentum criteria + SAHAM LAMBAT velocity
//               Liquidity gates (tradability, not prestige):
//                 • marketCap ≥ Rp 100M  — drops zombie/shell stocks (< Rp 50M)
//                   while keeping genuinely active small-caps like SDMU
//                 • turnover today ≥ Rp 10M — minimum real-money flow so a
//                   Rp 50juta position can realistically enter AND exit
//                 • RVOL ≥ 2  — today's volume must be ≥ 2× MA20; ensures the
//                   activity is an anomaly (accumulation / breakout), not noise
//   4. Rank   = velocity-first, then composite (the Momentum category's own rank)
//   5. Live   = for the top `count` finalists only: IDX stock-info (live price/
//               volume overlay) + as-of-session bandarmology, folded into score   [≤2 IDX req each]
//   6. Snapshot = a small JSON object the landing page renders.
//
// IDX request budget per scan ≈ 1 (movers) + count (stock-info) + count
// (bandarmology) ≈ 11 at count=5 — inside the BASIC ~1 req/s ceiling.

import { fetchSymbolChart } from './marketData.js';
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

  // 3. JAUHI (cheap re-check on the scored data) + liquidity gates + Momentum criteria.
  const eligible = enriched.filter((d) => {
    // JAUHI: drop banks and mega-caps (≥ Rp 100T)
    if (category.jauhi && (isBankName(d.name) || (d.marketCap != null && d.marketCap >= 1e14))) return false;
    // Drop zombie / shell stocks below Rp 100 Miliar market cap.
    // Null cap (missing emiten data) passes through rather than being silently dropped.
    if (d.marketCap != null && d.marketCap < 1e11) return false;
    // Today's trading value must be ≥ Rp 10 Miliar so a Rp 50juta position can exit.
    if (d.lastValueTraded < 1e10) return false;
    // RVOL must be ≥ 2× MA20 — genuine accumulation spike, not ordinary drift.
    if (d.rvol < 2) return false;
    return true;
  });
  const matched = eligible.filter((d) => matchesCategory(category, d));

  // 4. Velocity-first ordering, then the category's composite rank.
  const fast = matched.filter((d) => d.velocityOk).sort(category.rank);
  const calm = matched.filter((d) => !d.velocityOk).sort(category.rank);
  const ordered = [...fast, ...calm];

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

  // Bandarmology can nudge scores within the surfaced set — re-sort.
  withLive.sort((a, b) => (b.composite ?? 0) - (a.composite ?? 0));
  const candidates = withLive.map((d) => serialize(d, category));

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
    summary:
      `Seeded ${trendingCodes.length} live movers + ${scanCodes.length} scan names ` +
      `(${seed.length} unique) → ${enriched.length} scored → ${eligible.length} passed liquidity gates → ` +
      `${matched.length} momentum matches → top ${candidates.length}.`,
  };
}

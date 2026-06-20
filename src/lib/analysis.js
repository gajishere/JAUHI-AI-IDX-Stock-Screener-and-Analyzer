// Analysis engine: turns real OHLCV history + fundamentals into the
// research-note structure the report pages render. The scoring engine itself
// computes on an internal 0.5–9 scale (pillar weights and narrative
// thresholds below are tuned to it); ratingFromScore() and toScoreTen()
// convert that internal scale to the 1–10 score shown to users — the same
// conversion both the Analysis and Screening pages use, so a "7.5" means the
// same thing everywhere and the letter grade always derives from it.
import { boardRisk, capTier, marketCap } from './universe.js';

// ---------- formatting ----------

export function formatRp(value, digits = 0) {
  if (value == null || !Number.isFinite(value)) return '—';
  return `Rp ${value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

export function formatRpCompact(value) {
  if (value == null || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1e12) return `Rp ${(value / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `Rp ${(value / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `Rp ${(value / 1e6).toFixed(1)}M`;
  return formatRp(value);
}

// Compact magnitude without a currency prefix — for dense tables (lot counts,
// share counts) where "Rp" would be noise.
export function formatCompact(value, digits = 1) {
  if (value == null || !Number.isFinite(value)) return '—';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(digits)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(digits)}M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(digits)}K`;
  return `${sign}${Math.round(abs).toLocaleString('en-US')}`;
}

export function formatPct(ratio, digits = 1) {
  if (ratio == null || !Number.isFinite(ratio)) return '—';
  const pct = ratio * 100;
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(digits)}%`;
}

// ---------- indicators ----------

function sma(values, period) {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function rsi(closes, period = 14) {
  if (closes.length < period + 1) return null;
  const slice = closes.slice(-(period + 1));
  let gains = 0;
  let losses = 0;
  for (let i = 1; i < slice.length; i++) {
    const change = slice[i] - slice[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }
  if (gains + losses === 0) return 50;
  return (gains / (gains + losses)) * 100;
}

function vwap(candles, period = 20) {
  const slice = candles.slice(-period);
  let pv = 0;
  let vol = 0;
  for (const c of slice) {
    const typical = (c.high + c.low + c.close) / 3;
    const v = c.volume ?? 0;
    pv += typical * v;
    vol += v;
  }
  return vol > 0 ? pv / vol : null;
}

// On-balance volume change across the last `period` sessions.
function obvDelta(candles, period = 20) {
  const slice = candles.slice(-(period + 1));
  let obv = 0;
  for (let i = 1; i < slice.length; i++) {
    const v = slice[i].volume ?? 0;
    if (slice[i].close > slice[i - 1].close) obv += v;
    else if (slice[i].close < slice[i - 1].close) obv -= v;
  }
  return obv;
}

// Convert bandarmology accdist string to a numeric score component
// Flow-pillar contribution from bandarmology. With the W-1 client-side
// aggregate the signal is richer than a single session, so this scores four
// real dimensions instead of just the accdist flag + broker count:
//   1. accdist headline        — derived from the week's net buy/sell ratio
//   2. net flow conviction     — week's net value as a share of week's total
//   3. top-5 concentration     — how much of the net move is big money
//   4. foreign flow direction  — foreigners net buying (positive tailwind)
// Each adds a bounded signed adjustment; the total clamps to ±2. Returns 0
// when bandar is null/empty so the Flow score degrades to volume/OBV only.
// (Now also the basis for the standalone Bandarmology pillar — see bandarScore.)
function bandarmologyScoreComponent(bandar) {
  if (!bandar || bandar.empty) return 0;

  let s = 0;

  // 1. accdist headline — directional base. "big" codes carry twice the weight
  // of plain acc/dist. Matches on "acc"/"dist" the same way accTone() does.
  const accdist = bandar.accdist?.toLowerCase() || '';
  if (accdist.includes('big') && accdist.includes('acc')) s += 1.8;
  else if (accdist.includes('big') && accdist.includes('dist')) s -= 1.8;
  else if (accdist.includes('acc')) s += 1.2;
  else if (accdist.includes('dist')) s -= 1.2;

  // 2. Net flow conviction — the week's net (buy − sell) value as a share of
  // the week's total traded value. This is the conviction measure the old
  // broker-COUNT ratio couldn't capture (10 small buyers ≠ 1 whale). A ±10%
  // net ratio is treated as full conviction; in between it scales linearly.
  //
  // IMPORTANT: use the API's accurate full-week totals (buyTotal/sellTotal)
  // when present — these are summed from the per-session det aggregates and
  // are NEVER truncated by the per-fetch `limit`. The buyRows/sellRows are
  // capped at `limit` per session, so summing them systematically under-counts
  // the long tail of smaller brokers on liquid tickers (the W-1 inaccuracy).
  // Rows are only a fallback for legacy single-day payloads without totals.
  const weekValue = numFinite(bandar.sessionValue) ? bandar.sessionValue : 0;
  const buyTotalFinite = numFinite(bandar.buyTotal);
  const sellTotalFinite = numFinite(bandar.sellTotal);
  const hasAccurateTotals = buyTotalFinite != null || sellTotalFinite != null;
  let totalBuy;
  let totalSell;
  if (hasAccurateTotals) {
    totalBuy = buyTotalFinite ?? 0;
    totalSell = sellTotalFinite ?? 0;
  } else {
    totalBuy = sumForeign(bandar.buyRows, false) + sumForeign(bandar.buyRows, true);
    totalSell = sumForeign(bandar.sellRows, false) + sumForeign(bandar.sellRows, true);
  }
  const totalBoth = totalBuy + totalSell;
  if (totalBoth > 0) {
    const netRatio = (totalBuy - totalSell) / totalBoth;
    const conviction = Math.max(-1, Math.min(1, netRatio / 0.1)); // ±10% = full
    s += conviction * 0.9; // up to ±0.9 from conviction alone
  } else if (weekValue > 0 && numFinite(bandar.top5NetValue)) {
    // Fall back to the precomputed top-5 net when the full tape isn't present
    // (e.g. a single-day legacy payload). Still a real magnitude signal.
    const netRatio = Math.max(-1, Math.min(1, bandar.top5NetValue / (weekValue * 0.5)));
    s += netRatio * 0.6;
  }

  // 3. Top-5 concentration — if the net move is concentrated among the top 5
  // brokers, it's institutional and more likely to persist. Reward magnitude of
  // the top-5 net relative to the week's total value; cap the contribution.
  if (weekValue > 0 && numFinite(bandar.top5NetValue)) {
    const concRatio = Math.max(-1, Math.min(1, bandar.top5NetValue / weekValue));
    s += concRatio * 0.4;
  }

  // 4. Foreign flow — foreigners net buying is a well-known IDX tailwind.
  // Uses the fuller buyRows/sellRows tape; absent on legacy single-day shapes.
  // (Foreign flag is per-broker, so this term still reads from rows — there's
  // no API total for foreign-only net. Acceptable: foreign flow is a secondary
  // term and the per-broker rows capture the largest foreign brokers fine.)
  const foreignNet = foreignNetValue(bandar);
  if (totalBoth > 0 && foreignNet !== null) {
    const fRatio = Math.max(-1, Math.min(1, foreignNet / totalBoth));
    s += fRatio * 0.5;
  }

  return Math.max(-2, Math.min(2, s));
}

function numFinite(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Sum the `value` field across rows, optionally filtered to foreign brokers.
function sumForeign(rows, foreign) {
  if (!Array.isArray(rows)) return 0;
  return rows.reduce((a, r) => (r && r.foreign === foreign ? a + (Number(r.value) || 0) : a), 0);
}

// Net (buy − sell) value attributable to foreign brokers across the tape.
// Returns null if the rows aren't present (legacy payloads), so callers can
// skip the foreign term gracefully.
function foreignNetValue(bandar) {
  if (!Array.isArray(bandar.buyRows) || !Array.isArray(bandar.sellRows)) return null;
  return sumForeign(bandar.buyRows, true) - sumForeign(bandar.sellRows, true);
}

// Bandarmology pillar — scores the W-1 broker read on the same internal
// 0.5–9 scale as the other pillars. Reuses the rich bandarmologyScoreComponent
// (accdist + net flow conviction + top-5 concentration + foreign direction)
// and scales its ±2 adjustment onto the pillar range so a confirmed
// accumulation week reads clearly bullish and a distribution week clearly
// bearish. The raw ±2 is multiplied by 1.5 before adding to the neutral 4.5,
// so a maxed signal reaches ~7.5 (clearly acc) or ~1.5 (clearly dist) — a
// "soft" pillar that can't single-handedly max or floor the composite.
// Returns null when bandar is missing/empty, so the composite renormalizes
// the remaining pillars and the locked score degrades gracefully.
function bandarScore(bandar) {
  if (!bandar || bandar.empty) return null;
  const component = bandarmologyScoreComponent(bandar);
  return clampScore(4.5 + component * 1.5);
}

// News sentiment pillar — scores the AI-classified news read on the same
// internal 0.5–9 scale as the other pillars. The AI returns a signed score
// (-1..+1) plus a confidence token (high/medium/low); this maps the pair onto
// the pillar range so news carries weight in the composite like any other
// signal, not just a nudge on Flow/Trend.
//
// Mapping: the AI's |score| × confidence weight sets how far from neutral
// (4.5) the pillar moves, capped so news alone can never max or floor the
// pillar — it stays a "soft" pillar relative to hard price/flow data. High
// confidence + strong direction → up to ~7.5 (clearly bullish) or ~1.5
// (clearly bearish); thin/contradictory news → stays near neutral.
function newsScore(news) {
  if (!news || news.score == null) return null; // missing pillar → renormalize
  const raw = Number(news.score);
  if (!Number.isFinite(raw)) return null;
  const magnitude = Math.min(1, Math.abs(raw));
  const conf = String(news.confidence || '').toLowerCase();
  const confMul = conf === 'high' ? 1 : conf === 'low' ? 0.4 : 0.7;
  // Max ±3.0 from neutral — meaningful but not enough to dominate alone.
  const offset = magnitude * confMul * 3.0;
  const s = 4.5 + (raw >= 0 ? offset : -offset);
  return clampScore(s);
}

function returnOver(closes, sessions) {
  if (closes.length <= sessions) return null;
  const past = closes[closes.length - 1 - sessions];
  if (!past) return null;
  return (closes[closes.length - 1] - past) / past;
}

// IDX auto-rejection band by price tier (symmetric ARA/ARB).
function autoRejectLimit(price) {
  if (price <= 200) return 0.35;
  if (price <= 5000) return 0.25;
  return 0.2;
}

const SCORE_FLOOR = 0.5;
const SCORE_CEIL = 9;
const clampScore = (s) => Math.max(SCORE_FLOOR, Math.min(SCORE_CEIL, s));

// Converts any raw score onto the public 1–10 scale. Defaults to the
// engine's internal 0.5–9 range; pass { rawMin: 0, rawMax: 100 } for an
// AI judge's 0–100 score so it lands on the exact same 1–10 scale.
export function toScoreTen(raw, rawMin = SCORE_FLOOR, rawMax = SCORE_CEIL) {
  if (raw == null || !Number.isFinite(raw)) return null;
  const ratio = (raw - rawMin) / (rawMax - rawMin);
  return Math.max(1, Math.min(10, 1 + ratio * 9));
}

export function computeIndicators(chart, asOfDate) {
  // Use only sessions on or before the analysis date.
  const candles = asOfDate
    ? chart.candles.filter((c) => c.date <= asOfDate)
    : chart.candles;
  if (candles.length < 30) {
    throw new Error(
      'Not enough trading history on or before that date — pick a more recent date.'
    );
  }

  const closes = candles.map((c) => c.close);
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];

  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const sma200 = sma(closes, 200);
  const rsi14 = rsi(closes);
  const vwap20 = vwap(candles);

  const recent20 = candles.slice(-20);
  const support = Math.min(...recent20.map((c) => c.low));
  const resistance = Math.max(...recent20.map((c) => c.high));
  const high3m = Math.max(...candles.slice(-63).map((c) => c.high));

  const limit = autoRejectLimit(prev.close);
  const araPrice = prev.close * (1 + limit);
  const arbPrice = prev.close * (1 - limit);

  const vol5 = sma(recent20.map((c) => c.volume ?? 0), 5);
  const vol20 = sma(recent20.map((c) => c.volume ?? 0), 20);
  const volumeRatio = vol20 > 0 ? vol5 / vol20 : 1;
  const obv20 = obvDelta(candles, 20);
  const avgValueTraded20 =
    recent20.reduce((a, c) => a + c.close * (c.volume ?? 0), 0) / recent20.length;
  const lastValueTraded = last.close * (last.volume ?? 0);

  return {
    candles,
    asOf: last.date,
    close: last.close,
    prevClose: prev.close,
    dayChange: (last.close - prev.close) / prev.close,
    sma20,
    sma50,
    sma200,
    rsi14,
    vwap20,
    support,
    resistance,
    high3m,
    araPrice,
    arbPrice,
    distanceToAra: (araPrice - last.close) / last.close,
    distanceToArb: (last.close - arbPrice) / last.close,
    oneWeek: returnOver(closes, 5),
    oneMonth: returnOver(closes, 21),
    threeMonths: returnOver(closes, 63),
    volumeRatio,
    obv20,
    avgValueTraded20,
    lastValueTraded,
  };
}

// ---------- pillar scores (0–9) ----------

function technicalScore(ind) {
  let s = 4.5;
  if (ind.rsi14 != null) {
    if (ind.rsi14 >= 55 && ind.rsi14 < 70) s += 1.5;
    else if (ind.rsi14 >= 45 && ind.rsi14 < 55) s += 0.5;
    else if (ind.rsi14 >= 70 && ind.rsi14 < 80) s += 0.5;
    else if (ind.rsi14 >= 80) s -= 1;
    else if (ind.rsi14 < 30) s -= 1;
    else s -= 0.5;
  }
  if (ind.vwap20 != null) s += ind.close >= ind.vwap20 ? 1 : -1;
  if (ind.sma20 != null) s += ind.close >= ind.sma20 ? 1 : -1;
  const headroom = (ind.resistance - ind.close) / ind.close;
  if (headroom > 0.05) s += 0.5;
  return clampScore(s);
}

function trendScore(ind) {
  let s = 4.5;
  if (ind.oneWeek != null) s += ind.oneWeek > 0 ? 0.75 : -0.75;
  if (ind.oneMonth != null) s += ind.oneMonth > 0 ? 1 : -1;
  if (ind.threeMonths != null) s += ind.threeMonths > 0 ? 1 : -1;
  if (ind.sma50 != null) s += ind.close >= ind.sma50 ? 0.75 : -0.75;
  if (ind.sma50 != null && ind.sma200 != null) s += ind.sma50 >= ind.sma200 ? 0.5 : -0.5;
  return clampScore(s);
}

// Each signed term that builds the Flow pillar, with a stable i18n-friendly
// key + a human label. Retained for reference / potential future surfacing;
function flowScore(ind) {
  let s = 4.5;
  if (ind.volumeRatio > 1.15) s += 1;
  else if (ind.volumeRatio < 0.85) s -= 1;
  s += ind.obv20 > 0 ? 1.25 : -1.25;
  if (ind.avgValueTraded20 > 5e10) s += 0.75; // > Rp 50B/day is institutionally liquid
  else if (ind.avgValueTraded20 < 1e9) s -= 0.75;
  if (ind.dayChange > 0 && ind.volumeRatio > 1) s += 0.5;

  // NOTE: bandarmology is now its own weighted pillar (see bandarScore +
  // TIMEFRAME_WEIGHTS), so it is intentionally NOT folded in here to avoid
  // double-counting.
  return clampScore(s);
}

// Scores the fundamental pillar from reported figures, with adjustments
// from the emiten reference data (listing-board risk and market-cap size).
function fundamentalScore(f, context = {}) {
  const { risk, cap } = context;
  // With no reported fundamentals, only score the pillar if the emiten
  // reference data itself carries signal (board risk / size).
  if (!f) {
    if (!risk && cap == null) return null;
    let s = 4.5;
    if (cap != null) s += cap >= 1e14 ? 0.75 : cap >= 1e13 ? 0.25 : cap < 1e12 ? -0.75 : 0;
    if (risk?.level === 'high') s -= 2.5;
    else if (risk?.level === 'elevated') s -= 1;
    else if (risk?.level === 'moderate') s -= 0.25;
    return clampScore(s);
  }
  let s = 4.5;
  if (f.per != null) {
    if (f.per > 0 && f.per < 15) s += 1.25;
    else if (f.per >= 15 && f.per < 25) s += 0.5;
    else if (f.per >= 35 || f.per <= 0) s -= 1.25;
  }
  if (f.revenueGrowth != null) {
    if (f.revenueGrowth > 0.15) s += 1.25;
    else if (f.revenueGrowth > 0.05) s += 0.5;
    else if (f.revenueGrowth < 0) s -= 1;
  }
  if (f.debtToEquity != null) {
    if (f.debtToEquity < 0.5) s += 1;
    else if (f.debtToEquity < 1.5) s += 0.25;
    else if (f.debtToEquity > 2.5) s -= 1;
  }
  if (f.eps != null) s += f.eps > 0 ? 0.5 : -1;
  // Emiten reference adjustments: large caps are sturdier; the Special
  // Monitoring board is a real risk flag.
  if (cap != null) s += cap >= 1e14 ? 0.5 : cap < 1e12 ? -0.5 : 0;
  if (risk?.level === 'high') s -= 2;
  else if (risk?.level === 'elevated') s -= 0.75;
  return clampScore(s);
}

// ---------- composite ratings ----------

// Expects a score on the public 1–10 scale (see toScoreTen). The letter
// bands are the same grading the app has always used; only the underlying
// number changed from 0.5–9 to 1–10.
export function ratingFromScore(score10) {
  if (score10 >= 9) return 'A+';
  if (score10 >= 8) return 'A';
  if (score10 >= 7) return 'B+';
  if (score10 >= 6) return 'B';
  if (score10 >= 5) return 'C+';
  if (score10 >= 4) return 'C';
  return 'D';
}

const PILLAR_LABELS = {
  technical: 'Technical',
  trend: 'Trend',
  flow: 'Flow & liquidity',
  fundamental: 'Fundamental',
  news: 'News & sentiment',
  bandarmology: 'Bandarmology (W-1)',
};

// Composite weights per timeframe, now spanning six pillars. Bandarmology (the
// weekly broker accumulation/distribution read) is weighted heaviest on the
// short horizon — broker positioning moves price fast — and lightest on the
// long horizon, where fundamentals dominate multi-quarter returns. Weights
// within each frame sum to 1.0; compositeRatings renormalizes if a pillar is
// missing (news/bandarmology fetch failed/disabled), so the locked score
// degrades gracefully.
const TIMEFRAME_WEIGHTS = {
  shortTerm: { technical: 0.35, flow: 0.25, trend: 0.1, news: 0.1, bandarmology: 0.2 },
  midTerm: { trend: 0.25, technical: 0.15, flow: 0.15, fundamental: 0.15, news: 0.1, bandarmology: 0.2 },
  longTerm: { fundamental: 0.4, trend: 0.2, technical: 0.1, news: 0.1, bandarmology: 0.1, flow: 0.1 },
};

export function compositeRatings(pillars) {
  const out = {};
  for (const [frame, weights] of Object.entries(TIMEFRAME_WEIGHTS)) {
    let total = 0;
    let weightSum = 0;
    // First pass: gather the present pillars and sum their raw weighted score
    // so we can compute the effective (renormalized) weight for each.
    const present = [];
    for (const [pillar, weight] of Object.entries(weights)) {
      const score = pillars[pillar];
      if (score == null) continue; // missing pillar -> renormalize the rest
      total += score * weight;
      weightSum += weight;
      present.push({ pillar, weight, score });
    }

    const score = weightSum > 0 ? total / weightSum : 0;
    const score10 = toScoreTen(score);

    // Per-pillar signed contribution to the public 1–10 score, measured against
    // a neutral baseline (4.5 internal = 5.7 on the 1–10 scale). Because the
    // internal 0.5–9 range maps to 1–10 via toScoreTen, one internal point is
    // worth 9/8.5 ≈ 1.06 public points; multiplying the pillar's deviation from
    // neutral by its effective weight gives a delta in 1–10 units that sums
    // (approximately) to (score10 − 5.7). Positive = lifting the rating, negative
    // = dragging it. Deltas are rounded so the UI reads cleanly.
    const INTERNAL_TO_PUBLIC = 9 / (SCORE_CEIL - SCORE_FLOOR);
    const NEUTRAL_INTERNAL = 4.5;
    const presentKeys = new Set(present.map((p) => p.pillar));
    const absent = Object.keys(weights)
      .filter((k) => !presentKeys.has(k))
      .map((k) => ({ key: k, label: PILLAR_LABELS[k], weight: null, score10: null, rating: null, delta10: null }));

    const pillarBreakdown = [
      ...present
        .map((p) => {
          const effectiveWeight = weightSum > 0 ? p.weight / weightSum : 0;
          const delta10 = (p.score - NEUTRAL_INTERNAL) * effectiveWeight * INTERNAL_TO_PUBLIC;
          const score10Pillar = toScoreTen(p.score);
          return {
            key: p.pillar,
            label: PILLAR_LABELS[p.pillar],
            weight: effectiveWeight,
            score10: score10Pillar,
            rating: ratingFromScore(score10Pillar),
            delta10: Number(delta10.toFixed(2)),
          };
        })
        .sort((a, b) => Math.abs(b.delta10) - Math.abs(a.delta10)),
      ...absent,
    ];

    // keyDriver = the pillar with the largest positive contribution (matches the
    // original "biggest contributor" semantics; falls back to largest-magnitude
    // if everything is negative).
    const keyDriver =
      pillarBreakdown.find((p) => p.delta10 >= 0)?.label ?? pillarBreakdown[0]?.label ?? null;

    out[frame] = { score, score10, rating: ratingFromScore(score10), keyDriver, pillarBreakdown };
  }
  return out;
}

export function scorePillars(ind, fundamentals, context = {}, bandarmology = null, news = null) {
  return {
    technical: technicalScore(ind),
    trend: trendScore(ind),
    flow: flowScore(ind),
    fundamental: fundamentalScore(fundamentals, context),
    news: newsScore(news),
    bandarmology: bandarScore(bandarmology),
  };
}

// ---------- narrative ----------

const direction = (r) => (r > 0 ? 'gained' : 'lost');

function rationaleText(ind, pillars, fundamentals) {
  const vwapSide = ind.close >= ind.vwap20 ? 'above' : 'below';
  const short =
    `Price is trading ${vwapSide} the 20-day VWAP with RSI at ${ind.rsi14?.toFixed(0)} ` +
    `and ${formatPct(ind.distanceToAra)} of headroom to the auto-rejection ceiling. ` +
    (pillars.flow >= 6
      ? 'Volume is running ahead of its 20-day pace, which supports near-term follow-through.'
      : pillars.flow <= 4
        ? 'Volume is running below its 20-day pace, so near-term moves may lack conviction.'
        : 'Volume is broadly in line with its recent average.');

  const mid =
    `The stock has ${direction(ind.oneMonth)} ${formatPct(ind.oneMonth)} over one month and ` +
    `${direction(ind.threeMonths)} ${formatPct(ind.threeMonths)} over three, ` +
    (ind.sma50 != null && ind.close >= ind.sma50
      ? 'holding above its 50-day average — the medium-term structure is constructive.'
      : 'sitting below its 50-day average — the medium-term structure needs repair.');

  let long;
  if (fundamentals) {
    const parts = [];
    if (fundamentals.per != null) parts.push(`trailing P/E of ${fundamentals.per.toFixed(1)}x`);
    if (fundamentals.revenueGrowth != null)
      parts.push(`revenue ${fundamentals.revenueGrowth >= 0 ? 'growth' : 'decline'} of ${formatPct(fundamentals.revenueGrowth)} YoY`);
    if (fundamentals.debtToEquity != null)
      parts.push(`debt-to-equity of ${fundamentals.debtToEquity.toFixed(2)}x`);
    long =
      `Fundamentals show ${parts.join(', ')}. ` +
      (pillars.fundamental >= 6.5
        ? 'The profile supports a long-term core position.'
        : pillars.fundamental >= 5
          ? 'The profile is adequate but not compelling at current levels.'
          : 'The profile argues for caution on a long-term horizon.');
  } else {
    long =
      'Published fundamentals were unavailable for this ticker, so the long-term view leans on price structure alone.';
  }

  return { shortTerm: short, midTerm: mid, longTerm: long };
}

function actionText(ind, ratings) {
  const entryLow = Math.max(ind.support, ind.vwap20 != null ? Math.min(ind.vwap20, ind.close) : ind.support);
  const short =
    ratings.shortTerm.score >= 6.5
      ? `Active trading viable — stage entries near ${formatRp(entryLow)} (VWAP/support zone), take profit toward ${formatRp(ind.resistance)}.`
      : ratings.shortTerm.score >= 5
        ? `Wait for confirmation — a close above ${formatRp(ind.sma20, 0)} (20-day average) on rising volume before sizing up.`
        : `Stand aside short term — momentum and flow do not support new entries yet.`;
  const mid =
    ratings.midTerm.score >= 6.5
      ? 'Accumulate gradually on dips while the price holds the 50-day average.'
      : ratings.midTerm.score >= 5
        ? 'Hold existing positions; add only on a reclaim of the 50-day average.'
        : 'Reduce into strength until the medium-term trend turns back up.';
  const long =
    ratings.longTerm.score >= 6.5
      ? 'Suitable as a core holding — add on weakness toward major support.'
      : ratings.longTerm.score >= 5
        ? 'Acceptable to hold, but demand a margin of safety before adding.'
        : 'Not a long-term candidate at current fundamentals and trend.';
  return { shortTerm: short, midTerm: mid, longTerm: long };
}

// ---------- report builder ----------

export function buildAnalysisReport({ code, requestedDate, chart, fundamentals, emitenInfo, bandarmology, news }) {
  const ind = computeIndicators(chart, requestedDate);
  const cap = marketCap(emitenInfo, ind.close);
  const risk = boardRisk(emitenInfo?.board);
  const pillars = scorePillars(ind, fundamentals, { risk, cap }, bandarmology, news);
  const ratings = compositeRatings(pillars);

  const sentimentScore = (ratings.shortTerm.score + ratings.midTerm.score) / 2;
  const sentiment = sentimentScore >= 6.25 ? 'Bullish' : sentimentScore <= 4.5 ? 'Bearish' : 'Neutral';

  const obvTone = ind.obv20 > 0 ? 'Accumulation' : ind.obv20 < 0 ? 'Distribution' : 'Balanced';
  const volumeTrend =
    ind.volumeRatio > 1.15 ? 'Increasing' : ind.volumeRatio < 0.85 ? 'Decreasing' : 'Stable';

  const fiftyTwoWeekPos =
    chart.fiftyTwoWeekHigh != null && chart.fiftyTwoWeekLow != null && chart.fiftyTwoWeekHigh > chart.fiftyTwoWeekLow
      ? (ind.close - chart.fiftyTwoWeekLow) / (chart.fiftyTwoWeekHigh - chart.fiftyTwoWeekLow)
      : null;

  return {
    ticker: code.toUpperCase(),
    name: emitenInfo?.name ?? chart.name,
    date: requestedDate,
    asOf: ind.asOf, // last trading session on or before the requested date
    sentiment,
    close: ind.close,
    dayChange: ind.dayChange,
    fiftyTwoWeekPos,
    profile: emitenInfo
      ? {
          listed: emitenInfo.listed,
          shares: emitenInfo.shares,
          board: emitenInfo.board,
          marketCap: cap,
          capTier: capTier(cap),
          risk,
        }
      : null,
    flow: {
      lastValueTraded: ind.lastValueTraded,
      avgValueTraded20: ind.avgValueTraded20,
      volumeTrend,
      interpretation: obvTone,
      rating: ratingFromScore(toScoreTen(pillars.flow)),
    },
    technical: {
      pricePosition: ind.vwap20 != null ? (ind.close >= ind.vwap20 ? 'Above 20-day VWAP' : 'Below 20-day VWAP') : '—',
      rsi14: ind.rsi14,
      distanceToAra: ind.distanceToAra,
      distanceToArb: ind.distanceToArb,
      support: ind.support,
      resistance: ind.resistance,
      vwapNote:
        ind.vwap20 != null
          ? `Last close ${formatRp(ind.close)} sits ${formatPct((ind.close - ind.vwap20) / ind.vwap20)} ${ind.close >= ind.vwap20 ? 'above' : 'below'} the 20-day VWAP of ${formatRp(ind.vwap20)}, with RSI(14) at ${ind.rsi14?.toFixed(0)}`
          : '',
      rating: ratingFromScore(toScoreTen(pillars.technical)),
    },
    fundamentals: fundamentals
      ? {
          eps: fundamentals.eps,
          per: fundamentals.per,
          revenueGrowth: fundamentals.revenueGrowth,
          debtToEquity: fundamentals.debtToEquity,
          rating: ratingFromScore(toScoreTen(pillars.fundamental)),
        }
      : null,
    trend: {
      oneWeek: ind.oneWeek,
      oneMonth: ind.oneMonth,
      threeMonths: ind.threeMonths,
      volumeTrend,
      rating: ratingFromScore(toScoreTen(pillars.trend)),
    },
    news:
      news && pillars.news != null
        ? {
            sentiment: news.sentiment,
            score: news.score,
            confidence: news.confidence,
            // Pillar score on the internal scale + its public rating, so the
            // News section can show a RatingBadge like the other pillars and
            // the composite already weighted it in via TIMEFRAME_WEIGHTS.
            pillarScore: pillars.news,
            rating: ratingFromScore(toScoreTen(pillars.news)),
            contributing: true,
          }
        : null,
    bandarmology:
      bandarmology && !bandarmology.empty && pillars.bandarmology != null
        ? {
            accdist: bandarmology.accdist,
            pillarScore: pillars.bandarmology,
            rating: ratingFromScore(toScoreTen(pillars.bandarmology)),
            contributing: true,
          }
        : null,
    overallRatings: ratings,
    briefRationale: rationaleText(ind, pillars, fundamentals),
    actionRecommendations: actionText(ind, ratings),
    keyLevels: {
      idealEntry:
        ind.vwap20 != null && ind.vwap20 > ind.support && ind.vwap20 < ind.close
          ? `${formatRp(ind.support)} – ${formatRp(ind.vwap20)}`
          : `${formatRp(ind.support)} – ${formatRp(ind.close)}`,
      stopLoss: formatRp(ind.support * 0.97),
      targetShortTerm: formatRp(ind.resistance),
      targetMidTerm: formatRp(Math.max(ind.high3m, ind.resistance)),
      targetLongTerm: formatRp(chart.fiftyTwoWeekHigh ?? Math.max(ind.high3m, ind.resistance)),
    },
    // Raw numeric levels — same values that feed the formatted keyLevels above,
    // exposed unrounded so the buy/hold verdict cards can compute P&L, upside,
    // and distance-to-stop without re-parsing the display strings.
    levels: {
      close: ind.close,
      support: ind.support,
      resistance: ind.resistance,
      stopLoss: Math.round(ind.support * 0.97),
      entryLow: ind.support,
      entryHigh:
        ind.vwap20 != null && ind.vwap20 > ind.support && ind.vwap20 < ind.close
          ? ind.vwap20
          : ind.close,
      targetShort: ind.resistance,
      targetMid: Math.max(ind.high3m, ind.resistance),
      targetLong: chart.fiftyTwoWeekHigh ?? Math.max(ind.high3m, ind.resistance),
    },
  };
}

// Compact scoring used by the screening page.
export function buildScreeningScore({ code, requestedDate, chart, fundamentals, emitenInfo, bandarmology, news }) {
  const ind = computeIndicators(chart, requestedDate);
  const cap = marketCap(emitenInfo, ind.close);
  const risk = boardRisk(emitenInfo?.board);
  const pillars = scorePillars(ind, fundamentals, { risk, cap }, bandarmology, news);
  const ratings = compositeRatings(pillars);
  // Weighted on the internal scale (matching each frame's narrative scoring),
  // then converted once to the public 1–10 figure shown in the screening table.
  const compositeRaw =
    ratings.shortTerm.score * 0.35 + ratings.midTerm.score * 0.35 + ratings.longTerm.score * 0.3;
  const composite = toScoreTen(compositeRaw);
  return {
    ticker: code.toUpperCase(),
    name: emitenInfo?.name ?? chart.name,
    board: emitenInfo?.board ?? null,
    capTier: capTier(cap),
    marketCap: cap,
    asOf: ind.asOf,
    close: ind.close,
    oneMonth: ind.oneMonth,
    avgValueTraded20: ind.avgValueTraded20, // Rp/day liquidity, for screening gates
    scores: {
      shortTerm: ratings.shortTerm.score,
      midTerm: ratings.midTerm.score,
      longTerm: ratings.longTerm.score,
    },
    composite,
    overallRating: ratingFromScore(composite),
    keyDriver: ratings.shortTerm.keyDriver,
    // Raw technical signals the screening categories filter on directly
    // (e.g. the Momentum/Swing golden-cross + RSI band + volume check).
    signals: {
      rsi14: ind.rsi14,
      sma50: ind.sma50,
      sma200: ind.sma200,
      volumeRatio: ind.volumeRatio,
      goldenTrend:
        ind.sma50 != null && ind.sma200 != null &&
        ind.close > ind.sma50 && ind.sma50 > ind.sma200,
    },
  };
}

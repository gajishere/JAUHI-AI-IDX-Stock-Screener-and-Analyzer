// Analysis engine: turns real OHLCV history + fundamentals into the
// research-note structure the report pages render. All scores are on a
// 0–9 scale; ratings derive from the weighted composite per timeframe.
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

const clampScore = (s) => Math.max(0.5, Math.min(9, s));

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

function flowScore(ind) {
  let s = 4.5;
  if (ind.volumeRatio > 1.15) s += 1;
  else if (ind.volumeRatio < 0.85) s -= 1;
  s += ind.obv20 > 0 ? 1.25 : -1.25;
  if (ind.avgValueTraded20 > 5e10) s += 0.75; // > Rp 50B/day is institutionally liquid
  else if (ind.avgValueTraded20 < 1e9) s -= 0.75;
  if (ind.dayChange > 0 && ind.volumeRatio > 1) s += 0.5;
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

export function ratingFromScore(score) {
  if (score >= 8.25) return 'A+';
  if (score >= 7.25) return 'A';
  if (score >= 6.25) return 'B+';
  if (score >= 5.25) return 'B';
  if (score >= 4.25) return 'C+';
  if (score >= 3.25) return 'C';
  return 'D';
}

const PILLAR_LABELS = {
  technical: 'Technical',
  trend: 'Trend',
  flow: 'Flow & liquidity',
  fundamental: 'Fundamental',
};

const TIMEFRAME_WEIGHTS = {
  shortTerm: { technical: 0.45, flow: 0.35, trend: 0.2 },
  midTerm: { trend: 0.35, technical: 0.25, flow: 0.2, fundamental: 0.2 },
  longTerm: { fundamental: 0.45, trend: 0.3, technical: 0.15, flow: 0.1 },
};

export function compositeRatings(pillars) {
  const out = {};
  for (const [frame, weights] of Object.entries(TIMEFRAME_WEIGHTS)) {
    let total = 0;
    let weightSum = 0;
    let keyDriver = null;
    let bestContribution = -Infinity;
    for (const [pillar, weight] of Object.entries(weights)) {
      const score = pillars[pillar];
      if (score == null) continue; // missing pillar -> renormalize the rest
      total += score * weight;
      weightSum += weight;
      if (score * weight > bestContribution) {
        bestContribution = score * weight;
        keyDriver = PILLAR_LABELS[pillar];
      }
    }
    const score = weightSum > 0 ? total / weightSum : 0;
    out[frame] = { score, rating: ratingFromScore(score), keyDriver };
  }
  return out;
}

export function scorePillars(ind, fundamentals, context = {}) {
  return {
    technical: technicalScore(ind),
    trend: trendScore(ind),
    flow: flowScore(ind),
    fundamental: fundamentalScore(fundamentals, context),
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

export function buildAnalysisReport({ code, requestedDate, chart, fundamentals, emitenInfo }) {
  const ind = computeIndicators(chart, requestedDate);
  const cap = marketCap(emitenInfo, ind.close);
  const risk = boardRisk(emitenInfo?.board);
  const pillars = scorePillars(ind, fundamentals, { risk, cap });
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
      rating: ratingFromScore(pillars.flow),
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
      rating: ratingFromScore(pillars.technical),
    },
    fundamentals: fundamentals
      ? {
          eps: fundamentals.eps,
          per: fundamentals.per,
          revenueGrowth: fundamentals.revenueGrowth,
          debtToEquity: fundamentals.debtToEquity,
          rating: ratingFromScore(pillars.fundamental),
        }
      : null,
    trend: {
      oneWeek: ind.oneWeek,
      oneMonth: ind.oneMonth,
      threeMonths: ind.threeMonths,
      volumeTrend,
      rating: ratingFromScore(pillars.trend),
    },
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
  };
}

// Compact scoring used by the screening page.
export function buildScreeningScore({ code, requestedDate, chart, fundamentals, emitenInfo }) {
  const ind = computeIndicators(chart, requestedDate);
  const cap = marketCap(emitenInfo, ind.close);
  const risk = boardRisk(emitenInfo?.board);
  const pillars = scorePillars(ind, fundamentals, { risk, cap });
  const ratings = compositeRatings(pillars);
  const composite =
    ratings.shortTerm.score * 0.35 + ratings.midTerm.score * 0.35 + ratings.longTerm.score * 0.3;
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
  };
}

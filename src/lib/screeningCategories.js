// Screening categories — the strategy presets that drive the screener.
//
// Each category is a self-contained descriptor: how to rank the universe at
// Tier 1 (close-price scan), how deep a shortlist to enrich, whether the
// JAUHI bank/blue-chip exclusions apply, whether Tier 2 must fetch
// fundamentals, and the per-criterion Tier-2 checks + ranking on the enriched
// data. The hard filter is derived from `criteria()` so the pass/fail logic
// and the "why isn't this recommended?" breakdown never drift apart.
//
// The enriched candidate `d` passed to criteria()/rank()/describe() looks like:
//   { ticker, name, board, sector, capTier, marketCap, close, oneMonth,
//     composite, scores:{shortTerm,midTerm,longTerm}, turnover, velocityOk,
//     beta,  // 1Y beta vs IHSG, only for categories with beta:true
//     signals:{ rsi14, sma50, sma200, volumeRatio, goldenTrend },
//     fundamentals:{ per, pbv, roe, roa, revenueGrowth, netProfitGrowth,
//                    debtToEquity, dividendYield, payoutRatio, netIncome, eps,
//                    dividendYears, consecutiveDividendYears } | null }

import { formatPct, formatRpCompact } from './analysis.js';
import { conglomerateGroup, CONGLOMERATE_TICKERS } from '../data/conglomerates.js';

// ---------- market-cap tiers (replaces the old min/max Rp inputs) ----------
// Thresholds mirror capTier() in universe.js so labels stay consistent.
export const CAP_TIERS = [
  { id: 'every', label: 'Every cap', min: null, max: null },
  { id: 'micro', label: 'Micro cap', min: null, max: 1e12 }, // < Rp 1T
  { id: 'small', label: 'Small cap', min: 1e12, max: 1e13 }, // Rp 1T–10T
  { id: 'mid', label: 'Mid cap', min: 1e13, max: 1e14 }, //    Rp 10T–100T
  { id: 'big', label: 'Big cap', min: 1e14, max: null }, //    ≥ Rp 100T
];

export function capTierBounds(id) {
  return CAP_TIERS.find((t) => t.id === id) ?? CAP_TIERS[0];
}

const pct = (v) => (v == null ? 'n/a' : formatPct(v));
const num = (v, d = 1) => (v == null ? 'n/a' : v.toFixed(d));
const xVal = (v, d = 1) => (v == null ? 'n/a' : `${v.toFixed(d)}x`);

// ---------- category descriptors ----------

export const CATEGORIES = [
  {
    id: 'bluechip',
    label: 'Blue Chip & High Liquidity',
    blurb:
      'Top-tier, deeply liquid names (LQ45/IDX30 territory). Safe for larger capital — overrides the usual bank/blue-chip exclusion.',
    tier1: 'size', // rank the universe by size/structure, not raw momentum
    jauhi: false, // the whole point — surface the blue chips JAUHI normally drops
    fundamentals: true, // for ROA
    velocity: false,
    capFloor: 1e13, // ≥ Rp 10T regardless of the cap-tier selector
    capCeil: null,
    criteria: (d) => [
      { label: 'Market cap ≥ Rp 10T', ok: d.marketCap != null && d.marketCap >= 1e13, detail: formatRpCompact(d.marketCap) },
      { label: 'Turnover ≥ Rp 5B/day', ok: (d.turnover ?? 0) >= 5e9, detail: `${formatRpCompact(d.turnover)}/day` },
    ],
    rank: (a, b) => b.turnover - a.turnover, // most liquid first
    describe: (d) =>
      `Blue chip — ${formatRpCompact(d.marketCap)} cap, ${formatRpCompact(d.turnover)}/day` +
      (d.fundamentals?.roa != null ? `, ROA ${pct(d.fundamentals.roa)}` : ''),
  },
  {
    id: 'value',
    label: 'Value Investing',
    blurb: 'Fundamentally sound but cheap: low P/E and P/BV, healthy ROE, modest debt.',
    tier1: 'size',
    jauhi: true,
    fundamentals: true,
    velocity: false,
    capFloor: null,
    capCeil: null,
    criteria: (d) => {
      const f = d.fundamentals;
      return [
        { label: 'PER < 10x', ok: !!f && f.per != null && f.per > 0 && f.per < 10, detail: f && f.per != null ? xVal(f.per) : 'n/a' },
        { label: 'PBV < 1x', ok: !!f && f.pbv != null && f.pbv > 0 && f.pbv < 1, detail: f && f.pbv != null ? xVal(f.pbv, 2) : 'n/a' },
        { label: 'ROE > 10%', ok: !!f && f.roe != null && f.roe > 0.1, detail: f ? pct(f.roe) : 'n/a' },
        { label: 'DER < 1x', ok: !!f && (f.debtToEquity == null || f.debtToEquity < 1), detail: f && f.debtToEquity != null ? xVal(f.debtToEquity, 2) : 'n/a' },
      ];
    },
    // Cheapest first, blending P/BV and P/E.
    rank: (a, b) =>
      a.fundamentals.pbv * a.fundamentals.per - b.fundamentals.pbv * b.fundamentals.per,
    describe: (d) =>
      `Value — PER ${xVal(d.fundamentals.per)}, PBV ${xVal(d.fundamentals.pbv, 2)}, ROE ${pct(d.fundamentals.roe)}`,
  },
  {
    id: 'growth',
    label: 'Growth',
    blurb: 'Rapid expanders: strong net-profit and revenue growth, high ROE, with room for expansion debt.',
    tier1: 'size',
    jauhi: true,
    fundamentals: true,
    velocity: false,
    capFloor: null,
    capCeil: null,
    criteria: (d) => {
      const f = d.fundamentals;
      return [
        { label: 'Net profit growth > 15% YoY', ok: !!f && f.netProfitGrowth != null && f.netProfitGrowth > 0.15, detail: f ? pct(f.netProfitGrowth) : 'n/a' },
        { label: 'Revenue growth > 10% YoY', ok: !!f && f.revenueGrowth != null && f.revenueGrowth > 0.1, detail: f ? pct(f.revenueGrowth) : 'n/a' },
        { label: 'ROE > 15%', ok: !!f && f.roe != null && f.roe > 0.15, detail: f ? pct(f.roe) : 'n/a' },
        { label: 'DER < 1.5x', ok: !!f && (f.debtToEquity == null || f.debtToEquity < 1.5), detail: f && f.debtToEquity != null ? xVal(f.debtToEquity, 2) : 'n/a' },
      ];
    },
    rank: (a, b) => b.fundamentals.netProfitGrowth - a.fundamentals.netProfitGrowth,
    describe: (d) =>
      `Growth — net profit ${pct(d.fundamentals.netProfitGrowth)} YoY, revenue ${pct(d.fundamentals.revenueGrowth)} YoY, ROE ${pct(d.fundamentals.roe)}`,
  },
  {
    id: 'dividend',
    label: 'Dividend Hunter',
    blurb: 'Passive income: high yield with a sustainable payout ratio, backed by positive earnings.',
    tier1: 'size',
    jauhi: true,
    fundamentals: true,
    velocity: false,
    capFloor: null,
    capCeil: null,
    criteria: (d) => {
      const f = d.fundamentals;
      return [
        { label: 'Dividend yield > 5%', ok: !!f && f.dividendYield != null && f.dividendYield > 0.05, detail: f && f.dividendYield != null ? pct(f.dividendYield) : 'n/a' },
        { label: 'Payout ratio 30–80%', ok: !!f && f.payoutRatio != null && f.payoutRatio >= 0.3 && f.payoutRatio <= 0.8, detail: f && f.payoutRatio != null ? pct(f.payoutRatio) : 'n/a' },
        { label: 'Positive net income', ok: !!f && f.netIncome != null && f.netIncome > 0, detail: f && f.netIncome != null ? formatRpCompact(f.netIncome) : 'n/a' },
      ];
    },
    rank: (a, b) => b.fundamentals.dividendYield - a.fundamentals.dividendYield,
    describe: (d) =>
      `Dividend — yield ${pct(d.fundamentals.dividendYield)}, payout ${pct(d.fundamentals.payoutRatio)}`,
  },
  {
    id: 'momentum',
    label: 'Momentum / Swing',
    blurb: 'Trend followers: price above a rising 50/200 stack, RSI in the strong-but-not-overbought band, volume confirming.',
    tier1: 'momentum',
    jauhi: true,
    fundamentals: false,
    velocity: true,
    capFloor: null,
    capCeil: null,
    criteria: (d) => {
      const s = d.signals ?? {};
      return [
        { label: 'Uptrend: price > MA50 > MA200', ok: !!s.goldenTrend, detail: s.goldenTrend ? 'aligned' : 'not aligned' },
        { label: 'RSI(14) between 50 and 65', ok: s.rsi14 != null && s.rsi14 >= 50 && s.rsi14 <= 65, detail: s.rsi14 != null ? num(s.rsi14, 0) : 'n/a' },
        { label: 'Volume > 20-day average', ok: s.volumeRatio != null && s.volumeRatio > 1, detail: s.volumeRatio != null ? `${num(s.volumeRatio, 2)}×` : 'n/a' },
      ];
    },
    rank: (a, b) => (b.composite ?? 0) - (a.composite ?? 0),
    describe: (d) =>
      `Momentum — RSI ${num(d.signals.rsi14, 0)}, vol ${num(d.signals.volumeRatio, 2)}× avg, uptrend stack`,
  },
  {
    id: 'penny',
    label: 'Penny Stocks',
    blurb:
      'Speculative small-cap movers — fast, thin names ranked on raw momentum. High risk; was the old (mislabeled) "Liquid names" default.',
    tier1: 'momentum',
    jauhi: true,
    fundamentals: false,
    velocity: true,
    capFloor: null,
    capCeil: 1e13, // micro + small only (< Rp 10T)
    criteria: (d) => [
      { label: 'Market cap < Rp 10T (small/micro)', ok: d.marketCap == null || d.marketCap < 1e13, detail: formatRpCompact(d.marketCap) },
    ],
    rank: (a, b) => (b.composite ?? 0) - (a.composite ?? 0),
    describe: (d) => d.reason ?? `Penny — ${d.capTier ?? 'small cap'} momentum mover`,
  },
  {
    id: 'conglomerate',
    label: 'Conglomerate / Holding',
    blurb:
      'Diversified giants — the listed arms of Indonesia’s major holding groups (Astra, Salim, Barito, Sinar Mas…). Built-in cross-sector diversification, often trading at a conglomerate discount.',
    tier1: 'size',
    jauhi: false, // members include banks (BBCA) + ≥Rp100T blue chips (ASII) — JAUHI would empty the list
    fundamentals: true,
    velocity: false,
    beta: true, // needs the 1Y beta-vs-IHSG computed at enrich time
    dividendHistory: true, // needs multi-year dividend consistency
    members: CONGLOMERATE_TICKERS, // Tier-1 universe restricted to known group issuers
    capFloor: 2e13, // > Rp 20T regardless of the cap-tier selector
    capCeil: null,
    criteria: (d) => {
      const f = d.fundamentals;
      const grp = conglomerateGroup(d.ticker);
      return [
        { label: 'Part of a major conglomerate group', ok: !!grp, detail: grp ? grp.group : 'not in group list' },
        { label: 'Market cap > Rp 20T', ok: d.marketCap != null && d.marketCap > 2e13, detail: formatRpCompact(d.marketCap) },
        { label: 'PBV < 1.5x', ok: !!f && f.pbv != null && f.pbv > 0 && f.pbv < 1.5, detail: f && f.pbv != null ? xVal(f.pbv, 2) : 'n/a' },
        { label: 'Beta (1Y) < 1.1', ok: d.beta != null && d.beta < 1.1, detail: d.beta != null ? xVal(d.beta, 2) : 'n/a' },
        { label: 'Dividends ≥ 5 consecutive years', ok: !!f && f.consecutiveDividendYears != null && f.consecutiveDividendYears >= 5, detail: f && f.consecutiveDividendYears != null ? `${f.consecutiveDividendYears} yr` : 'n/a' },
      ];
    },
    rank: (a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0), // biggest, most resilient giants first
    describe: (d) => {
      const grp = conglomerateGroup(d.ticker);
      const f = d.fundamentals;
      return (
        `Conglomerate${grp ? ` (${grp.group})` : ''} — ${formatRpCompact(d.marketCap)} cap` +
        (f?.pbv != null ? `, PBV ${xVal(f.pbv, 2)}` : '') +
        (d.beta != null ? `, beta ${xVal(d.beta, 2)}` : '') +
        (f?.consecutiveDividendYears != null ? `, ${f.consecutiveDividendYears}y dividends` : '')
      );
    },
  },
];

export const DEFAULT_CATEGORY = 'bluechip';

export function getCategory(id) {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES.find((c) => c.id === DEFAULT_CATEGORY);
}

// Single source of truth for "does this enriched name pass the category?" —
// every criterion must hold. Used both by the screen and the diagnostic.
export function matchesCategory(category, d) {
  try {
    return category.criteria(d).every((c) => c.ok);
  } catch {
    return false;
  }
}

// Tier-2 shortlist depth. Fundamental screens have no fundamental signal at
// Tier 1 (close-only scan), so they must enrich a deeper pool to find enough
// matches; momentum screens float their picks to the top and stay lean.
export function shortlistSizeFor(category, count) {
  if (category.fundamentals) return Math.min(Math.max(count * 12, 60), 110);
  return Math.min(Math.max(count * 8, 45), 80);
}

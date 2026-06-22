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

// Union span of multiple tier IDs. Returns {min, max} safe for pre-filtering:
// null min means no floor, null max means no ceiling.
export function capTiersBounds(ids) {
  const list = Array.isArray(ids) ? ids : ids ? [ids] : [];
  if (!list.length || list.includes('every')) return { min: null, max: null };
  const bounds = list.map((id) => capTierBounds(id));
  const mins = bounds.map((b) => b.min).filter((v) => v != null);
  const maxs = bounds.map((b) => b.max).filter((v) => v != null);
  return {
    min: mins.length === bounds.length ? Math.min(...mins) : null,
    max: maxs.length === bounds.length ? Math.max(...maxs) : null,
  };
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
      'Top-tier, deeply liquid names (LQ45/IDX30 territory). Safe for larger capital — overrides the usual bank/blue-chip exclusion. · Estimated time ~14s.',
    tier1: 'size', // rank the universe by size/structure, not raw momentum
    jauhi: false, // the whole point — surface the blue chips JAUHI normally drops
    fundamentals: true, // for ROA
    velocity: false,
    capFloor: 1e13, // ≥ Rp 10T regardless of the cap-tier selector
    capCeil: null,
    criteria: (d) => [
      { label: 'Market cap ≥ Rp 10T', ok: d.marketCap != null && d.marketCap >= 1e13, detail: formatRpCompact(d.marketCap) },
      { label: 'Turnover ≥ Rp 5B/day', ok: (d.turnover ?? 0) >= 5e9, detail: `${formatRpCompact(d.turnover)}/day` },
      { label: 'Profitable: ROA > 0', ok: d.fundamentals?.roa == null || d.fundamentals.roa > 0, detail: d.fundamentals?.roa != null ? pct(d.fundamentals.roa) : 'n/a' },
    ],
    rank: (a, b) => b.turnover - a.turnover, // most liquid first
    describe: (d) =>
      `Blue chip — ${formatRpCompact(d.marketCap)} cap, ${formatRpCompact(d.turnover)}/day` +
      (d.fundamentals?.roa != null ? `, ROA ${pct(d.fundamentals.roa)}` : ''),
  },
  {
    id: 'value',
    label: 'Value Investing',
    blurb: 'Fundamentally sound but cheap: modest P/E and P/BV, healthy ROE, controlled debt. The deliberately strict, defensive corner of the screener. · Estimated time ~13s.',
    tier1: 'size',
    jauhi: true,
    fundamentals: true,
    velocity: false,
    capFloor: null,
    capCeil: null,
    criteria: (d) => {
      const f = d.fundamentals;
      return [
        { label: 'PER < 15x', ok: !!f && f.per != null && f.per > 0 && f.per < 15, detail: f && f.per != null ? xVal(f.per) : 'n/a' },
        { label: 'PBV < 1.5x', ok: !!f && f.pbv != null && f.pbv > 0 && f.pbv < 1.5, detail: f && f.pbv != null ? xVal(f.pbv, 2) : 'n/a' },
        { label: 'ROE > 10%', ok: !!f && f.roe != null && f.roe > 0.1, detail: f ? pct(f.roe) : 'n/a' },
        { label: 'DER < 1.5x', ok: !!f && (f.debtToEquity == null || f.debtToEquity < 1.5), detail: f && f.debtToEquity != null ? xVal(f.debtToEquity, 2) : 'n/a' },
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
    blurb: 'Rapid expanders: one strong growth engine and a balance sheet that can carry expansion debt, then any 2 of 3 quality gates (profitability, operating leverage, momentum) — so explosive top-line or turnaround names aren’t blocked by a single defensive rule. · Estimated time ~12s.',
    tier1: 'size',
    jauhi: true,
    fundamentals: true,
    velocity: false,
    capFloor: null,
    capCeil: null,
    // Mandatory: one clear growth engine (revenue OR profit, not both) + a
    // balance sheet that isn't broken. Flexible "any 2 of 3" then lets a pure
    // top-line grower or a turnaround qualify through momentum/operating
    // leverage without also demanding blue-chip ROE up front.
    flexibleMin: 2,
    criteria: (d) => {
      const f = d.fundamentals;
      const s = d.signals ?? {};
      const engine =
        !!f && ((f.netProfitGrowth != null && f.netProfitGrowth > 0.2) || (f.revenueGrowth != null && f.revenueGrowth > 0.25));
      const leverage =
        !!f &&
        ((f.netProfitGrowth != null && f.revenueGrowth != null && f.netProfitGrowth > f.revenueGrowth) ||
          (f.roa != null && f.roa > 0.05));
      const trending = !!s.goldenTrend || (d.oneMonth != null && d.oneMonth > 0);
      return [
        {
          label: 'Growth engine: net profit > 20% or revenue > 25% YoY',
          ok: engine,
          detail: f ? `NP ${pct(f.netProfitGrowth)}, rev ${pct(f.revenueGrowth)}` : 'n/a',
        },
        { label: 'DER < 2.5x', ok: !!f && (f.debtToEquity == null || f.debtToEquity < 2.5), detail: f && f.debtToEquity != null ? xVal(f.debtToEquity, 2) : 'n/a' },
        { label: 'ROE > 12%', flexible: true, ok: !!f && f.roe != null && f.roe > 0.12, detail: f ? pct(f.roe) : 'n/a' },
        {
          label: 'Operating leverage: profit outgrowing revenue or ROA > 5%',
          flexible: true,
          ok: leverage,
          detail: f && f.roa != null ? `ROA ${pct(f.roa)}` : 'n/a',
        },
        {
          label: 'Momentum: uptrend stack or positive 1-month return',
          flexible: true,
          ok: trending,
          detail: s.goldenTrend ? 'uptrend stack' : d.oneMonth != null ? pct(d.oneMonth) : 'n/a',
        },
      ];
    },
    rank: (a, b) => (b.fundamentals.netProfitGrowth ?? 0) - (a.fundamentals.netProfitGrowth ?? 0),
    describe: (d) =>
      `Growth — net profit ${pct(d.fundamentals.netProfitGrowth)} YoY, revenue ${pct(d.fundamentals.revenueGrowth)} YoY, ROE ${pct(d.fundamentals.roe)}`,
  },
  {
    id: 'dividend',
    label: 'Dividend Hunter',
    blurb: 'Passive income: high yield with a sustainable payout ratio, backed by positive earnings. · Estimated time ~12s.',
    tier1: 'size',
    jauhi: true,
    fundamentals: true,
    velocity: false,
    capFloor: null,
    capCeil: null,
    criteria: (d) => {
      const f = d.fundamentals;
      return [
        { label: 'Dividend yield > 4%', ok: !!f && f.dividendYield != null && f.dividendYield > 0.04, detail: f && f.dividendYield != null ? pct(f.dividendYield) : 'n/a' },
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
    blurb: 'Trend followers: a rising 50/200 stack on confirming volume, then any 1 of 2 strength signals (RSI in the trend-leader band or a positive 1-month return). RSI now reaches into 55–78 so the strongest leaders aren’t cut off at the top. · Estimated time ~7s.',
    tier1: 'momentum',
    jauhi: true,
    fundamentals: false,
    velocity: true,
    capFloor: null,
    capCeil: null,
    // Mandatory: the trend itself (uptrend stack + volume confirmation) — the
    // core thesis. Flexible "any 1 of 2": RSI strength OR raw 1-month return,
    // with the RSI ceiling lifted to 78 because in a strong IDX uptrend healthy
    // leaders sit at 60–75, not below 65.
    flexibleMin: 1,
    criteria: (d) => {
      const s = d.signals ?? {};
      return [
        { label: 'Uptrend: price > MA50 > MA200', ok: !!s.goldenTrend, detail: s.goldenTrend ? 'aligned' : 'not aligned' },
        { label: 'Volume > 20-day average', ok: s.volumeRatio != null && s.volumeRatio > 1, detail: s.volumeRatio != null ? `${num(s.volumeRatio, 2)}×` : 'n/a' },
        { label: 'RSI(14) between 55 and 78', flexible: true, ok: s.rsi14 != null && s.rsi14 >= 55 && s.rsi14 <= 78, detail: s.rsi14 != null ? num(s.rsi14, 0) : 'n/a' },
        { label: 'Positive 1-month return', flexible: true, ok: d.oneMonth != null && d.oneMonth > 0, detail: d.oneMonth != null ? pct(d.oneMonth) : 'n/a' },
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
      'Speculative small-cap movers — fast, thin names ranked on raw momentum. High risk; was the old (mislabeled) "Liquid names" default. · Estimated time ~22s.',
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
      "Diversified giants — the listed arms of Indonesia’s major holding groups (Astra, Salim, Barito, Sinar Mas…). Must be a group member above Rp 20T, then clear any 2 of 4 quality gates (profitability, growth, momentum, valuation) so aggressive expanders aren’t filtered out by a single defensive rule. · Estimated time ~12s.",
    tier1: 'size',
    jauhi: false, // members include banks (BBCA) + ≥Rp100T blue chips (ASII) — JAUHI would empty the list
    fundamentals: true,
    velocity: false,
    members: CONGLOMERATE_TICKERS, // Tier-1 universe restricted to known group issuers
    capFloor: 2e13, // > Rp 20T regardless of the cap-tier selector
    capCeil: null,
    // Two mandatory gates (group + scale) keep this anchored to real holding
    // giants. The quality screen is then "any 2 of 4" so an *aggressively
    // expanding* member (premium PBV, high beta, reinvesting instead of paying
    // dividends — e.g. BRPT/TPIA/DSSA/CUAN) can qualify through growth/momentum
    // routes, while a stagnant one still has to clear profitability/valuation.
    flexibleMin: 2,
    criteria: (d) => {
      const f = d.fundamentals;
      const s = d.signals ?? {};
      const grp = conglomerateGroup(d.ticker);
      const growing =
        !!f && ((f.revenueGrowth != null && f.revenueGrowth > 0.15) || (f.netProfitGrowth != null && f.netProfitGrowth > 0.2));
      const trending = !!s.goldenTrend || (d.oneMonth != null && d.oneMonth > 0);
      return [
        { label: 'Part of a major conglomerate group', ok: !!grp, detail: grp ? grp.group : 'not in group list' },
        { label: 'Market cap > Rp 20T', ok: d.marketCap != null && d.marketCap > 2e13, detail: formatRpCompact(d.marketCap) },
        { label: 'ROE > 12%', flexible: true, ok: !!f && f.roe != null && f.roe > 0.12, detail: f && f.roe != null ? pct(f.roe) : 'n/a' },
        {
          label: 'Growing: revenue > 15% or net profit > 20% YoY',
          flexible: true,
          ok: growing,
          detail: f ? `rev ${pct(f.revenueGrowth)}, NP ${pct(f.netProfitGrowth)}` : 'n/a',
        },
        {
          label: 'Momentum: uptrend stack or positive 1-month return',
          flexible: true,
          ok: trending,
          detail: s.goldenTrend ? 'uptrend stack' : d.oneMonth != null ? pct(d.oneMonth) : 'n/a',
        },
        { label: 'Valuation not extreme: PER < 35x', flexible: true, ok: !!f && f.per != null && f.per > 0 && f.per < 35, detail: f && f.per != null ? xVal(f.per) : 'n/a' },
      ];
    },
    rank: (a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0), // biggest, most resilient giants first
    describe: (d) => {
      const grp = conglomerateGroup(d.ticker);
      const f = d.fundamentals;
      return (
        `Conglomerate${grp ? ` (${grp.group})` : ''} — ${formatRpCompact(d.marketCap)} cap` +
        (f?.roe != null ? `, ROE ${pct(f.roe)}` : '') +
        (f?.per != null ? `, PER ${xVal(f.per)}` : '') +
        (f?.netProfitGrowth != null ? `, NP ${pct(f.netProfitGrowth)} YoY` : '')
      );
    },
  },
];

export const DEFAULT_CATEGORY = 'bluechip';

export function getCategory(id) {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES.find((c) => c.id === DEFAULT_CATEGORY);
}

// Pass/fail rule shared by the screen and the diagnostic.
//
// Two classes of check:
//   • mandatory  (default)        — every one MUST hold.
//   • flexible   (c.flexible)     — only `flexibleMin` of them need to hold.
//
// A category with no flexible criteria collapses to the old "every().ok"
// behaviour. Categories that opt in (e.g. Conglomerate) keep their hard gates
// mandatory while letting a name qualify through *different* quality routes
// (value vs growth vs momentum) instead of demanding all of them at once.
export function qualifiesByChecks(checks, flexibleMin = 0) {
  const mandatory = checks.filter((c) => !c.flexible);
  const flexible = checks.filter((c) => c.flexible);
  if (!mandatory.every((c) => c.ok)) return false;
  if (flexible.length === 0) return true;
  const need = Math.min(flexibleMin || flexible.length, flexible.length);
  return flexible.filter((c) => c.ok).length >= need;
}

// Single source of truth for "does this enriched name pass the category?".
// Used both by the screen and the diagnostic.
export function matchesCategory(category, d) {
  try {
    return qualifiesByChecks(category.criteria(d), category.flexibleMin);
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

// Screening Service: Two-stage LLM-driven screening process
// Stage 1: AI selects candidates that pass JAUHI restrictions
// Stage 2: AI analyzes broker screenshots, detects pack hunting, applies penalties

import { fetchSymbolChart, fetchFundamentals } from './marketData.js';
import { buildScreeningScore, formatRpCompact, formatPct } from './analysis.js';
import { findEmiten, boardRisk } from './universe.js';
import { scanUniverse, mapLimit } from './screeningUniverse.js';
import { getCategory, matchesCategory, capTierBounds } from './screeningCategories.js';
import { finishAIActivity, setAIConfigured, startAIActivity } from './aiSession.js';

// Bounded concurrency for the Tier-2 deep-enrich (each candidate = 1 chart +
// 1 fundamentals fetch); keeps the proxy/Yahoo from being hammered.
const ENRICH_CONCURRENCY = 5;
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_PRE_DATE_LOOKBACK_DAYS = 120;

function screeningRangeForDate(date) {
  const selected = Date.parse(`${date}T00:00:00+07:00`);
  if (!Number.isFinite(selected)) return '1y';

  const ageDays = Math.max(0, Math.ceil((Date.now() - selected) / DAY_MS));
  const neededDays = ageDays + MIN_PRE_DATE_LOOKBACK_DAYS;

  if (neededDays <= 365) return '1y';
  if (neededDays <= 730) return '2y';
  if (neededDays <= 365 * 5) return '5y';
  return '10y';
}

// Check if Claude API key is configured via Vite env
const getApiKey = () => {
  // In Vite, env vars are accessed via import.meta.env
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return import.meta.env.VITE_CLAUDE_API_KEY;
  }
  return undefined;
};

const API_KEY = getApiKey();
const API_URL = '/anthropic/v1/messages'; // Proxied via vite.config.js
const MODEL = 'claude-haiku-4-5-20251001'; // Using Haiku for efficiency
const EVIDENCE_NOTE = 'This is an evidence and rationale summary generated from app inputs and model outputs, not hidden chain-of-thought.';

// Helper functions for formatting (matching those in screeningCategories.js)
const num = (v, d = 1) => (v == null ? 'n/a' : v.toFixed(d));
const xVal = (v, d = 1) => (v == null ? 'n/a' : `${v.toFixed(d)}x`);

function compactText(text, max = 1200) {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

// Check if API key is configured
const isConfigured = () => {
  return !!API_KEY && API_KEY.trim() !== '';
};

setAIConfigured(isConfigured());

// Extract JSON from Claude response (handles markdown fences)
const extractJsonFromResponse = (text) => {
  if (!text) return null;

  let cleaned = text.trim();

  // Extract JSON from markdown code fences
  const fencedMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch) {
    cleaned = fencedMatch[1].trim();
  }

  // Find JSON object boundaries
  const startIdx = cleaned.indexOf('{');
  const endIdx = cleaned.lastIndexOf('}');

  if (startIdx !== -1 && endIdx > startIdx) {
    const jsonStr = cleaned.substring(startIdx, endIdx + 1);
    try {
      return JSON.parse(jsonStr);
    } catch {
      // If parsing fails, try to parse the whole cleaned string
      try {
        return JSON.parse(cleaned);
      } catch {
        return null;
      }
    }
  }

  // Try parsing as plain JSON
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
};

// AI judgment layer for Stage 1 - reviews matched candidates and provides explanations
// Keeps tickers real (never invents), only reorders/drops/explains real candidates
async function aiJudgeCategory(matchedCandidates, category, date) {
  if (!isConfigured()) return null;

  try {
    // Prepare candidate data for Claude
    const candidateLines = matchedCandidates.map((c, index) => {
      const f = c.fundamentals || {};
      const s = c.signals || {};
      return `${index + 1}. ${c.ticker} - ${c.name || 'N/A'}:
        Sector: ${c.sector || 'N/A'}
        Market Cap: ${f.marketCap != null ? formatRpCompact(f.marketCap) : 'N/A'}
        PER: ${f.per != null ? xVal(f.per) : 'N/A'}
        PBV: ${f.pbv != null ? xVal(f.pbv, 2) : 'N/A'}
        ROE: ${f.roe != null ? formatPct(f.roe) : 'N/A'}
        Dividend Yield: ${f.dividendYield != null ? formatPct(f.dividendYield) : 'N/A'}
        Net Profit Growth: ${f.netProfitGrowth != null ? formatPct(f.netProfitGrowth) : 'N/A'}
        Revenue Growth: ${f.revenueGrowth != null ? formatPct(f.revenueGrowth) : 'N/A'}
        DER: ${f.debtToEquity != null ? xVal(f.debtToEquity, 2) : 'N/A'}
        RSI(14): ${s.rsi14 != null ? num(s.rsi14, 0) : 'N/A'}
        Volume Ratio: ${s.volumeRatio != null ? num(s.volumeRatio, 2) : 'N/A'}×
        Golden Trend (MA50 > MA200): ${s.goldenTrend ? 'Yes' : 'No'}
        Beta vs IHSG: ${c.beta != null ? xVal(c.beta, 2) : 'N/A'}
        Consecutive Dividend Years: ${f.consecutiveDividendYears != null ? `${f.consecutiveDividendYears} yr` : 'N/A'}
        Turnover/Day: ${c.turnover != null ? formatRpCompact(c.turnover) : 'N/A'}
        Velocity OK: ${c.velocityOk ? 'Yes' : 'No'}`.trim();
    }).join('\n\n');

    // Build criteria description based on category
    const criteriaDescriptions = category.criteria({}).map(c => `- ${c.label}`).join('\n');

    const systemPrompt = `
You are an expert Indonesian stock market analyst reviewing stocks that have passed initial quantitative screening for the "${category.label}" category.

Your task is to review each candidate stock's actual metrics and provide AI judgment on their fit for this category. You must:
1. Keep/drop/reorder only the real candidates provided - never invent or hallucinate tickers
2. For each kept candidate, explain the fit in 1-2 sentences
3. Provide a rank adjustment (positive = move up, negative = move down, 0 = no change)
4. Return valid JSON in the exact format specified

Category: ${category.label}
Description: ${category.blurb}
Criteria to consider:
${criteriaDescriptions}

For each stock, evaluate how well it embodies the spirit of this category beyond just passing the basic filters.

OUTPUT FORMAT - YOU MUST PROVIDE EXACTLY THIS STRUCTURE:
{
  "candidates": [
    {
      "ticker": "STRING",
      "reason": "STRING (1-2 sentence explanation of fit)",
      "rank_adjustment": NUMBER (integer, e.g., -2, 0, +3)
    }
  ],
  "explanation": "STRING (brief overall explanation of your ranking adjustments)"
}

Where:
- ticker: Must match exactly one of the input stock tickers
- reason: Your explanation of why this stock fits the category (1-2 sentences)
- rank_adjustment: How many positions to move this stock (-N = move down N spots, +N = move up N spots, 0 = no change)
- explanation: Summary of your overall approach and observations

Only return the JSON object, no additional text.
`;

    const userPrompt = `
SCREENING DATE: ${date}
CATEGORY: ${category.label}

CANDIDATE STOCKS THAT PASSED INITIAL SCREENING:
${candidateLines}

Review these real IDX candidates against the ${category.label} category.
Keep/drop/rerank based on how well they embody the category's spirit.
For each kept candidate, explain the fit in 1-2 sentences.
Provide rank adjustments to reorder the list.
Return ONLY the JSON structure specified in the system prompt.
`;

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: [{ type: 'text', text: userPrompt }]
        }]
      })
    });

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.status}`);
    }

    const data = await response.json();
    const responseText = data.content?.[0]?.text ?? '';
    const result = extractJsonFromResponse(responseText);

    // Validate the response structure
    if (result && Array.isArray(result.candidates)) {
      // Filter to only include candidates that were in our original list
      const originalTickers = new Set(matchedCandidates.map(c => c.ticker));
      const validCandidates = result.candidates
        .filter(c => c.ticker && originalTickers.has(c.ticker))
        .map(c => ({
          ticker: c.ticker,
          reason: c.reason || '',
          rank_adjustment: typeof c.rank_adjustment === 'number' ? c.rank_adjustment : 0
        }));

      if (validCandidates.length > 0) {
        return {
          candidates: validCandidates,
          explanation: result.explanation || 'AI review completed'
        };
      }
    }

    return null;
  } catch (error) {
    console.warn('AI review failed:', error);
    return null;
  }
}

// JAUHI velocity filter (SAHAM LAMBAT) — pure check over already-fetched
// candles. Returns true if the stock is NOT slow (i.e., passes the filter).
function passesVelocity(candles) {
  if (!candles || candles.length < 6) return false;

  const today = candles[candles.length - 1];

  // 20-day average volume + today's ratio
  const volLookback = Math.min(20, candles.length);
  let volSum = 0;
  for (let i = candles.length - volLookback; i < candles.length; i++) {
    volSum += candles[i].volume ?? 0;
  }
  const avgVolume = volSum / volLookback;
  const todayVolume = today.volume ?? 0;
  const volRatio = avgVolume > 0 ? todayVolume / avgVolume : todayVolume > 0 ? 1 : 0;
  const volumeActive = volRatio >= 0.5;

  // ATR calculation (using last 5 days)
  let trSum = 0;
  for (let i = candles.length - 5; i < candles.length; i++) {
    const c = candles[i];
    const pc = candles[i - 1]?.close ?? c.close;
    trSum += Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc));
  }
  const atrPct = trSum / 5 / today.close;
  const rangeActive = atrPct >= 0.012;

  // 3-day price change
  const threeDaysAgo = candles[candles.length - 3]?.close;
  const threeDayChange = threeDaysAgo ? (today.close - threeDaysAgo) / threeDaysAgo : 0;
  const monthAgo = candles[candles.length - 22]?.close;
  const oneMonthChange = monthAgo ? (today.close - monthAgo) / monthAgo : null;
  const priceActive =
    Math.abs(threeDayChange) >= 0.025 ||
    (oneMonthChange != null && Math.abs(oneMonthChange) >= 0.08);

  const activeSignals = [priceActive, rangeActive, volumeActive].filter(Boolean).length;
  const strongTrend =
    oneMonthChange != null &&
    Math.abs(oneMonthChange) >= 0.12 &&
    (rangeActive || volRatio >= 0.4);
  const shortBurst = Math.abs(threeDayChange) >= 0.05 && atrPct >= 0.01;

  // Slow means broadly inactive, not "one metric is quiet today".
  return activeSignals >= 2 || strongTrend || shortBurst;
}

function asOfChart(chart, candles) {
  const recent = candles.slice(-252);
  return {
    ...chart,
    candles,
    fiftyTwoWeekHigh: recent.length ? Math.max(...recent.map((c) => c.high)) : chart.fiftyTwoWeekHigh,
    fiftyTwoWeekLow: recent.length ? Math.min(...recent.map((c) => c.low)) : chart.fiftyTwoWeekLow,
  };
}

// Deterministic JAUHI BANK / BLUE CHIP enforcement on the real, scored data.
// The LLM can't be trusted to self-police this (it recalls famous banks and
// mega-caps from memory — exactly what JAUHI forbids), so we re-check in code.
// Returns { skip, rule } to drop a forbidden name, or { skip:false, exception }
// when one qualifies under a real JAUHI exception.
function jauhiVerdict({ name, sector, marketCap, close, chart }) {
  const candles = chart?.candles ?? [];
  const today = candles[candles.length - 1];
  const prev = candles[candles.length - 2];

  // 20-day average volume and today's breakout ratio.
  const lookback = Math.min(20, candles.length);
  let volSum = 0;
  for (let i = candles.length - lookback; i < candles.length; i++) volSum += candles[i]?.volume ?? 0;
  const avgVol = lookback > 0 ? volSum / lookback : 0;
  const volRatio = avgVol > 0 ? (today?.volume ?? 0) / avgVol : 1;

  // Blue-chip exceptions: 52-week-high break or a high-volume breakaway gap.
  // (Per-stock foreign flow isn't in this feed, so the bank exception leans on
  // a real >2x volume breakout only.)
  const athBreak = chart?.fiftyTwoWeekHigh != null && close >= chart.fiftyTwoWeekHigh * 0.99;
  const breakawayGap = today && prev && today.open > prev.high && volRatio > 3;

  // JAUHI BANK — Indonesian banks reliably carry "Bank" in the listed name.
  const isBank = /\bbank\b/i.test(name || '') || /bank|perbankan/i.test(sector || '');
  if (isBank && !(volRatio > 2)) return { skip: true, rule: 'JAUHI BANK' };

  // JAUHI BLUE CHIP — market cap (shares × close) ≥ Rp100T.
  const isBlueChip = marketCap != null && marketCap >= 1e14;
  if (isBlueChip && !(athBreak || breakawayGap)) return { skip: true, rule: 'JAUHI BLUE CHIP' };

  let exception = null;
  if (isBank) exception = 'bank admitted on >2× volume breakout';
  else if (isBlueChip) exception = athBreak ? 'blue chip admitted on 52-week-high break' : 'blue chip admitted on breakaway gap';
  return { skip: false, exception };
}

// 1-year beta vs the IHSG/JCI (^JKSE): cov(stock, index) / var(index) on daily
// returns aligned by trading date. `indexCloseByDate` is a Map(date -> close)
// fetched once per screen. Returns null when the overlap is too thin to trust.
function computeBeta(stockCandles, indexCloseByDate, lookback = 252) {
  if (!stockCandles || !indexCloseByDate) return null;
  const pairs = [];
  for (const c of stockCandles) {
    const idx = indexCloseByDate.get(c.date);
    if (idx != null && c.close != null) pairs.push([c.close, idx]);
  }
  const recent = pairs.slice(-(lookback + 1));
  if (recent.length < 30) return null;
  const sr = [];
  const ir = [];
  for (let k = 1; k < recent.length; k++) {
    const sPrev = recent[k - 1][0];
    const iPrev = recent[k - 1][1];
    if (sPrev > 0 && iPrev > 0) {
      sr.push((recent[k][0] - sPrev) / sPrev);
      ir.push((recent[k][1] - iPrev) / iPrev);
    }
  }
  if (sr.length < 30) return null;
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const ms = mean(sr);
  const mi = mean(ir);
  let cov = 0;
  let varI = 0;
  for (let k = 0; k < sr.length; k++) {
    cov += (sr[k] - ms) * (ir[k] - mi);
    varI += (ir[k] - mi) ** 2;
  }
  return varI > 0 ? cov / varI : null;
}

// Fetch the IHSG/JCI close-by-date map once for a screen — only categories that
// score beta need it. Returns null on failure (beta then degrades to null).
async function fetchIndexCloseByDate(range) {
  try {
    const idx = await fetchSymbolChart('^JKSE', range);
    return new Map((idx.candles ?? []).map((c) => [c.date, c.close]));
  } catch {
    return null;
  }
}

// Deep-enrich a shortlisted candidate with REAL market data: a chart fetch
// drives the screening score + technical signals, and — when the category
// needs them — a fundamentals fetch adds PER/PBV/ROE/ROA/growth/dividend. The
// JAUHI bank/blue-chip check is applied only when the category opts in (Blue
// Chip & High Liquidity opts out). Returns a status object so Stage 1 can
// filter and rank:
//   { data }                 — usable (scored, with signals + fundamentals)
//   { data: null, status }   — unusable: 'jauhi' (hard skip), 'nodata', 'error'
async function enrichCandidate(candidate, date, range, category, ctx = {}) {
  try {
    const chart = await fetchSymbolChart(`${candidate.ticker}.JK`, range);
    // Judge everything AS OF the screening date, not today — otherwise a name
    // active on the chosen date but quiet now (or vice-versa) is mis-classified.
    const asOfCandles = chart?.candles?.filter((c) => c.date <= date) ?? [];
    if (asOfCandles.length < 30) return { data: null, status: 'nodata' }; // score needs ~30
    const datedChart = asOfChart(chart, asOfCandles);

    // Fundamentals are fetched only for categories that filter on them
    // (Value / Growth / Dividend / Blue Chip / Conglomerate), keeping
    // momentum/penny screens to a single round-trip per name. The Conglomerate
    // screen additionally pulls multi-year dividend history.
    let fundamentals = null;
    if (category.fundamentals) {
      fundamentals = await fetchFundamentals(candidate.ticker, {
        dividendHistory: !!category.dividendHistory,
      });
    }

    // 1Y beta vs IHSG — only when the category scores it (Conglomerate).
    const beta = category.beta ? computeBeta(asOfCandles, ctx.indexCloseByDate) : null;

    let score;
    try {
      score = buildScreeningScore({
        code: candidate.ticker,
        requestedDate: date,
        chart: datedChart,
        fundamentals,
        emitenInfo: findEmiten(candidate.ticker),
      });
    } catch {
      return { data: null, status: 'nodata' };
    }

    // JAUHI BANK / BLUE CHIP — applied only when the category opts in.
    if (category.jauhi) {
      const verdict = jauhiVerdict({
        name: score.name,
        sector: candidate.sector,
        marketCap: score.marketCap,
        close: score.close,
        chart: datedChart,
      });
      if (verdict.skip) return { data: null, status: 'jauhi' };
      candidate = verdict.exception
        ? { ...candidate, reason: `${candidate.reason} (${verdict.exception})` }
        : candidate;
    }

    const velocityOk = passesVelocity(asOfCandles); // SAHAM LAMBAT
    const turnover = score.avgValueTraded20 ?? 0;

    // Dividend yield needs price, which fundamentals doesn't carry — derive it
    // here from trailing dividend-per-share over the as-of close.
    if (fundamentals && fundamentals.dividendPerShare != null && score.close > 0) {
      fundamentals = { ...fundamentals, dividendYield: fundamentals.dividendPerShare / score.close };
    }

    const data = {
      ...score,
      sector: candidate.sector ?? null,
      reason: candidate.reason,
      fundamentals,
      turnover,
      velocityOk,
      beta,
    };
    return { data, status: 'ok' };
  } catch {
    // Delisted, rate-limited past retries, or a data hiccup — unusable.
    return { data: null, status: 'error' };
  }
}

// Stage 1: scan the FULL IDX universe on live data, then deep-enrich + score
// the shortlist, returning the top `count` names that match the chosen
// strategy category. No LLM is involved in candidate selection — tickers come
// from real market data, not model recall.
//   Tier 1: batch-scan ~all emiten (spark) → board/sector/cap pre-filter →
//           category-ranked shortlist (see screeningUniverse.js).
//   Tier 2: full chart (+ fundamentals when the category needs them) per
//           shortlisted name → score + signals → apply the category's hard
//           filter, then rank by the category's preference.
// `filters`: { category, capTier, sector, boardLevel } from the screening UI.
export const screeningStage1 = async (date, count = 5, filters = {}) => {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('Date must be in YYYY-MM-DD format');
  }

  const range = screeningRangeForDate(date);
  const category = getCategory(filters.category);

  try {
    // Tier 1 — live universe scan, ranked per category.
    const { shortlist, universeSize, candidateCount } = await scanUniverse(date, {
      count,
      category,
      capTier: filters.capTier ?? 'every',
      sector: filters.sector ?? '',
      boardLevel: filters.boardLevel ?? '',
      range,
    });

    if (shortlist.length === 0) {
      return {
        date,
        candidates: [],
        marketSummary: `Scanned ${universeSize} IDX names — none matched the ${category.label} filters for ${date}.`,
        raw: null,
      };
    }

    // Tier 2 — deep-enrich the shortlist (bounded concurrency, with fetch retry
    // for rate-limit resilience), then apply the category's hard filter and
    // ranking. JAUHI (when the category enforces it) is applied during enrich.
    // Beta categories need the IHSG series once for the whole shortlist.
    const ctx = category.beta
      ? { indexCloseByDate: await fetchIndexCloseByDate(range) }
      : {};
    const results = await mapLimit(shortlist, ENRICH_CONCURRENCY, (c) =>
      enrichCandidate(c, date, range, category, ctx)
    );
    const usable = results.filter((r) => r && r.data).map((r) => r.data);

    const matched = usable.filter((d) => matchesCategory(category, d));

    // Velocity categories (Penny / Momentum) prefer fast tape: order matched
    // movers ahead of calmer ones, ranking within each band by the category's
    // own preference. Other categories rank purely by the category preference.
    let ordered;
    if (category.velocity) {
      const fast = matched.filter((d) => d.velocityOk).sort(category.rank);
      const calm = matched.filter((d) => !d.velocityOk).sort(category.rank);
      ordered = [...fast, ...calm];
    } else {
      ordered = [...matched].sort(category.rank);
    }

    // AI Judgment Layer: Review matched candidates and provide explanations
    let aiResult = null;
    if (isConfigured()) {
      try {
        aiResult = await aiJudgeCategory(ordered, category, date);
      } catch (e) {
        console.warn('AI review failed, using deterministic ranking:', e);
      }
    }
    if (aiResult?.candidates) {
      // Apply AI ranking adjustments
      const rankedWithAdjustments = ordered.map((candidate, originalIndex) => {
        const aiCandidate = aiResult.candidates.find(ai => ai.ticker === candidate.ticker);
        return {
          ...candidate,
          originalIndex, // Store original position for stable sorting
          aiRankAdjustment: aiCandidate ? aiCandidate.rank_adjustment : 0,
          aiReason: aiCandidate ? aiCandidate.reason : null
        };
      });

      // Sort by original rank, then by AI adjustment (descending so positive adjustments come first)
      ordered = rankedWithAdjustments
        .sort((a, b) => {
          // First sort by original position (lower index = higher original rank)
          if (a.originalIndex !== b.originalIndex) return a.originalIndex - b.originalIndex;

          // Then sort by AI adjustment (higher adjustment = better rank)
          return b.aiRankAdjustment - a.aiRankAdjustment;
        })
        .map(({ originalIndex, aiRankAdjustment, aiReason, ...rest }) => rest);
    }

    const finalCandidates = ordered.slice(0, count).map((d) => ({
      ...d,
      reason: d.aiReason ? d.aiReason : category.describe(d),
    }));

    return {
      date,
      candidates: finalCandidates,
      category: category.id,
      // Funnel summary kept on the result (not console) for a clean production log.
      marketSummary: `Scanned ${universeSize} IDX names → ${candidateCount} eligible → ${usable.length} scored → ${matched.length} matched ${category.label} → top ${finalCandidates.length}${aiResult ? ' (AI-reviewed)' : ''}.`,
      raw: null,
      aiReview: aiResult ? true : false,
    };
  } catch (error) {
    console.error('Error in screeningStage1:', error);
    throw error;
  }
};

// Diagnose a SINGLE ticker against the active screen: "why isn't this stock on
// the recommendation list?" Runs the same gates the screen uses — filters
// (sector/board/cap), JAUHI (when the category enforces it), and the category's
// per-criterion checks — and returns a structured breakdown. No LLM involved.
//   { ticker, name, found, recommended, rank?, qualifies, verdict, checks:[{label, ok, detail}], fatal? }
export const diagnoseStock = async (code, date, filters = {}, recommended = []) => {
  const ticker = (code || '').trim().toUpperCase();
  if (!ticker) throw new Error('Enter a ticker to diagnose.');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('A screening date is required to diagnose a stock.');
  }

  const category = getCategory(filters.category);
  const emitenInfo = findEmiten(ticker);
  if (!emitenInfo) {
    return { ticker, found: false, recommended: false, qualifies: false, checks: [], verdict: `${ticker} isn't in the IDX listing universe.` };
  }

  const name = emitenInfo.name;
  const hit = recommended.find((r) => r.ticker === ticker);
  const checks = [];

  // Pre-network filter gates (the UI selectors).
  if (filters.sector) {
    checks.push({ label: `Sector is ${filters.sector}`, ok: emitenInfo.sector === filters.sector, detail: emitenInfo.sector ?? 'unclassified' });
  }
  if (filters.boardLevel) {
    const lvl = boardRisk(emitenInfo.board)?.level;
    checks.push({ label: 'Matches the listing-board filter', ok: lvl === filters.boardLevel, detail: emitenInfo.board ?? 'unknown' });
  }

  const range = screeningRangeForDate(date);
  let score;
  let datedChart;
  let asOfCandles;
  let fundamentals = null;
  try {
    const chart = await fetchSymbolChart(`${ticker}.JK`, range);
    asOfCandles = chart?.candles?.filter((c) => c.date <= date) ?? [];
    if (asOfCandles.length < 30) {
      return { ticker, name, found: true, recommended: !!hit, qualifies: false, checks, verdict: `Not enough trading history on or before ${date} to score ${ticker}.` };
    }
    datedChart = asOfChart(chart, asOfCandles);
    if (category.fundamentals)
      fundamentals = await fetchFundamentals(ticker, { dividendHistory: !!category.dividendHistory });
    score = buildScreeningScore({ code: ticker, requestedDate: date, chart: datedChart, fundamentals, emitenInfo });
  } catch {
    return { ticker, name, found: true, recommended: !!hit, qualifies: false, checks, verdict: `Could not load market data for ${ticker} — it may be delisted, suspended, or too new.` };
  }

  const cap = score.marketCap;

  // Cap-tier selector.
  if (filters.capTier && filters.capTier !== 'every') {
    const t = capTierBounds(filters.capTier);
    const ok = cap != null && (t.min == null || cap >= t.min) && (t.max == null || cap < t.max);
    checks.push({ label: `In the ${t.label} band`, ok, detail: formatRpCompact(cap) });
  }

  // JAUHI bank / blue-chip (only when the category enforces it).
  if (category.jauhi) {
    const verdict = jauhiVerdict({ name: score.name, sector: emitenInfo.sector, marketCap: cap, close: score.close, chart: datedChart });
    if (verdict.skip) {
      checks.push({
        label: `Passes JAUHI (${verdict.rule})`,
        ok: false,
        detail: verdict.rule === 'JAUHI BANK' ? 'a bank with no >2× volume breakout' : '≥Rp100T blue chip with no breakout / 52w-high break',
      });
    }
  }

  // Derive dividend yield (needs price) before the category criteria run.
  if (fundamentals && fundamentals.dividendPerShare != null && score.close > 0) {
    fundamentals = { ...fundamentals, dividendYield: fundamentals.dividendPerShare / score.close };
  }

  // 1Y beta vs IHSG — only when the category scores it (Conglomerate).
  const beta = category.beta
    ? computeBeta(asOfCandles, await fetchIndexCloseByDate(range))
    : null;

  const d = {
    ...score,
    sector: emitenInfo.sector ?? null,
    turnover: score.avgValueTraded20 ?? 0,
    velocityOk: passesVelocity(asOfCandles),
    fundamentals,
    beta,
  };

  // The category's own strategy criteria.
  for (const c of category.criteria(d)) checks.push(c);

  const qualifies = checks.every((c) => c.ok);

  let verdict;
  if (hit) {
    verdict = `${ticker} IS on the list${hit.rank ? ` at #${hit.rank}` : ''}.`;
  } else if (!qualifies) {
    const failed = checks.filter((c) => !c.ok);
    verdict = `${ticker} is excluded by the ${category.label} screen — it fails ${failed.length} of ${checks.length} criteria below.`;
  } else {
    // Passed every gate but isn't in the top N — a ranking/shortlist miss.
    const lowest = recommended.length ? recommended[recommended.length - 1] : null;
    const lowScore = lowest ? (lowest.composite ?? lowest.activeComposite) : null;
    verdict =
      `${ticker} qualifies for ${category.label}, but didn't make the top ${recommended.length || 'N'} — ` +
      (lowScore != null
        ? `it ranked behind the surfaced names (its composite ${d.composite.toFixed(1)} vs the cutoff ~${Number(lowScore).toFixed(1)}), `
        : 'it ranked behind the surfaced names, ') +
      'or fell outside the deep-scan shortlist. Raise "Stocks to surface" or tighten the filters to pull it in.';
  }

  return { ticker, name, found: true, recommended: !!hit, rank: hit?.rank ?? null, qualifies, verdict, checks, composite: d.composite, close: score.close };
};

// Stage 2: Analyze broker screenshots, detect pack hunting, apply penalties
export const screeningStage2 = async (params) => {
  const { date, candidates, images = [] } = params;

  // Validate inputs
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('Date must be in YYYY-MM-DD format');
  }

  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error('Candidates array is required and must not be empty');
  }

  if (!isConfigured()) {
    throw new Error('Claude API key not configured for screening');
  }

  // Prepare image data for Claude Vision API
  const prepareImageData = async (imageFiles) => {
    const imageBlocks = [];

    for (const imageFile of imageFiles) {
      try {
        // Convert file to base64
        const base64Data = await fileToBase64(imageFile);

        // Determine media type
        const mediaType = imageFile.type || 'image/jpeg'; // default to jpeg

        // Supported types for Claude Vision
        const supportedTypes = new Set([
          'image/png',
          'image/jpeg',
          'image/webp',
          'image/gif'
        ]);

        if (supportedTypes.has(mediaType)) {
          imageBlocks.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: base64Data
            }
          });
        }
        // Skip unsupported image types silently
      } catch (err) {
        console.warn(`Could not process image ${imageFile.name}:`, err);
        // Continue with other images
      }
    }

    return imageBlocks;
  };

  // Helper to convert base64 (we'll need to implement this or use existing util)
  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        // Remove data URL prefix if present
        let base64 = reader.result.toString();
        if (base64.startsWith('data:')) {
          base64 = base64.split(',')[1];
        }
        resolve(base64);
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  };

  try {
    const imageFiles = Array.isArray(images) ? images : [];
    const imageBlocks = await prepareImageData(imageFiles);
    const imagesByTicker = {};
    const generalImages = [];
    imageFiles.forEach((img) => {
      if (img.ticker) {
        if (!imagesByTicker[img.ticker]) imagesByTicker[img.ticker] = [];
        imagesByTicker[img.ticker].push(img);
      } else {
        generalImages.push(img);
      }
    });

    // Build candidate list for prompt
    const candidateLines = candidates.map((c, index) => {
      const imgCount = imagesByTicker[c.ticker] ? imagesByTicker[c.ticker].length : 0;
      return `${index + 1}. ${c.ticker} ${c.sector ? `(${c.sector})` : ''} - ${c.reason || 'JAUHI passed'} [${imgCount} broker screenshot${imgCount !== 1 ? 's' : ''} attached]`;
    }).join('\n');

    // Build the Stage 2 prompt
    const systemPrompt = `
You are an expert Indonesian stock market analyst specializing in technical analysis, volume analysis, and detecting broker collusion patterns (Pack Hunting).
Your task is to analyze broker summary screenshots, detect any Pack Hunting patterns, evaluate stock quality, and produce a final ranked trading plan.

PACK HUNTING PATTERNS TO DETECT:
1. WOLF PACK (RED FLAG): 3-4 broker retail brokers coordinating SELL vs 1 large solo BUY → penalty -35 points
2. DECOY HUNT (WARNING): 3-4 broker retail brokers coordinating BUY vs 1 large solo SELL → penalty -25 points
3. PHANTOM GANG (NOISE): Gang of retail brokers vs Gang of retail brokers (both sides coordinated) → penalty -15 points
4. NO PATTERN DETECTED (AMAN): No coordination detected → penalty 0 points

SCORING METHODOLOGY:
- For each stock, evaluate intrinsic quality based on:
  * Technical analysis (price action, momentum, support/resistance)
  * Fundamental analysis (when available)
  * Overall market conditions and trend alignment
- Assign a Base Score of 0-100 points reflecting the stock's intrinsic merit
- Apply Pack Hunting penalty (if detected): Final Score = Base Score - Penalty
- Rank stocks by Final Score (highest to lowest)

VERDICT THRESHOLDS based on Final Score:
- ≥75: STRONG (recommended for trading)
- 60-74: LAYAK (acceptable with caution)
- 45-59: HATI-HATI (proceed with extreme caution)
- <45: HINDARI (avoid)

OUTPUT FORMAT - YOU MUST PROVIDE EXACTLY THIS STRUCTURE:
{
  "date": "YYYY-MM-DD",
  "rawAnalysis": "STRING (your full analysis text)",
  "packHuntingTable": [
    { "ticker": "STRING", "patternDetected": "STRING", "status": "STRING", "penalty": NUMBER }
  ],
  "finalRankingTable": [
    { "ranking": NUMBER, "ticker": "STRING", "baseScore": NUMBER, "penalty": NUMBER, "finalScore": NUMBER, "verdict": "STRING" }
  ],
  "tradingPlan": [
    { "ticker": "STRING", "entry": "STRING", "stopLoss": "STRING", "target": "STRING", "notes": "STRING" }
  ]
}

Where:
- patternDetected: One of "WOLF PACK", "DECOY HUNT", "PHANTOM GANG", or "NONE"
- status: One of "RED FLAG", "WARNING", "NOISE", or "AMAN"
- penalty: Number (-35, -25, -15, or 0)
- ranking: Position in final ranking (1 = best)
- baseScore: Intrinsic quality score 0-100 before penalties
- finalScore: Base score minus penalty
- verdict: One of "STRONG", "LAYAK", "HATI-HATI", or "HINDARI" based on finalScore thresholds
- entry, stopLoss, target: Price levels for trading plan (format: "Rp X,XXX" or "X.XXX")
- notes: Brief rationale for the trading plan levels

Analyze ALL provided broker screenshots, detect patterns, score each stock, and return the complete JSON structure.
`;

    // Build user prompt with candidate and image information
    const userPrompt = `
SCREENING DATE: ${date}

CANDIDATE STOCKS FROM STAGE 1:
${candidateLines}

BROKER SUMMARY SCREENSHOTS PROVIDED:
${[
  ...Object.keys(imagesByTicker).map(ticker => {
    const count = imagesByTicker[ticker].length;
    return `- ${ticker}: ${count} screenshot${count !== 1 ? 's' : ''}`;
  }),
  generalImages.length > 0
    ? `- General uploaded broker screenshots: ${generalImages.length} file${generalImages.length !== 1 ? 's' : ''} (${generalImages.map((img) => img.name).join(', ')})`
    : '',
].filter(Boolean).join('\n') || '- No screenshots uploaded'}

Analyze any attached broker screenshots for visible broker activity. If screenshots are general rather than ticker-labeled,
use them as supporting context only when the ticker is visible in the image; otherwise say the screenshot was not attributable.
Detect Pack Hunting patterns where visible, evaluate intrinsic quality, apply appropriate penalties, and produce a final ranked trading plan.
Provide your response in the exact JSON format specified in the system prompt.
`;

    const activityId = startAIActivity({
      source: 'Stock Screening',
      title: 'AI broker-screening request started',
      summary: `Analyzing ${candidates.length} candidate${candidates.length === 1 ? '' : 's'} with ${imageBlocks.length} broker screenshot${imageBlocks.length === 1 ? '' : 's'}.`,
      details: 'Session log records request flow and outcomes, not hidden model chain-of-thought.',
      evidence: {
        note: EVIDENCE_NOTE,
        sections: [
          {
            title: 'Inputs sent',
            facts: [
              { label: 'Screening date', value: date },
              { label: 'Candidates', value: candidates.length },
              { label: 'Screenshots', value: imageBlocks.length },
            ],
          },
          {
            title: 'Candidate set',
            rows: candidates.map((candidate) => ({
              ticker: candidate.ticker,
              name: candidate.name,
              score: (candidate.activeComposite ?? candidate.composite)?.toFixed?.(1) ?? 'n/a',
              close: Math.round(candidate.close ?? 0).toLocaleString(),
            })),
          },
          {
            title: 'Screenshots by ticker',
            rows: Object.keys(imagesByTicker).map((ticker) => ({
              ticker,
              screenshots: imagesByTicker[ticker].length,
            })),
          },
          ...(generalImages.length > 0
            ? [{
                title: 'General screenshots',
                rows: generalImages.map((img) => ({
                  file: img.name,
                  type: img.type || 'unknown',
                  sizeKb: Math.round((img.size || 0) / 1024),
                })),
              }]
            : []),
          {
            title: 'Criteria requested',
            items: [
              'Detect pack-hunting patterns from broker screenshots: WOLF PACK, DECOY HUNT, PHANTOM GANG, or NONE.',
              'Apply penalties to suspicious broker behavior before final ranking.',
              'Produce final score, verdict, entry, stop loss, target, and notes per candidate.',
            ],
          },
        ],
      },
    });

    let responseText = '';
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 6000, // Increased for image analysis
          system: systemPrompt,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: userPrompt },
              ...imageBlocks
            ]
          }]
        })
      });

      if (!response.ok) {
        throw new Error(`Claude API error: ${response.status}`);
      }

      const data = await response.json();
      responseText = data.content?.[0]?.text ?? '';
    } catch (error) {
      finishAIActivity(activityId, {
        source: 'Stock Screening',
        title: 'AI broker-screening request failed',
        summary: error.message || 'Claude could not complete broker-pattern screening.',
        error,
      });
      throw error;
    }

    const result = extractJsonFromResponse(responseText);

    if (!result) {
      finishAIActivity(activityId, {
        source: 'Stock Screening',
        title: 'AI broker-screening parse failed',
        summary: 'Claude responded, but the app could not parse the expected JSON structure.',
        error: new Error('Could not parse JSON response from Claude AI'),
        evidence: {
          note: EVIDENCE_NOTE,
          sections: [
            {
              title: 'Raw response excerpt',
              code: compactText(responseText),
            },
          ],
        },
      });
      throw new Error('Could not parse JSON response from Claude AI');
    }

    // Validate and normalize the response
    const validatedResult = {
      date: result.date || date,
      rawAnalysis: result.rawAnalysis || 'Analysis completed',
      packHuntingTable: Array.isArray(result.packHuntingTable) ? result.packHuntingTable.map(item => ({
        ticker: item.ticker?.toUpperCase().replace(/[^A-Z]/g, '') || '',
        patternDetected: item.patternDetected || 'NONE',
        status: item.status || 'AMAN',
        penalty: typeof item.penalty === 'number' ? item.penalty : 0
      })).filter(item => item.ticker && /^[A-Z]{2,6}$/.test(item.ticker)) : [],
      finalRankingTable: Array.isArray(result.finalRankingTable) ? result.finalRankingTable.map(item => ({
        ranking: typeof item.ranking === 'number' ? item.ranking : 0,
        ticker: item.ticker?.toUpperCase().replace(/[^A-Z]/g, '') || '',
        baseScore: typeof item.baseScore === 'number' ? Math.max(0, Math.min(100, item.baseScore)) : 0,
        penalty: typeof item.penalty === 'number' ? item.penalty : 0,
        finalScore: typeof item.finalScore === 'number' ? Math.max(0, Math.min(100, item.finalScore)) : 0,
        verdict: item.verdict || 'HATI-HATI'
      })).filter(item =>
        item.ticker &&
        /^[A-Z]{2,6}$/.test(item.ticker) &&
        ['STRONG', 'LAYAK', 'HATI-HATI', 'HINDARI'].includes(item.verdict)
      ) : [],
      tradingPlan: Array.isArray(result.tradingPlan) ? result.tradingPlan.map(item => ({
        ticker: item.ticker?.toUpperCase().replace(/[^A-Z]/g, '') || '',
        entry: item.entry || 'Rp 0',
        stopLoss: item.stopLoss || 'Rp 0',
        target: item.target || 'Rp 0',
        notes: item.notes || 'No notes provided'
      })).filter(item => item.ticker && /^[A-Z]{2,6}$/.test(item.ticker)) : [],
      raw: responseText
    };

    finishAIActivity(activityId, {
      source: 'Stock Screening',
      title: 'AI broker-screening response received',
      summary: 'Claude returned the broker-pattern screening response and the app parsed the ranking.',
      evidence: {
        note: EVIDENCE_NOTE,
        sections: [
          {
            title: 'Why stocks ranked where they did',
            rows: validatedResult.finalRankingTable.map((item) => ({
              rank: item.ranking,
              ticker: item.ticker,
              baseScore: item.baseScore,
              penalty: item.penalty,
              finalScore: item.finalScore,
              verdict: item.verdict,
            })),
          },
          {
            title: 'Pack-hunting evidence',
            rows: validatedResult.packHuntingTable.map((item) => ({
              ticker: item.ticker,
              pattern: item.patternDetected,
              status: item.status,
              penalty: item.penalty,
            })),
          },
          {
            title: 'Trading plan rationale',
            rows: validatedResult.tradingPlan.map((item) => ({
              ticker: item.ticker,
              entry: item.entry,
              stopLoss: item.stopLoss,
              target: item.target,
              notes: item.notes,
            })),
          },
          {
            title: 'Candidate inputs',
            rows: candidates.map((candidate) => ({
              ticker: candidate.ticker,
              name: candidate.name,
              score: (candidate.activeComposite ?? candidate.composite)?.toFixed?.(1) ?? 'n/a',
              close: Math.round(candidate.close ?? 0).toLocaleString(),
            })),
          },
          {
            title: 'AI raw analysis excerpt',
            code: compactText(validatedResult.rawAnalysis || responseText),
          },
        ],
      },
    });

    return validatedResult;
  } catch (error) {
    console.error('Error in screeningStage2:', error);
    throw error;
  }
};

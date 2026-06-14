// Screening Service: Two-stage LLM-driven screening process
// Stage 1: AI selects candidates that pass JAUHI restrictions
// Stage 2: AI analyzes broker screenshots, detects pack hunting, applies penalties

import { fetchSymbolChart } from './marketData.js';
import { buildScreeningScore } from './analysis.js';
import { findEmiten } from './universe.js';
import { scanUniverse, mapLimit } from './screeningUniverse.js';
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

// Average daily value traded (Rp) a name must clear to count as a "strong",
// cleanly-tradable pick. Names below this aren't dropped outright — Stage 1's
// fallback can still surface them if there aren't enough strong movers — but
// they rank behind the liquid ones.
const LIQUIDITY_STRONG = 5e9; // ~Rp5B/day

// Deep-enrich a shortlisted candidate with REAL market data: one chart fetch
// drives the screening score, the JAUHI bank/blue-chip checks, and the velocity
// + liquidity classification. Rather than returning null on a soft miss, it
// returns a status object so Stage 1 can rank and, if needed, relax:
//   { data, velocityOk, liquidOk, turnover }  — usable (JAUHI-clean, scored)
//   { data: null, status }                    — unusable: 'jauhi' (hard skip),
//                                                'nodata' (no history), 'error'
async function enrichCandidate(candidate, date, range) {
  try {
    const chart = await fetchSymbolChart(`${candidate.ticker}.JK`, range);
    // Judge everything AS OF the screening date, not today — otherwise a name
    // active on the chosen date but quiet now (or vice-versa) is mis-classified.
    const asOfCandles = chart?.candles?.filter((c) => c.date <= date) ?? [];
    if (asOfCandles.length < 30) return { data: null, status: 'nodata' }; // score needs ~30
    const datedChart = asOfChart(chart, asOfCandles);

    // Screening is momentum/flow-driven, so we skip the extra fundamentals
    // round-trip here: it doubles the request load (a reliability risk across a
    // big shortlist) and the composite renormalizes fine without it.
    let score;
    try {
      score = buildScreeningScore({
        code: candidate.ticker,
        requestedDate: date,
        chart: datedChart,
        fundamentals: null,
        emitenInfo: findEmiten(candidate.ticker),
      });
    } catch {
      return { data: null, status: 'nodata' };
    }

    // JAUHI BANK / BLUE CHIP is a HARD exclusion — never relaxed by the fallback.
    const verdict = jauhiVerdict({
      name: score.name,
      sector: candidate.sector,
      marketCap: score.marketCap,
      close: score.close,
      chart: datedChart,
    });
    if (verdict.skip) return { data: null, status: 'jauhi' };

    // Soft signals — used to rank and to relax under starvation, not to drop.
    const velocityOk = passesVelocity(asOfCandles); // SAHAM LAMBAT
    const turnover = score.avgValueTraded20 ?? 0;
    const liquidOk = turnover >= LIQUIDITY_STRONG;

    const reason = verdict.exception ? `${candidate.reason} (${verdict.exception})` : candidate.reason;
    return {
      data: { ...score, sector: candidate.sector ?? null, reason },
      status: 'ok',
      velocityOk,
      liquidOk,
      turnover,
    };
  } catch {
    // Delisted, rate-limited past retries, or a data hiccup — unusable.
    return { data: null, status: 'error' };
  }
}

// Stage 1: scan the FULL IDX universe on live data, then deep-enrich + score
// the shortlist, returning the top `count` survivors. No LLM is involved in
// candidate selection — tickers come from real market data, not model recall.
//   Tier 1: batch-scan ~all emiten (spark) → JAUHI + velocity pre-filter →
//           momentum-ranked shortlist (see screeningUniverse.js).
//   Tier 2: full chart + fundamentals per shortlisted name → precise JAUHI
//           (velocity + bank/blue-chip) and composite scoring → rank by score.
// `filters`: { capMin, capMax, boardLevel } from the screening UI.
export const screeningStage1 = async (date, count = 5, filters = {}) => {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('Date must be in YYYY-MM-DD format');
  }

  const range = screeningRangeForDate(date);

  try {
    // Tier 1 — live universe scan.
    const { shortlist, universeSize, candidateCount } = await scanUniverse(date, {
      count,
      capMin: filters.capMin ?? null,
      capMax: filters.capMax ?? null,
      boardLevel: filters.boardLevel ?? '',
      range,
    });

    if (shortlist.length === 0) {
      return {
        date,
        candidates: [],
        marketSummary: `Scanned ${universeSize} IDX names — none passed the JAUHI, velocity, and filter criteria for ${date}.`,
        raw: null,
      };
    }

    // Tier 2 — deep-enrich the shortlist (bounded concurrency, with fetch retry
    // for rate-limit resilience). Every JAUHI-clean, scored name is usable; we
    // rank by preference and only relax the soft gates (velocity, liquidity) if
    // there aren't enough strong picks — so the screen never starves when real
    // movers exist. JAUHI itself is never relaxed.
    const results = await mapLimit(shortlist, ENRICH_CONCURRENCY, (c) =>
      enrichCandidate(c, date, range)
    );
    const usable = results.filter((r) => r && r.data);

    const byComposite = (a, b) => (b.data.composite ?? 0) - (a.data.composite ?? 0);
    const byTurnover = (a, b) => b.turnover - a.turnover;

    // Preference tiers: strong (fast + liquid) → liquid-but-calm → fast-but-thin
    // → the rest (most liquid first). Fill `count` from the top down.
    const strong = usable.filter((r) => r.velocityOk && r.liquidOk).sort(byComposite);
    const liquidCalm = usable.filter((r) => !r.velocityOk && r.liquidOk).sort(byComposite);
    const fastThin = usable.filter((r) => r.velocityOk && !r.liquidOk).sort(byTurnover);
    const rest = usable.filter((r) => !r.velocityOk && !r.liquidOk).sort(byTurnover);
    const ordered = [...strong, ...liquidCalm, ...fastThin, ...rest];

    const finalCandidates = ordered.slice(0, count).map((r, i) => {
      // Flag picks that only made the list because the strict gates were relaxed,
      // so the UI/narrative don't present a thin/calm name as a prime mover.
      if (i < strong.length) return r.data;
      const note = !r.liquidOk && !r.velocityOk ? 'thin & calm tape' : !r.liquidOk ? 'lighter liquidity' : 'calmer tape';
      return { ...r.data, reason: `${r.data.reason} · relaxed: ${note}` };
    });

    return {
      date,
      candidates: finalCandidates,
      // Funnel summary kept on the result (not console) for a clean production log.
      marketSummary: `Scanned ${universeSize} IDX names → ${candidateCount} movers → ${usable.length} scored → top ${finalCandidates.length} (${strong.length} strong).`,
      raw: null,
    };
  } catch (error) {
    console.error('Error in screeningStage1:', error);
    throw error;
  }
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

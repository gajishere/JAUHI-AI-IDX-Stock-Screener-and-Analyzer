// News sentiment service — max_tokens:4096, max_uses:3 (rate-limit safe).
// News sentiment service for the single-ticker Analysis page.
//
// Uses Claude's web_search_20250305 server tool: Claude searches the live web
// itself (executed on Anthropic's infrastructure), reads the results, and
// classifies each finding as positive/negative/neutral for the ticker. The
// resulting `score` (-1..+1, signed by direction, scaled by confidence) is a
// full weighted pillar in analysis.js (see newsScore + TIMEFRAME_WEIGHTS),
// carrying direct weight in the composite rating alongside the other pillars.
// A failed/disabled fetch returns null and the composite renormalizes the rest.
//
// No new API key, proxy, or env var is needed — the request goes through the
// existing /anthropic proxy in vite.config.js, which attaches the server-side
// CLAUDE_API_KEY. The org admin must enable the web search tool in the Claude
// Console; a disabled/failed search degrades gracefully (this throws, and the
// page falls back to the locked score without news).
//
// Pricing note: web search is $10 per 1,000 searches + tokens. max_uses caps
// the per-analysis cost at a handful of searches.

import { extractJSON } from './claudeAI';
import { finishAIActivity, startAIActivity } from './aiSession';

const evidenceNote = 'This is an evidence and rationale summary generated from app inputs and model outputs, not hidden chain-of-thought.';

// Instruction appended to prompts so Claude writes prose in the user's UI
// language. JSON keys and the controlled sentiment/confidence tokens stay
// English so the scoring engine can read them.
function languageDirective(language) {
  if (language === 'id') {
    return 'RESPONSE LANGUAGE: Write every text field VALUE (summary, impact, headline) in natural, professional Bahasa Indonesia. Keep all JSON keys and the sentiment/confidence token values in English.';
  }
  return 'RESPONSE LANGUAGE: Write all text in English.';
}

// ISO YYYY-MM-DD for `windowMonths` before `analysisDate` (clamped to not go
// before 2020-01-01, an arbitrary floor so very old tickers don't search an
// absurd range). Returns the same YYYY-MM-DD string Claude is asked to bound.
function windowStart(analysisDate, windowMonths) {
  const d = new Date(analysisDate);
  if (Number.isNaN(d.getTime())) return null;
  const start = new Date(d);
  start.setMonth(start.getMonth() - windowMonths);
  const iso = start.toISOString().slice(0, 10);
  return iso < '2020-01-01' ? '2020-01-01' : iso;
}

class NewsService {
  constructor() {
    this.apiUrl = '/anthropic/v1/messages';
    this.model = 'claude-haiku-4-5-20251001';
  }

  isConfigured() {
    return true;
  }

  // Fetch news for a single IDX ticker over the trailing window and classify
  // it. Returns { sentiment, score, confidence, summary, articles, asOf,
  // windowMonths }. Throws on any unrecoverable failure so the caller can
  // fall back to a news-less score.
  async fetchNewsSentiment(ticker, name, analysisDate, windowMonths = 6, language = 'en') {
    if (!this.isConfigured()) {
      throw new Error('Claude API key not configured. Please set CLAUDE_API_KEY in .env.');
    }

    const code = String(ticker || '').trim().toUpperCase();
    if (!code) throw new Error('News needs a ticker.');

    const from = windowStart(analysisDate, windowMonths);
    const to = analysisDate || new Date().toISOString().slice(0, 10);
    const months = Math.max(1, Math.min(12, Number(windowMonths) || 6));

    const prompt = `You are an Indonesian (IDX) equity news analyst. Use the web_search tool to find REAL news about this stock, then classify each finding's market impact.

${languageDirective(language)}

STOCK: ${code}${name ? ` (${name})` : ''}
EXCHANGE: Indonesia Stock Exchange (IDX)
LOOKBACK WINDOW: ${from} to ${to} (trailing ${months} month${months === 1 ? '' : 's'})

WHAT TO SEARCH (run up to 5 searches):
- Indonesian-language financial news: search "${code}" and "${code} saham" and "${code} berita" — these surface Bisnis.com, Kontan, CNBC Indonesia, Kompas, IDX channel, etc.
- Also try the company name in Bahasa Indonesia if it differs from the code.
- Focus on material catalysts: earnings/results, dividends, corporate actions (split, buyback, rights issue), M&A, regulation/OJK/Bappebti action, management changes, major project wins/losses, broker/downgrades, debt/default, legal/regulatory trouble.
- Ignore generic market-wrap pieces that only mention the ticker in passing.

CLASSIFY each material finding. "positive" = likely to push the price up (earnings beat, upgrade, buyback, accretive deal); "negative" = likely to push it down (loss, downgrade, dilution, regulatory action, default); "neutral" = ambiguous or already priced.

Return STRICT JSON (no markdown fences) with EXACTLY this shape:
{
  "sentiment": "positive" | "negative" | "neutral",
  "score": <number between -1.0 and 1.0; sign = direction, magnitude = strength of evidence>,
  "confidence": "high" | "medium" | "low",
  "summary": "2-3 sentences: the dominant news narrative over the window and its direction",
  "articles": [
    { "headline": "string", "source": "publisher name", "date": "YYYY-MM-DD or null", "sentiment": "positive" | "negative" | "neutral", "impact": "one short clause on why it matters", "url": "string or null" }
  ]
}

Rules:
- Use "score": 0 and "sentiment": "neutral" with a small articles list if no material news exists. Do NOT invent headlines or sources.
- Only include articles you actually found via search. Cap the list at 8 most material items, newest first.
- "confidence" is "high" only if multiple credible sources agree on the direction; "low" if the evidence is thin, dated, or contradictory.
- All sentiment, score, and confidence values MUST stay English tokens regardless of response language. summary/headline/impact/source follow the RESPONSE LANGUAGE.`;

    const activityId = startAIActivity({
      source: 'Stock Analysis',
      title: 'News sentiment request started',
      summary: `Asking Claude to web-search ${code} news over the trailing ${months} month${months === 1 ? '' : 's'} and classify market impact.`,
      details: 'Claude executes the web searches itself (server tool); results are real, not generated.',
      evidence: {
        note: evidenceNote,
        sections: [
          {
            title: 'Search parameters',
            facts: [
              { label: 'Ticker', value: code },
              { label: 'Name', value: name || 'n/a' },
              { label: 'Window', value: `${from} → ${to} (${months}m)` },
            ],
          },
          {
            title: 'Classification criteria',
            items: [
              'Material catalysts only: earnings, dividends, corporate actions, M&A, regulation, management, projects.',
              'positive = price-up catalyst; negative = price-down; neutral = ambiguous or priced-in.',
              'No fabricated headlines — neutral/empty result when nothing material was found.',
            ],
          },
        ],
      },
    });

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 4096,
          // The web_search server tool lets Claude run live searches itself.
          // max_uses bounds the per-analysis cost; user_location biases toward
          // Indonesian sources so the IDX-relevant coverage surfaces first.
          tools: [
            {
              type: 'web_search_20250305',
              name: 'web_search',
              max_uses: 3,
              user_location: {
                type: 'approximate',
                country: 'ID',
                timezone: 'Asia/Jakarta',
              },
            },
          ],
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!response.ok) {
        // 400/403 here usually means the web search tool is disabled for the
        // org, or the key lacks the server-tool entitlement — surface a clear
        // message so the user knows it's a config issue, not a code bug.
        let hint = '';
        if (response.status === 400 || response.status === 403) {
          hint = ' (If this persists, the web search tool may need to be enabled for your organization in the Claude Console.)';
        }
        throw new Error(`Claude web search request failed (HTTP ${response.status})${hint}`);
      }

      const data = await response.json();
      const webSearchRequests = data?.usage?.server_tool_use?.web_search_requests ?? 0;

      // Claude's turn may contain several text blocks interspersed with the
      // search round-trips. Concatenate the text blocks and parse the JSON
      // object out of whichever block carries it.
      const blocks = Array.isArray(data.content) ? data.content : [];
      const text = blocks
        .filter((b) => b?.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text)
        .join('\n\n');

      if (!text.trim()) {
        throw new Error('Claude returned no text after web search.');
      }

      // Spot a tool-level error (e.g. max_uses_exceeded / too_many_requests):
      // the HTTP response is still 200, so we have to inspect the content.
      const toolError = blocks.find(
        (b) => b?.type === 'web_search_tool_result' && b?.content?.type === 'web_search_tool_result_error',
      );
      if (toolError) {
        // Don't hard-fail on max_uses_exceeded — Claude may still have
        // gathered enough from earlier searches to classify. Just log it.
        console.warn('Web search tool error:', toolError.content.error_code);
      }

      const parsed = extractJSON(text, null);
      if (!parsed || parsed.sentiment == null) {
        console.error('News: raw text from Claude:', text.slice(0, 600));
        throw new Error('Could not parse news sentiment from Claude response.');
      }

      const result = {
        sentiment: String(parsed.sentiment || 'neutral').toLowerCase(),
        score: clampScore(parsed.score),
        confidence: normalizeConfidence(parsed.confidence),
        summary: String(parsed.summary || '').trim(),
        asOf: to,
        windowMonths: months,
        articles: Array.isArray(parsed.articles) ? parsed.articles.slice(0, 8).map(normalizeArticle) : [],
        webSearchRequests,
      };

      finishAIActivity(activityId, {
        source: 'Stock Analysis',
        title: 'News sentiment received',
        summary: `Claude classified ${result.articles.length} news item${result.articles.length === 1 ? '' : 's'} for ${code} as ${result.sentiment} (score ${result.score.toFixed(2)}).`,
        evidence: {
          note: evidenceNote,
          sections: [
            {
              title: 'Sentiment read',
              facts: [
                { label: 'Direction', value: result.sentiment },
                { label: 'Score', value: result.score.toFixed(2) },
                { label: 'Confidence', value: result.confidence },
                { label: 'Articles found', value: result.articles.length },
                { label: 'Web searches run', value: webSearchRequests },
              ],
            },
            {
              title: 'Summary',
              text: result.summary || '(no summary)',
            },
            {
              title: 'Articles classified',
              rows: result.articles.map((a) => ({
                sentiment: a.sentiment,
                source: a.source,
                date: a.date ?? 'n/a',
                headline: a.headline,
              })),
            },
          ],
        },
      });

      return result;
    } catch (error) {
      console.error('News sentiment failed:', error);
      finishAIActivity(activityId, {
        source: 'Stock Analysis',
        title: 'News sentiment failed',
        summary: error.message || `News search failed for ${code}.`,
        error,
      });
      throw error;
    }
  }
}

// Clamp the AI's raw sentiment score into a safe -1..+1 number.
function clampScore(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-1, Math.min(1, n));
}

function normalizeConfidence(raw) {
  const c = String(raw || '').toLowerCase();
  if (c.startsWith('high')) return 'high';
  if (c.startsWith('low')) return 'low';
  return 'medium';
}

function normalizeArticle(a) {
  if (!a || typeof a !== 'object') return null;
  const sentiment = String(a.sentiment || 'neutral').toLowerCase();
  return {
    headline: String(a.headline || '').trim(),
    source: String(a.source || '').trim() || 'Unknown',
    date: typeof a.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(a.date) ? a.date.slice(0, 10) : null,
    sentiment: sentiment === 'positive' || sentiment === 'negative' ? sentiment : 'neutral',
    impact: String(a.impact || '').trim(),
    url: typeof a.url === 'string' && a.url.startsWith('http') ? a.url : null,
  };
}

// Export singleton instance
export const newsService = new NewsService();

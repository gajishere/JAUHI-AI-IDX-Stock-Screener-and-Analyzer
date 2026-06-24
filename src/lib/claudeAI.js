// Claude AI service for enhanced stock analysis
import { finishAIActivity, setAIConfigured, startAIActivity } from './aiSession';
import { formatRpCompact } from './analysis';

const evidenceNote = 'This is an evidence and rationale summary generated from app inputs and model outputs, not hidden chain-of-thought.';

function compactText(text, max = 900) {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

// The Vercel /anthropic proxy (api/anthropic.js) returns a JSON body with a
// "message" field explaining non-2xx outcomes (e.g. "CLAUDE_API_KEY is not
// configured on the server", or Anthropic's own error). We surface that reason
// instead of a bare status code so the API Status page can say what's wrong.
// Exported so the other AI surfaces (news, screening) report the same detail.
export async function rejectWithReason(response, label = 'Claude API error') {
  let reason;
  try {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await response.json();
      reason = data?.message || data?.error?.message || '';
    } else {
      reason = (await response.text()).trim();
    }
  } catch {
    reason = '';
  }
  reason = (reason || '').slice(0, 300);
  throw new Error(reason ? `${label}: ${response.status} — ${reason}` : `${label}: ${response.status}`);
}

// Instruction appended to prompts so Claude writes its prose in the language the
// user has selected in the UI. JSON keys and controlled tokens stay English.
function languageDirective(language) {
  if (language === 'id') {
    return 'RESPONSE LANGUAGE: Write every text field VALUE in natural, professional Bahasa Indonesia for Indonesian retail traders. Keep all JSON keys in English.';
  }
  return 'RESPONSE LANGUAGE: Write all text in English.';
}

async function fileToImageBlock(file) {
  const supportedTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
  const mediaType = file.type || 'image/jpeg';
  if (!supportedTypes.has(mediaType)) return null;

  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  return {
    type: 'image',
    source: {
      type: 'base64',
      media_type: mediaType,
      data: dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl,
    },
  };
}

async function prepareImageBlocks(files = []) {
  const blocks = [];
  for (const file of files) {
    try {
      const block = await fileToImageBlock(file);
      if (block) blocks.push(block);
    } catch (error) {
      console.warn(`Could not process image ${file.name}:`, error);
    }
  }
  return blocks;
}

class ClaudeAIService {
  constructor() {
    // Key is injected server-side by the Vite proxy (vite.config.js /anthropic
    // route) — never sent from the browser. No VITE_ variable needed.
    this.apiUrl = '/anthropic/v1/messages';
    this.model = 'claude-haiku-4-5-20251001'; // Haiku 4.5
    setAIConfigured(true);
  }

  getCurrentDateTime() {
    return new Date().toISOString();
  }

  // Key lives server-side; from the browser's perspective the service is always
  // configured — a misconfigured key will surface as a 401 from the proxy.
  isConfigured() {
    return true;
  }

  async checkHealth() {

    const activityId = startAIActivity({
      source: 'Claude',
      title: 'Live AI health check started',
      summary: 'Sending a minimal request to Claude through the Vite proxy.',
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
          max_tokens: 8,
          messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
        }),
      });

      if (!response.ok) {
        await rejectWithReason(response);
      }

      finishAIActivity(activityId, {
        source: 'Claude',
        title: 'Live AI health check passed',
        summary: 'Claude responded successfully through the configured proxy.',
        evidence: {
          note: evidenceNote,
          sections: [
            {
              title: 'Request',
              facts: [
                { label: 'Endpoint', value: this.apiUrl },
                { label: 'Model', value: this.model },
                { label: 'Max tokens', value: '8' },
              ],
            },
            {
              title: 'Outcome',
              text: 'The API returned a successful HTTP response to a minimal prompt.',
            },
          ],
        },
      });
      return { active: true, configured: true };
    } catch (error) {
      finishAIActivity(activityId, {
        source: 'Claude',
        title: 'Live AI health check failed',
        summary: error.message || 'Claude did not respond successfully.',
        error,
      });
      return { active: false, configured: true, error: error.message || String(error) };
    }
  }

  // Prepare market data summary for Claude
  prepareAnalysisContext(ticker, analysisData, fundamentals) {
    return {
      ticker: analysisData.ticker,
      name: analysisData.name,
      analysisDate: analysisData.asOf,
      currentDateTime: this.getCurrentDateTime(),
      currentPrice: analysisData.close,
      dayChangePct: (analysisData.dayChange * 100).toFixed(2) + '%',
      technical: {
        rsi: analysisData.technical.rsi14?.toFixed(1),
        pricePosition: analysisData.technical.pricePosition,
        vwapRelation: analysisData.technical.vwapNote,
        support: analysisData.keyLevels.idealEntry?.split(' – ')[0],
        resistance: analysisData.keyLevels.targetShortTerm,
        rating: analysisData.technical.rating
      },
      trend: {
        oneWeek: (analysisData.trend.oneWeek * 100).toFixed(2) + '%',
        oneMonth: (analysisData.trend.oneMonth * 100).toFixed(2) + '%',
        threeMonths: (analysisData.trend.threeMonths * 100).toFixed(2) + '%',
        rating: analysisData.trend.rating
      },
      flow: {
        volumeTrend: analysisData.flow.volumeTrend,
        obvInterpretation: analysisData.flow.interpretation,
        rating: analysisData.flow.rating
      },
      fundamentals: fundamentals ? {
        peRatio: fundamentals.per?.toFixed(2),
        revenueGrowthYoy: (fundamentals.revenueGrowth * 100).toFixed(2) + '%',
        debtToEquity: fundamentals.debtToEquity?.toFixed(2),
        eps: fundamentals.eps?.toFixed(2),
        rating: analysisData.fundamentals?.rating
      } : null,
      sentiment: analysisData.sentiment,
      actionRecommendations: analysisData.actionRecommendations,
      keyLevels: analysisData.keyLevels
    };
  }

  // Build the intent-specific block + JSON schema fragment for the AI prompt.
  // intent.mode is 'buy' (user does NOT own the stock) or 'hold' (user owns it
  // at intent.entryPrice × intent.quantity, with intent.pnl precomputed by the
  // caller). Returns the directive text and the controlled verdict tokens so the
  // page can render a tailored verdict card. Falls back to a neutral generic
  // brief when no intent is supplied.
  buildIntentDirective(intent, context) {
    if (!intent || (intent.mode !== 'buy' && intent.mode !== 'hold')) {
      return {
        section: '',
        verdictTokens: 'BUY | WAIT | AVOID | HOLD | SELL | TRIM',
        verdictHelp: 'Your single-word call on the stock.',
      };
    }

    if (intent.mode === 'buy') {
      return {
        section: `TRADER INTENT: The user does NOT own ${context.ticker} yet. They want a direct answer to ONE question: "Is this worth buying right now, or should I wait — and at what price?"
- Decide BUY (worth entering at or near current levels), WAIT (good stock but wait for a better price/setup — name the trigger), or AVOID (not worth buying now).
- Be concrete about the entry zone and the invalidation (stop) level. Tie the call to the technical setup, trend, flow/bandarmology, and any news catalyst.`,
        verdictTokens: 'BUY | WAIT | AVOID',
        verdictHelp: 'BUY = enter now/near here; WAIT = good name, wait for a named trigger; AVOID = do not buy now.',
      };
    }

    // hold
    const pnl = intent.pnl || {};
    return {
      section: `TRADER INTENT: The user ALREADY OWNS ${context.ticker}. Position: average entry Rp ${Number(intent.entryPrice || 0).toLocaleString()} × ${Number(intent.quantity || 0).toLocaleString()} share(s). At the current price Rp ${context.currentPrice.toLocaleString()} the position is ${pnl.isProfit ? 'UP' : 'DOWN'} ${pnl.pct != null ? `${(pnl.pct * 100).toFixed(2)}%` : 'n/a'} (unrealized ${pnl.amount != null ? `Rp ${Math.round(pnl.amount).toLocaleString()}` : 'n/a'}).
They want a direct answer to ONE question: "Should I hold or sell this — and at what price?"
- Decide HOLD (keep the full position, with the level that would change your mind), TRIM (take partial profit / reduce risk — say how much and at what price), or SELL (exit — say why and around what price).
- Reference their entry price and current P&L explicitly. Give a concrete take-profit target and a stop/cut-loss level. Tie it to the technical setup, trend, flow/bandarmology, and any news catalyst.`,
      verdictTokens: 'HOLD | TRIM | SELL',
      verdictHelp: 'HOLD = keep full position; TRIM = reduce/take partial profit; SELL = exit the position.',
    };
  }

  // Generate AI-enhanced analysis
  async getAIEnhancedAnalysis(ticker, analysisData, fundamentals, brokerScreenshots = [], bandar = null, language = 'en', intent = null) {
    if (!this.isConfigured()) {
      throw new Error('Claude API key not configured. Please set CLAUDE_API_KEY in .env.');
    }

    const context = this.prepareAnalysisContext(ticker, analysisData, fundamentals);
    const imageBlocks = await prepareImageBlocks(brokerScreenshots);
    const intentDirective = this.buildIntentDirective(intent, context);
    const promptText = `
            You are an expert Indonesian stock market analyst. Provide enhanced insights for the following stock analysis data:

            ${languageDirective(language)}

            Stock: ${context.ticker} (${context.name})
            Analysis Date: ${context.analysisDate}
            Current Date/Time: ${context.currentDateTime}
            Current Price: Rp ${context.currentPrice.toLocaleString()}
            Day Change: ${context.dayChangePct}

            TECHNICAL ANALYSIS:
            - RSI (14): ${context.technical.rsi}
            - Price Position: ${context.technical.pricePosition}
            - ${context.technical.vwapRelation}
            - Support: Rp ${context.technical.support}
            - Resistance: Rp ${context.technical.resistance}
            - Rating: ${context.technical.rating}

            TREND ANALYSIS:
            - 1 Week: ${context.trend.oneWeek}
            - 1 Month: ${context.trend.oneMonth}
            - 3 Months: ${context.trend.threeMonths}
            - Rating: ${context.trend.rating}

            FLOW & LIQUIDITY:
            - Volume Trend: ${context.flow.volumeTrend}
            - OBV Interpretation: ${context.flow.obvInterpretation}
            - Rating: ${context.flow.rating}

            FUNDAMENTALS:
            ${context.fundamentals ? `
            - P/E Ratio: ${context.fundamentals.peRatio}x
            - Revenue Growth (YoY): ${context.fundamentals.revenueGrowthYoy}
            - Debt-to-Equity: ${context.fundamentals.debtToEquity}x
            - EPS: Rp ${context.fundamentals.eps}
            - Rating: ${context.fundamentals.rating}
            ` : 'Fundamental data not available'}

            OVERALL SENTIMENT: ${context.sentiment}

            ACTION RECOMMENDATIONS:
            - Short Term: ${context.actionRecommendations.shortTerm}
            - Mid Term: ${context.actionRecommendations.midTerm}
            - Long Term: ${context.actionRecommendations.longTerm}

            KEY LEVELS:
            - Ideal Entry: ${context.keyLevels.idealEntry}
            - Stop Loss: ${context.keyLevels.stopLoss}
            - Short Target: ${context.keyLevels.targetShortTerm}
            - Mid Target: ${context.keyLevels.targetMidTerm}
            - Long Target: ${context.keyLevels.targetLongTerm}

            BROKER SCREENSHOTS:
            ${imageBlocks.length > 0
              ? `${imageBlocks.length} uploaded broker screenshot(s) are attached after this text. Read them and incorporate any visible broker flow, accumulation/distribution, order-book, or foreign activity evidence. If the image text is unclear, say so rather than inventing details.`
              : 'No broker screenshots were uploaded.'}

            ${intentDirective.section}

            BANDARMOLOGY (IDX API - Per-ticker broker accumulation/distribution):
            ${bandar && !bandar.empty
              ? `Accumulation/Distribution: ${bandar.accdist}
               Top-5 Stance: ${bandar.top5Accdist}
               Net Value of Top 5: Rp ${formatRpCompact(bandar.top5NetValue)}
               Buyers vs Sellers: ${bandar.totalBuyers} / ${bandar.totalSellers}
               Session Value: Rp ${formatRpCompact(bandar.sessionValue)}
               Top Net Buyers: ${bandar.topBuyers.map(b => `${b.code}${b.foreign ? ' (foreign)' : ''}: Rp ${formatRpCompact(b.value)}`).join(', ')}
               Top Net Sellers: ${bandar.topSellers.map(b => `${b.code}${b.foreign ? ' (foreign)' : ''}: Rp ${formatRpCompact(b.value)}`).join(', ')}`
              : !bandar
                ? 'Bandarmology data not fetched (no ticker or date).'
                : 'No broker-summary data for this session.'}

            Please provide:
            1. A brief AI-enhanced summary (2-3 sentences) highlighting key insights
            2. Any additional considerations or risks not captured in the standard analysis
            3. Confidence level in the analysis (High/Medium/Low) with reasoning
            4. One specific actionable tip for traders
            5. If screenshots are attached, a concise brokerScreenshotRead describing what you could read from them and how it changed or confirmed the view

            Keep the response concise, professional, and focused on actionable insights for Indonesian retail traders.
            Format your response as JSON with these fields:
            {
              "verdict": "string",
              "verdictHeadline": "string",
              "verdictReason": "string",
              "priceGuidance": "string",
              "summary": "string",
              "additionalConsiderations": "string",
              "confidence": "string",
              "confidenceReasoning": "string",
              "actionableTip": "string",
              "brokerScreenshotRead": "string"
            }
            The "verdict" value MUST be exactly one of these English tokens: ${intentDirective.verdictTokens}. (${intentDirective.verdictHelp})
            "verdictHeadline" = one short sentence directly answering the user's question. "verdictReason" = 2-3 sentences justifying the verdict from the analysis. "priceGuidance" = the specific price levels to act on (entry zone / take-profit / stop), as a short phrase.
            The "confidence" value MUST be exactly one of: High, Medium, Low (in English), regardless of the response language. The "verdict" token also stays English. All other string values follow the RESPONSE LANGUAGE instruction above.
            `;
    const activityId = startAIActivity({
      source: 'Stock Analysis',
      title: 'AI insight request started',
      summary: `Reading ${ticker.toUpperCase()} analysis context and asking Claude for concise trader commentary.`,
      details: 'Session log records request flow and outcomes, not hidden model chain-of-thought.',
      evidence: {
        note: evidenceNote,
        sections: [
          {
            title: 'Inputs sent',
            facts: [
              { label: 'Ticker', value: context.ticker },
              { label: 'Name', value: context.name },
              { label: 'Analysis date', value: context.analysisDate },
              { label: 'Price', value: `Rp ${context.currentPrice.toLocaleString()}` },
              { label: 'Day change', value: context.dayChangePct },
              { label: 'Sentiment', value: context.sentiment },
              { label: 'Uploaded screenshots', value: brokerScreenshots.length },
              { label: 'Vision images sent', value: imageBlocks.length },
            ],
          },
          {
            title: 'Criteria requested',
            items: [
              'Technical setup: RSI, price position, support, resistance, and rating.',
              'Trend setup: one-week, one-month, and three-month direction.',
              'Flow and liquidity: volume trend and OBV interpretation.',
              'Fundamentals when available: valuation, growth, leverage, EPS, and rating.',
              'Risk and actionability: confidence, extra considerations, and one trader tip.',
              'Broker screenshot evidence when uploaded: visible broker flow, order-book, foreign activity, and whether it confirms or changes the view.',
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
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 1024,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: promptText },
              ...imageBlocks,
            ],
          }]
        })
      });

      if (!response.ok) {
        await rejectWithReason(response);
      }

      const data = await response.json();
      const content = data.content?.[0]?.text ?? '';
      const parsed = extractJSON(content, this.parseTextResponse(''));
      finishAIActivity(activityId, {
        source: 'Stock Analysis',
        title: 'AI insight received',
        summary: `Claude returned enhanced commentary for ${ticker.toUpperCase()}.`,
        evidence: {
          note: evidenceNote,
          sections: [
            {
              title: 'Why this stock was analyzed',
              text: `${context.ticker} was the user-selected ticker. The model received the computed market report and was asked to add concise trader-facing context.`,
            },
            {
              title: 'Input snapshot',
              facts: [
                { label: 'Ticker', value: context.ticker },
                { label: 'Price', value: `Rp ${context.currentPrice.toLocaleString()}` },
                { label: 'Technical rating', value: context.technical.rating },
                { label: 'Trend rating', value: context.trend.rating },
                { label: 'Flow rating', value: context.flow.rating },
                { label: 'Fundamental rating', value: context.fundamentals?.rating || 'n/a' },
                { label: 'Uploaded screenshots', value: brokerScreenshots.length },
                { label: 'Vision images sent', value: imageBlocks.length },
              ],
            },
            {
              title: 'AI rationale returned',
              facts: [
                { label: 'Confidence', value: parsed.confidence },
                { label: 'Confidence reason', value: parsed.confidenceReasoning },
              ],
              items: [
                parsed.summary && `Summary: ${parsed.summary}`,
                parsed.additionalConsiderations && `Risk/consideration: ${parsed.additionalConsiderations}`,
                parsed.actionableTip && `Actionable tip: ${parsed.actionableTip}`,
                parsed.brokerScreenshotRead && `Screenshot read: ${parsed.brokerScreenshotRead}`,
              ].filter(Boolean),
            },
          ],
        },
      });
      return parsed;
    } catch (error) {
      console.error('Error calling Claude API:', error);
      finishAIActivity(activityId, {
        source: 'Stock Analysis',
        title: 'AI insight failed',
        summary: error.message || `Claude commentary failed for ${ticker.toUpperCase()}.`,
        error,
      });
      throw error;
    }
  }

  // SCREENING engine only — "Framework JAUHI AI": top-down (macro→sector→stock),
  // If/Then scenarios, trader mental model. Distinct from the single-ticker
  // Analysis scoring above, which must stay locked. Reasons over REAL macro
  // reads + the already-screened candidates; never fabricates flow/broker data.
  async getScreeningFramework({ macroText, candidates, mode, asOfDate, language = 'en' }) {
    if (!this.isConfigured()) {
      throw new Error('Claude API key not configured. Please set CLAUDE_API_KEY in .env.');
    }

    const candidateLines = candidates
      .map((c, i) => {
        const score = (c.activeComposite ?? c.composite);
        const oneM = c.oneMonth != null ? `${(c.oneMonth * 100).toFixed(1)}%` : 'n/a';
        return `${i + 1}. ${c.ticker} (${c.name}) — ${c.capTier ?? 'cap n/a'}, close Rp ${Math.round(c.close).toLocaleString()}, 1M ${oneM}, score ${score?.toFixed?.(1) ?? '—'}/10`;
      })
      .join('\n');

    const prompt = `You are "JAUHI AI", a disciplined Indonesian (IDX) swing-trading desk strategist. Think strictly TOP-DOWN (macro → sector → individual stock), frame decisions as If/Then scenarios, and enforce trader mental-model discipline.

This is the SCREENING engine (market scanning), NOT single-stock scoring. The candidate list has already passed hard screening rules: banks excluded, >Rp100T blue chips excluded (unless breakaway/ATH), slow stocks excluded (need real daily range, ATR, and volume). Favor liquid fast-movers with clean structure.

REAL MACRO CONTEXT (as of ${asOfDate || 'latest session'}):
${macroText}

CANDIDATES that passed the screen (mode: ${mode}):
${candidateLines || '(none passed the screen)'}

Per-stock foreign net flow and broker identities are NOT in this feed — do NOT invent broker names, rupiah flow figures, or fundamentals. Reason only from the real macro reads above plus each candidate's price, momentum, and composite score.

Return STRICT JSON (no markdown fences) with exactly this shape:
{
  "regime": "one line: the macro regime today and what it means for taking risk",
  "topDown": "2-3 sentences walking macro -> which themes/sectors are favored or avoided right now, grounded in the real index reads",
  "scenarios": [ { "if": "market condition", "then": "concrete trader action" } ],
  "mentalModel": [ "short discipline reminder" ],
  "picks": [ { "ticker": "CODE", "note": "one line tying this name to the macro and its structure" } ]
}
Provide 2-3 scenarios, 2-3 mentalModel items, and one pick per top candidate (max 3). Concise, professional, plain language for Indonesian retail swing traders.

${languageDirective(language)} (Ticker codes stay as-is.)`;

    const activityId = startAIActivity({
      source: 'Stock Screening',
      title: 'AI framework request started',
      summary: `Building top-down screening narrative for ${candidates.length} candidate${candidates.length === 1 ? '' : 's'}.`,
      details: `Mode: ${mode}; date: ${asOfDate || 'latest session'}`,
      evidence: {
        note: evidenceNote,
        sections: [
          {
            title: 'Screening context',
            facts: [
              { label: 'Mode', value: mode },
              { label: 'Date', value: asOfDate || 'latest session' },
              { label: 'Candidates', value: candidates.length },
            ],
          },
          {
            title: 'Candidate evidence',
            rows: candidates.slice(0, 10).map((candidate, index) => ({
              rank: index + 1,
              ticker: candidate.ticker,
              name: candidate.name,
              close: Math.round(candidate.close ?? 0).toLocaleString(),
              oneMonth: candidate.oneMonth != null ? `${(candidate.oneMonth * 100).toFixed(1)}%` : 'n/a',
              score: (candidate.activeComposite ?? candidate.composite)?.toFixed?.(1) ?? 'n/a',
            })),
          },
          {
            title: 'Rules requested',
            items: [
              'Use real macro context first, then sector/theme fit, then individual stock structure.',
              'Do not invent broker names, foreign-flow figures, or fundamentals not present in the feed.',
              'Respect JAUHI screening constraints: avoid banks, very large blue chips, and slow stocks unless real exception rules are met.',
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
          max_tokens: 1280,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!response.ok) {
        await rejectWithReason(response);
      }
      const data = await response.json();
      const content = data.content?.[0]?.text ?? '';
      const parsed = extractJSON(content, {});
      finishAIActivity(activityId, {
        source: 'Stock Screening',
        title: 'AI framework received',
        summary: 'Claude returned the top-down market framework.',
        evidence: {
          note: evidenceNote,
          sections: [
            {
              title: 'Macro regime returned',
              text: parsed.regime,
            },
            {
              title: 'Top-down rationale',
              text: parsed.topDown,
            },
            {
              title: 'Why these stocks were highlighted',
              rows: Array.isArray(parsed.picks)
                ? parsed.picks.map((pick) => ({
                    ticker: pick.ticker,
                    rationale: pick.note,
                  }))
                : [],
            },
            {
              title: 'If/then scenarios',
              rows: Array.isArray(parsed.scenarios)
                ? parsed.scenarios.map((scenario) => ({
                    if: scenario.if,
                    then: scenario.then,
                  }))
                : [],
            },
            {
              title: 'Mental model reminders',
              items: Array.isArray(parsed.mentalModel) ? parsed.mentalModel : [],
            },
            {
              title: 'Candidate evidence used',
              rows: candidates.slice(0, 10).map((candidate, index) => ({
                rank: index + 1,
                ticker: candidate.ticker,
                close: Math.round(candidate.close ?? 0).toLocaleString(),
                oneMonth: candidate.oneMonth != null ? `${(candidate.oneMonth * 100).toFixed(1)}%` : 'n/a',
                score: (candidate.activeComposite ?? candidate.composite)?.toFixed?.(1) ?? 'n/a',
              })),
            },
            {
              title: 'Macro input excerpt',
              code: compactText(macroText, 1200),
            },
          ],
        },
      });
      return parsed;
    } catch (error) {
      finishAIActivity(activityId, {
        source: 'Stock Screening',
        title: 'AI framework failed',
        summary: error.message || 'Claude could not return the screening framework.',
        error,
      });
      throw error;
    }
  }

  // Fallback parser if Claude doesn't return valid JSON
  parseTextResponse(text) {
    return {
      verdict: '',
      verdictHeadline: '',
      verdictReason: '',
      priceGuidance: '',
      summary: text.substring(0, 200) + '...',
      additionalConsiderations: 'See full analysis for details.',
      confidence: 'Medium',
      confidenceReasoning: 'Based on standard technical and fundamental analysis.',
      actionableTip: 'Monitor volume confirmation for breakout signals.'
    };
  }
}

// Claude often wraps JSON in ```json fences or surrounding prose; pull the
// object out before parsing, and fall back to a text summary if all else fails.
// Exported so the news service (and any future AI surface) reuses the same
// resilient parser instead of each rolling its own. Module-level (not a class
// method) so it can be imported directly without the singleton instance.
export function extractJSON(text, fallback) {
  if (!text) return fallback ?? {};
  let body = text.trim();
  const fenced = body.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) body = fenced[1].trim();
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(body.slice(start, end + 1));
    } catch {
      // fall through to plain parse / text fallback
    }
  }
  try {
    return JSON.parse(body);
  } catch {
    return fallback ?? { summary: text.substring(0, 200) + '...' };
  }
}

// Export singleton instance
export const claudeAIService = new ClaudeAIService();

// Claude AI service for enhanced stock analysis
import { finishAIActivity, recordAIEvent, setAIConfigured, startAIActivity } from './aiSession';
import { formatRpCompact } from './analysis';

const evidenceNote = 'This is an evidence and rationale summary generated from app inputs and model outputs, not hidden chain-of-thought.';

function compactText(text, max = 900) {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max)}...` : text;
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
    // Safely access environment variable
    this.apiKey = typeof import.meta !== 'undefined' && import.meta.env ?
                  import.meta.env.VITE_CLAUDE_API_KEY :
                  undefined;
    // Proxied via vite.config.js (/anthropic -> https://api.anthropic.com).
    // Anthropic blocks direct browser calls (CORS), so we must not hit the API
    // host directly — screeningService.js routes the same way.
    this.apiUrl = '/anthropic/v1/messages';
    this.model = 'claude-haiku-4-5-20251001'; // Haiku 4.5
    setAIConfigured(this.isConfigured());
  }

  getCurrentDateTime() {
    return new Date().toISOString();
  }

  // Check if API key is configured
  isConfigured() {
    return !!this.apiKey && this.apiKey.trim() !== '';
  }

  async checkHealth() {
    setAIConfigured(this.isConfigured());
    if (!this.isConfigured()) {
      recordAIEvent({
        level: 'error',
        source: 'Claude',
        title: 'Claude API key missing',
        summary: 'Set VITE_CLAUDE_API_KEY before running live AI checks.',
      });
      return { active: false, configured: false, error: 'Claude API key not configured' };
    }

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
          'x-api-key': this.apiKey,
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
        throw new Error(`Claude API error: ${response.status}`);
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

  // Generate AI-enhanced analysis
  async getAIEnhancedAnalysis(ticker, analysisData, fundamentals, brokerScreenshots = [], bandar = null, language = 'en') {
    if (!this.isConfigured()) {
      throw new Error('Claude API key not configured. Please set VITE_CLAUDE_API_KEY in environment variables.');
    }

    const context = this.prepareAnalysisContext(ticker, analysisData, fundamentals);
    const imageBlocks = await prepareImageBlocks(brokerScreenshots);
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

            BANDARMOLY (IDX API - Per-ticker broker accumulation/distribution):
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
              "summary": "string",
              "additionalConsiderations": "string",
              "confidence": "string",
              "confidenceReasoning": "string",
              "actionableTip": "string",
              "brokerScreenshotRead": "string"
            }
            The "confidence" value MUST be exactly one of: High, Medium, Low (in English), regardless of the response language. All other string values follow the RESPONSE LANGUAGE instruction above.
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
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          // Permit browser-originated calls (harmless via proxy, required if
          // ever called cross-origin directly).
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
        throw new Error(`Claude API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.content?.[0]?.text ?? '';
      const parsed = this.extractJSON(content);
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

  // Claude often wraps JSON in ```json fences or surrounding prose; pull the
  // object out before parsing, and fall back to a text summary if all else fails.
  extractJSON(text) {
    if (!text) return this.parseTextResponse('');
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
      return this.parseTextResponse(text);
    }
  }

  // SCREENING engine only — "Framework JAUHI AI": top-down (macro→sector→stock),
  // If/Then scenarios, trader mental model. Distinct from the single-ticker
  // Analysis scoring above, which must stay locked. Reasons over REAL macro
  // reads + the already-screened candidates; never fabricates flow/broker data.
  async getScreeningFramework({ macroText, candidates, mode, asOfDate, language = 'en' }) {
    if (!this.isConfigured()) {
      throw new Error('Claude API key not configured. Please set VITE_CLAUDE_API_KEY in environment variables.');
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
          'x-api-key': this.apiKey,
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
        throw new Error(`Claude API error: ${response.status}`);
      }
      const data = await response.json();
      const content = data.content?.[0]?.text ?? '';
      const parsed = this.extractJSON(content);
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
      summary: text.substring(0, 200) + '...',
      additionalConsiderations: 'See full analysis for details.',
      confidence: 'Medium',
      confidenceReasoning: 'Based on standard technical and fundamental analysis.',
      actionableTip: 'Monitor volume confirmation for breakout signals.'
    };
  }
}

// Export singleton instance
export const claudeAIService = new ClaudeAIService();

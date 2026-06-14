import { useState } from 'react';
import {
  BrokerScreenshotField,
  Pill,
  PrimaryButton,
  QuietButton,
  RatingBadge,
  RatingFigure,
  ReportSkeleton,
  Row,
  Section,
} from '../components/report';
import { DatePicker } from '../components/DatePicker';
import { Modal } from '../components/Modal';
import { Stepper } from '../components/Stepper';
import { fetchChart, fetchFundamentals } from '../lib/marketData';
import { buildAnalysisReport, formatPct, formatRp, formatRpCompact } from '../lib/analysis';
import { searchEmiten, findEmiten, brokerContext, EMITEN_COUNT } from '../lib/universe';
import { claudeAIService } from '../lib/claudeAI';

const TIMEFRAMES = [
  {
    key: 'shortTerm',
    title: 'Short term',
    horizon: 'days–week',
    weights: 'Technical 45% · Flow 35% · Trend 20%',
  },
  {
    key: 'midTerm',
    title: 'Mid term',
    horizon: 'week–month',
    weights: 'Trend 35% · Technical 25% · Flow 20% · Fundamental 20%',
  },
  {
    key: 'longTerm',
    title: 'Long term',
    horizon: 'month–year+',
    weights: 'Fundamental 45% · Trend 30% · Technical 15% · Flow 10%',
  },
];

// Signed percentage moves color by direction, not by assumption
function moveTone(ratio) {
  if (ratio == null) return undefined;
  if (ratio > 0) return 'text-pos';
  if (ratio < 0) return 'text-neg';
  return undefined;
}

// Confidence reads as a verdict pill: high → positive, low → negative, else caution.
const confidenceTone = (c) => {
  const v = c?.toLowerCase();
  return v === 'high' ? 'pos' : v === 'low' ? 'neg' : 'warn';
};

const RISK_TONE = { high: 'neg', elevated: 'warn', moderate: 'muted', normal: 'muted' };
const TODAY = new Date().toISOString().slice(0, 10);
const STEP_LABELS = ['Select Stock', 'Select Date'];

export default function StockAnalysisPage() {
  // stage: 'search' → 'date' → (upload modal) → 'report'
  const [stage, setStage] = useState('search');
  const [uploadOpen, setUploadOpen] = useState(false);

  const [ticker, setTicker] = useState('');
  const [date, setDate] = useState('');
  const [brokerScreenshots, setBrokerScreenshots] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [aiAnalysis, setAIAnalysis] = useState(null);
  const [aiLoading, setAILoading] = useState(false);
  const [aiError, setAIError] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [suggestedTickers, setSuggestedTickers] = useState([]);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const [detailsExpanded, setDetailsExpanded] = useState(false);

  const selectedEmiten = findEmiten(ticker);

  const handleTickerChange = (e) => {
    const value = e.target.value.toUpperCase();
    setTicker(value);
    setActiveSuggestion(-1);
    if (value.length >= 1) {
      const matches = searchEmiten(value, 8);
      if (matches.length === 1 && matches[0].code === value) {
        setSuggestedTickers([]);
      } else {
        setSuggestedTickers(matches);
      }
    } else {
      setSuggestedTickers([]);
    }
  };

  // Picking a stock advances to the date step.
  const selectStock = (code) => {
    const known = findEmiten(code);
    if (!known) return;
    setTicker(known.code);
    setSuggestedTickers([]);
    setActiveSuggestion(-1);
    setError(null);
    setStage('date');
  };

  const handleTickerKeyDown = (e) => {
    if (e.key === 'ArrowDown' && suggestedTickers.length) {
      e.preventDefault();
      setActiveSuggestion((prev) => (prev + 1) % suggestedTickers.length);
    } else if (e.key === 'ArrowUp' && suggestedTickers.length) {
      e.preventDefault();
      setActiveSuggestion((prev) => (prev <= 0 ? suggestedTickers.length - 1 : prev - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeSuggestion >= 0 && suggestedTickers[activeSuggestion]) {
        selectStock(suggestedTickers[activeSuggestion].code);
      } else if (suggestedTickers[0]) {
        selectStock(suggestedTickers[0].code);
      } else if (findEmiten(ticker)) {
        selectStock(ticker);
      }
    } else if (e.key === 'Escape') {
      setSuggestedTickers([]);
      setActiveSuggestion(-1);
    }
  };

  // Choosing a date opens the (optional) screenshot step.
  const handlePickDate = (value) => {
    setDate(value);
    setUploadOpen(false);
  };

  const addBrokerScreenshots = (incoming) => {
    setBrokerScreenshots((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}:${f.size}`));
      return [...prev, ...incoming.filter((f) => !seen.has(`${f.name}:${f.size}`))];
    });
  };

  const removeScreenshot = (index) => {
    setBrokerScreenshots((prev) => prev.filter((_, i) => i !== index));
  };

  const runAnalysis = async () => {
    const code = ticker.trim().toUpperCase();
    if (!code || !date || loading) return;
    setUploadOpen(false);
    setLoading(true);
    setAnalysis(null);
    setAIAnalysis(null);
    setAIError(null);
    setError(null);
    try {
      const [chart, fundamentals] = await Promise.all([
        fetchChart(code, '2y'),
        fetchFundamentals(code),
      ]);
      const emitenInfo = findEmiten(code);
      const analysisData = buildAnalysisReport({ code, requestedDate: date, chart, fundamentals, emitenInfo });
      setAnalysis(analysisData);

      // Get AI-enhanced analysis
      setAILoading(true);
      try {
        const aiResult = await claudeAIService.getAIEnhancedAnalysis(code, analysisData, fundamentals, brokerScreenshots);
        setAIAnalysis(aiResult);
      } catch (aiErr) {
        setAIError(aiErr.message || 'Failed to get AI analysis');
      } finally {
        setAILoading(false);
      }

      setStage('report');
    } catch (err) {
      setError(err.message || 'Something went wrong fetching market data.');
    } finally {
      setLoading(false);
    }
  };

  const startOver = () => {
    setStage('search');
    setUploadOpen(false);
    setTicker('');
    setDate('');
    setBrokerScreenshots([]);
    setAnalysis(null);
    setError(null);
    setSuggestedTickers([]);
    setActiveSuggestion(-1);
  };

  const sentimentTone =
    analysis?.sentiment === 'Bullish' ? 'pos' : analysis?.sentiment === 'Bearish' ? 'neg' : 'warn';

  const stepperCurrent = stage === 'date' ? 2 : 1;

  return (
    <div className="flex flex-col">
      {/* ===== Input flow (steps 1–3) ===== */}
      {stage !== 'report' && !loading && (
        <div className="py-6">
          <Stepper steps={STEP_LABELS} current={stepperCurrent} />

          {/* Step 1 — big centered search */}
          {stage === 'search' && (
            <section key="search" className="stage-enter mx-auto mt-12 max-w-2xl text-center">
              <h2 className="font-serif text-4xl font-medium tracking-tight sm:text-5xl">
                Which stock?
              </h2>
              <p className="mt-3 text-sm text-ink-muted">
                Search all {EMITEN_COUNT} IDX-listed companies by code or name.
              </p>

              <div className="relative mt-9 text-left">
                <span className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-ink-muted">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="7" />
                    <path strokeLinecap="round" d="M21 21l-4.3-4.3" />
                  </svg>
                </span>
                <input
                  type="text"
                  value={ticker}
                  onChange={handleTickerChange}
                  onKeyDown={handleTickerKeyDown}
                  placeholder="Try “BBCA” or “Telkom”"
                  autoFocus
                  role="combobox"
                  aria-expanded={suggestedTickers.length > 0}
                  aria-autocomplete="list"
                  className="w-full rounded-2xl border border-line bg-paper py-4 pl-14 pr-5 font-mono text-lg text-ink shadow-lg shadow-ink/5 transition-[transform,opacity] duration-200 placeholder:font-sans placeholder:text-ink-muted/70 hover:border-ink-muted/50 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15"
                />
                {suggestedTickers.length > 0 && (
                  <ul
                    role="listbox"
                    className="dropdown-enter absolute left-0 right-0 z-dropdown mt-2 max-h-72 overflow-y-auto rounded-xl border border-line bg-paper py-1.5 text-left shadow-xl shadow-ink/10"
                  >
                    {suggestedTickers.map((s, index) => (
                      <li key={s.code} role="option" aria-selected={index === activeSuggestion}>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => selectStock(s.code)}
                          onMouseEnter={() => setActiveSuggestion(index)}
                          className={`flex w-full items-baseline gap-3 px-4 py-2.5 text-left transition-colors duration-150 hover:scale-[1.02] active:scale-[0.95] ${
                            index === activeSuggestion ? 'bg-well' : ''
                          }`}
                        >
                          <span className="font-mono text-sm font-semibold">{s.code}</span>
                          <span className="flex-1 truncate text-sm text-ink-muted">{s.name}</span>
                          {s.board === 'Pemantauan Khusus' && (
                            <span className="text-[10px] uppercase tracking-wide text-warn">
                              monitored
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {error && (
                <p role="alert" className="mt-4 text-sm text-neg">
                  {error}
                </p>
              )}
            </section>
          )}

          {/* Step 2 — analysis date via inline calendar */}
          {stage === 'date' && (
            <section key="date" className="stage-enter mx-auto mt-12 max-w-md text-center">
              <button
                type="button"
                onClick={() => setStage('search')}
                className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-line bg-paper py-1.5 pl-3 pr-4 text-sm transition-colors hover:border-ink-muted/50 hover:scale-[1.02] active:scale-[0.95]"
              >
                <span className="text-ink-muted">‹ Change</span>
                <span className="font-mono font-semibold">{ticker}</span>
                <span className="hidden text-ink-muted sm:inline">· {selectedEmiten?.name}</span>
              </button>
              <h2 className="font-serif text-3xl font-medium tracking-tight sm:text-4xl">
                As of which date?
              </h2>
              <p className="mt-3 text-sm text-ink-muted">
                The desk reads price action up to and including this session.
              </p>

              <div className="mt-8 rounded-2xl border border-line bg-paper p-6 shadow-lg shadow-ink/5">
                <DatePicker inline value={date} max={TODAY} onChange={handlePickDate} />
              </div>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                <PrimaryButton onClick={runAnalysis} loading={loading}>
                  Analyze stock
                </PrimaryButton>
                <QuietButton onClick={() => setUploadOpen(true)}>
                  {brokerScreenshots.length > 0
                    ? `${brokerScreenshots.length} screenshot${brokerScreenshots.length > 1 ? 's' : ''} attached`
                    : 'Add screenshots'}
                </QuietButton>
              </div>
              <p className="mt-3 text-xs text-ink-muted">
                Screenshots are optional and can be attached before analyzing.
              </p>
              {error && (
                <div role="alert" className="mt-5 rounded-md border border-neg/30 bg-neg-tint px-4 py-3 text-left">
                  <p className="text-sm font-medium text-neg">Could not build the note</p>
                  <p className="mt-1 text-sm text-ink">{error}</p>
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {/* Step 3 — broker screenshot upload popup */}
      <Modal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        title="Broker summary screenshots"
        description="Optional — the AI reads any attached broker summaries alongside the analysis."
      >
        <BrokerScreenshotField
          id="upload-broker"
          files={brokerScreenshots}
          onAdd={addBrokerScreenshots}
          onRemove={removeScreenshot}
        />

        <div className="mt-6 flex items-center justify-between gap-4">
          <span className="text-sm text-ink-muted">
            {brokerScreenshots.length > 0
              ? `${brokerScreenshots.length} attached`
              : 'No screenshots yet'}
          </span>
          <PrimaryButton onClick={() => setUploadOpen(false)}>Done</PrimaryButton>
        </div>
      </Modal>

      {/* Loading */}
      {loading && (
        <div className="py-6">
          <p className="text-center font-mono text-xs text-ink-muted">
            Pulling live market data for {ticker}…
          </p>
          <ReportSkeleton />
        </div>
      )}

      {/* ===== Report ===== */}
      {stage === 'report' && analysis && (
        <article className="report-enter">
          <div className="mb-8 flex items-center justify-between gap-4">
            <p className="font-mono text-xs text-ink-muted">Analysis complete</p>
            <QuietButton onClick={startOver}>New analysis</QuietButton>
          </div>

          {/* Report masthead */}
          <header className="relative border-b border-line pb-6">
            <div className="relative flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
              <div>
                <p className="font-mono text-xs text-ink-muted">
                  Equity flow note · session {analysis.asOf}
                  {analysis.asOf !== analysis.date && ` (last trade before ${analysis.date})`}
                </p>
                <h2 className="mt-1 font-serif text-6xl font-medium tracking-tighter leading-none">
                  {analysis.ticker}
                </h2>
                <p className="mt-2 text-sm text-ink-muted max-w-prose">
                  {analysis.name ?? 'IDX-listed equity'}
                </p>
              </div>
              <div className="text-right">
                <div className="flex items-baseline gap-3">
                  <RatingFigure rating={analysis.overallRatings.shortTerm.rating} className="text-6xl" />
                  <div className="text-left">
                    <p className="mt-0 text-xs text-ink-muted font-medium">Short-term</p>
                    <p className="mt-0 text-xs text-ink">Rating</p>
                  </div>
                </div>
                <p className="mt-2 font-mono text-sm">
                  {formatRp(analysis.close)}{' '}
                  <span className={moveTone(analysis.dayChange)}>{formatPct(analysis.dayChange)}</span>
                </p>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <Pill tone={sentimentTone} className="font-medium">
                {analysis.sentiment}
              </Pill>
              <Pill tone={analysis.technical.pricePosition.startsWith('Above') ? 'pos' : 'neg'}>
                {analysis.technical.pricePosition}
              </Pill>
              {analysis.fiftyTwoWeekPos != null && (
                <Pill tone="muted">
                  {Math.round(analysis.fiftyTwoWeekPos * 100)}% of 52-week range
                </Pill>
              )}
              {analysis.profile?.capTier && (
                <Pill tone="muted">{analysis.profile.capTier}</Pill>
              )}
              {analysis.profile?.risk && analysis.profile.risk.level !== 'normal' && (
                <Pill tone={RISK_TONE[analysis.profile.risk.level]}>
                  {analysis.profile.board}
                </Pill>
              )}
              {brokerScreenshots.length > 0 && (
                <Pill tone="info">
                  {brokerScreenshots.length} screenshot{brokerScreenshots.length > 1 ? 's' : ''} on
                  file
                </Pill>
              )}
            </div>
          </header>

          {/* AI-enhanced insight — speaks the same inline-label voice as the report */}
          {aiAnalysis && (
            <Section
              title="AI-enhanced insights"
              aside={
                aiAnalysis.confidence ? (
                  <Pill tone={confidenceTone(aiAnalysis.confidence)}>
                    {aiAnalysis.confidence} confidence
                  </Pill>
                ) : null
              }
            >
              <div className="max-w-prose space-y-3">
                {aiAnalysis.summary && (
                  <p className="text-sm leading-relaxed text-ink">{aiAnalysis.summary}</p>
                )}
                {aiAnalysis.additionalConsiderations && (
                  <p className="text-sm leading-relaxed">
                    <span className="font-medium">Also worth noting.</span>{' '}
                    <span className="text-ink-muted">{aiAnalysis.additionalConsiderations}</span>
                  </p>
                )}
                {aiAnalysis.confidenceReasoning && (
                  <p className="text-sm leading-relaxed">
                    <span className="font-medium">Why this read.</span>{' '}
                    <span className="text-ink-muted">{aiAnalysis.confidenceReasoning}</span>
                  </p>
                )}
                {aiAnalysis.actionableTip && (
                  <p className="text-sm leading-relaxed">
                    <span className="font-medium">Trader tip.</span>{' '}
                    <span className="text-ink-muted">{aiAnalysis.actionableTip}</span>
                  </p>
                )}
                {aiAnalysis.brokerScreenshotRead && (
                  <p className="text-sm leading-relaxed">
                    <span className="font-medium">Screenshot read.</span>{' '}
                    <span className="text-ink-muted">{aiAnalysis.brokerScreenshotRead}</span>
                  </p>
                )}
              </div>
            </Section>
          )}
          {aiLoading && (
            <Section title="AI-enhanced insights">
              <div className="flex items-center gap-3">
                <span className="jauhi-scan" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
                <span className="font-mono text-xs text-ink-muted">AI is reading the note…</span>
              </div>
            </Section>
          )}
          {aiError && !aiLoading && (
            <Section title="AI-enhanced insights">
              <p className="max-w-prose text-sm text-ink-muted">
                The note above is built from market data; AI commentary is unavailable ({aiError}).
              </p>
            </Section>
          )}


          {/* Essential sections - always visible */}
          <div className="space-y-6">
            {/* Rating by timeframe */}
            <Section title="Rating by timeframe">
              <div className="relative grid gap-6 md:grid-cols-3 md:gap-0 md:divide-x md:divide-line">
                {TIMEFRAMES.map((frame) => {
                  const overall = analysis.overallRatings[frame.key];
                  return (
                    <div key={frame.key} className="md:px-6 md:first:pl-0 md:last:pr-0">
                      <p className="text-sm font-medium">
                        {frame.title} <span className="font-normal text-ink-muted">({frame.horizon})</span>
                      </p>
                      <p className="mt-2 flex items-baseline gap-3">
                        <RatingFigure rating={overall.rating} className="text-4xl" />
                        <span className="font-mono text-sm text-ink-muted">{overall.score.toFixed(1)} / 9.0</span>
                      </p>
                      <p className="mt-2.5 text-sm">
                        <span className="text-ink-muted">Key driver — </span>
                        {overall.keyDriver}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-ink-muted">{frame.weights}</p>
                    </div>
                  );
                })}
              </div>
            </Section>

            {/* Rationale */}
            <Section title="Rationale">
              <div className="relative max-w-prose space-y-3">
                {TIMEFRAMES.map((frame) => (
                  <p key={frame.key} className="text-sm leading-relaxed">
                    <span className="font-medium">{frame.title}.</span>{' '}
                    <span className="text-ink-muted">{analysis.briefRationale[frame.key]}</span>
                  </p>
                ))}
              </div>
            </Section>

            {/* Action plan */}
            <Section title="Action plan">
              <div className="relative max-w-prose space-y-3">
                <p className="text-sm leading-relaxed">
                  <span className="font-medium">Short term · trading.</span>{' '}
                  <span className="text-ink-muted">{analysis.actionRecommendations.shortTerm}</span>
                </p>
                <p className="text-sm leading-relaxed">
                  <span className="font-medium">Mid term · swing.</span>{' '}
                  <span className="text-ink-muted">{analysis.actionRecommendations.midTerm}</span>
                </p>
                <p className="text-sm leading-relaxed">
                  <span className="font-medium">Long term · invest.</span>{' '}
                  <span className="text-ink-muted">{analysis.actionRecommendations.longTerm}</span>
                </p>
              </div>
            </Section>

            {/* Key levels */}
            <Section title="Key levels">
              <div className="relative grid gap-x-12 md:grid-cols-2">
                <Row label="Ideal entry" value={analysis.keyLevels.idealEntry} />
                <Row label="Stop loss" value={analysis.keyLevels.stopLoss} tone="text-neg" />
                <Row label="Target — short term" value={analysis.keyLevels.targetShortTerm} tone="text-pos" />
                <Row label="Target — mid term" value={analysis.keyLevels.targetMidTerm} tone="text-pos" />
                <Row label="Target — long term" value={analysis.keyLevels.targetLongTerm} tone="text-pos" />
              </div>
            </Section>
          </div>

          <div className="mt-6 border-t border-line pt-6">
            <QuietButton onClick={() => setDetailsExpanded(!detailsExpanded)}>
              {detailsExpanded ? 'Hide details' : 'Show details & analysis'}
            </QuietButton>
          </div>
          {/* Expandable details */}
          <div
            className={`details-collapse ${detailsExpanded ? 'details-collapse-open' : ''}`}
            aria-hidden={!detailsExpanded}
          >
            <div className="space-y-6">
              {analysis.profile && (
                <Section title="Company profile">
                  {analysis.profile.risk && analysis.profile.risk.level === 'high' && (
                    <div
                      role="alert"
                      className="mb-4 rounded-md border border-neg/30 bg-neg-tint px-4 py-2.5 text-sm text-neg"
                    >
                      {analysis.profile.risk.note}.
                    </div>
                  )}
                  <div className="relative grid gap-x-12 md:grid-cols-2">
                    <Row label="Market cap" value={formatRpCompact(analysis.profile.marketCap)} />
                    <Row label="Size tier" value={analysis.profile.capTier ?? '—'} />
                    <Row
                      label="Shares outstanding"
                      value={
                        analysis.profile.shares
                          ? analysis.profile.shares.toLocaleString('en-US')
                          : '—'
                      }
                    />
                    <Row label="Listing board" value={analysis.profile.board ?? '—'} />
                    <Row label="Listed since" value={analysis.profile.listed ?? '—'} />
                  </div>
                  <p className="mt-2 text-xs text-ink-muted">
                    Profile sourced from the IDX emiten reference (shares outstanding, listing board).
                  </p>
                </Section>
              )}

              <div className="mt-2">
                <Section
                  title="Flow & liquidity"
                  aside={<RatingBadge rating={analysis.flow.rating} />}
                >
                  <div className="relative grid gap-x-12 md:grid-cols-2">
                    <Row
                      label="Value traded (session)"
                      value={formatRpCompact(analysis.flow.lastValueTraded)}
                    />
                    <Row
                      label="20-day average value"
                      value={formatRpCompact(analysis.flow.avgValueTraded20)}
                    />
                    <Row label="Volume trend" value={analysis.flow.volumeTrend} />
                    <Row
                      label="OBV interpretation"
                      value={analysis.flow.interpretation}
                      tone={
                        analysis.flow.interpretation === 'Accumulation'
                          ? 'text-pos'
                          : analysis.flow.interpretation === 'Distribution'
                            ? 'text-neg'
                            : undefined
                      }
                    />
                  </div>
                  <p className="mt-3 max-w-prose text-xs text-ink-muted">
                    Per-ticker foreign and broker flows are not in the public price feed; this section
                    reads participation from on-balance volume and traded value instead.
                  </p>
                </Section>
              </div>

              <Section title="Market context · broker activity">
                <div className="relative grid gap-x-12 md:grid-cols-2">
                  <Row
                    label="Session turnover (all brokers)"
                    value={formatRpCompact(brokerContext.turnoverValue)}
                  />
                  <Row
                    label="Foreign broker share"
                    value={
                      brokerContext.foreignShare != null
                        ? `${Math.round(brokerContext.foreignShare * 100)}%`
                        : '—'
                    }
                  />
                  <Row
                    label="Transactions"
                    value={brokerContext.totalFreq.toLocaleString('en-US')}
                  />
                  <Row label="Member firms" value={String(brokerContext.brokerCount)} />
                </div>
                <p className="mb-1 mt-4 text-sm text-ink-muted">Most active brokers (by value)</p>
                <div className="relative grid gap-x-12 md:grid-cols-2">
                  {brokerContext.topByValue.map((b) => (
                    <Row
                      key={b.code}
                      label={`${b.code} · ${b.name}${b.foreign ? ' (foreign)' : ''}`}
                      value={formatRpCompact(b.value)}
                    />
                  ))}
                </div>
                <p className="mt-3 max-w-prose text-xs text-ink-muted">
                  Market-wide broker tape from the reference session (broker-data source). Shown as
                  participation context — it is not specific to {analysis.ticker}.
                </p>
              </Section>

              <Section
                title="Technicals"
                aside={<RatingBadge rating={analysis.technical.rating} />}
              >
                <div className="relative grid gap-x-12 md:grid-cols-2">
                  <Row label="Price position" value={analysis.technical.pricePosition} />
                  <Row label="RSI (14)" value={analysis.technical.rsi14?.toFixed(0) ?? '—'} />
                  <Row label="Distance to ARA" value={formatPct(analysis.technical.distanceToAra)} />
                  <Row label="Distance to ARB" value={formatPct(analysis.technical.distanceToArb)} />
                </div>
                <p className="mt-3 max-w-prose text-sm leading-relaxed text-ink">
                  {analysis.technical.vwapNote}.{' '}
                  <span className="text-ink-muted">
                    Support: {formatRp(analysis.technical.support)} | Resistance:{' '}
                    {formatRp(analysis.technical.resistance)} (20-session range)
                  </span>
                </p>
              </Section>

              <Section
                title="Fundamentals"
                aside={analysis.fundamentals && <RatingBadge rating={analysis.fundamentals.rating} />}
              >
                {analysis.fundamentals ? (
                  <div className="relative grid gap-x-12 md:grid-cols-2">
                    <Row
                      label="Earnings per share (annual)"
                      value={formatRp(analysis.fundamentals.eps, 0)}
                    />
                    <Row
                      label="Trailing P/E"
                      value={
                        analysis.fundamentals.per != null
                          ? `${analysis.fundamentals.per.toFixed(1)}x`
                          : '—'
                      }
                    />
                    <Row
                      label="Revenue growth (YoY)"
                      value={formatPct(analysis.fundamentals.revenueGrowth)}
                      tone={moveTone(analysis.fundamentals.revenueGrowth)}
                    />
                    <Row
                      label="Debt to equity"
                      value={
                        analysis.fundamentals.debtToEquity != null
                          ? `${analysis.fundamentals.debtToEquity.toFixed(2)}x`
                          : '—'
                      }
                    />
                  </div>
                ) : (
                  <p className="max-w-prose text-sm text-ink-muted">
                    Published fundamentals were unavailable for this ticker; ratings below lean on
                    price structure and flow.
                  </p>
                )}
              </Section>

              <Section
                title="Trend"
                aside={<RatingBadge rating={analysis.trend.rating} />}>
                <div className="relative grid gap-x-12 md:grid-cols-2">
                  <Row label="1-week move" value={formatPct(analysis.trend.oneWeek)} tone={moveTone(analysis.trend.oneWeek)} />
                  <Row label="1-month move" value={formatPct(analysis.trend.oneMonth)} tone={moveTone(analysis.trend.oneMonth)} />
                  <Row label="3-month move" value={formatPct(analysis.trend.threeMonths)} tone={moveTone(analysis.trend.threeMonths)} />
                  <Row label="Volume trend" value={analysis.trend.volumeTrend} />
                </div>
              </Section>
            </div>
          </div>
        </article>
      )}
    </div>
  );
}

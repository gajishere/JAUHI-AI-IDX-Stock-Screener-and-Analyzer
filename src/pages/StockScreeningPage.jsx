import { useState } from 'react';
import {
  BrokerScreenshotField,
  FieldLabel,
  Pill,
  PrimaryButton,
  QuietButton,
  RatingFigure,
  ReportSkeleton,
  Row,
} from '../components/report';
import { Stepper } from '../components/Stepper';
import { DatePicker } from '../components/DatePicker';
import { Modal } from '../components/Modal';
import { ratingFromScore, formatPct, formatRp } from '../lib/analysis';
import { screeningStage1, screeningStage2, diagnoseStock } from '../lib/screeningService';
import { CATEGORIES, DEFAULT_CATEGORY, CAP_TIERS, getCategory } from '../lib/screeningCategories';
import { SECTORS, searchEmiten, findEmiten } from '../lib/universe';
import { conglomerateGroup } from '../data/conglomerates';
import { fetchMacro, summarizeMacro } from '../lib/macro';
import { claudeAIService } from '../lib/claudeAI';

const SAVED_KEY = 'idx-screenings';
const TODAY = new Date().toISOString().slice(0, 10);
const COUNT_OPTIONS = [3, 5, 10, 15];

// Stepper labels for screening flow
const STEP_LABELS = ['Select Date', 'Run Screening', 'Refine with Brokers'];

// Constants needed for framework display (removed from old screening logic)
const EQUITY_INDEX = new Set(['ihsg', 'sp500', 'nasdaq', 'nikkei', 'hangseng']);
const fmtSignedPct = (v) => (v == null ? '—' : `${v > 0 ? '+' : ''}${(v * 100).toFixed(2)}%`);

// Concise controlling owner for a conglomerate-group ticker (parenthetical
// detail stripped), or null. Shown on the candidate list for the Conglomerate
// screen only.
function conglomerateOwner(ticker) {
  const grp = conglomerateGroup(ticker);
  if (!grp) return null;
  return grp.controller.replace(/\s*\(.*\)\s*$/, '');
}


// Compact "why isn't this on the list?" search — a smaller sibling of the
// Compact "why isn't this on the list?" search — a smaller sibling of the
// Stock Analysis search. Runs the active screen's gates against one ticker
// (via diagnoseStock) and shows a per-criterion pass/fail breakdown.
function WhyNotRecommended({ date, filters, results }) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [diag, setDiag] = useState(null);
  const [err, setErr] = useState(null);

  const categoryLabel = getCategory(filters.category).label;

  const onChange = (e) => {
    const v = e.target.value.toUpperCase();
    setQuery(v);
    setActive(-1);
    if (v.length >= 1) {
      const m = searchEmiten(v, 6);
      setSuggestions(m.length === 1 && m[0].code === v ? [] : m);
    } else {
      setSuggestions([]);
    }
  };

  const run = async (code) => {
    const known = findEmiten(code);
    if (!known) return;
    setQuery(known.code);
    setSuggestions([]);
    setActive(-1);
    setErr(null);
    setDiag(null);
    setLoading(true);
    try {
      const res = await diagnoseStock(known.code, date, filters, results);
      setDiag(res);
    } catch (e) {
      setErr(e.message || 'Could not diagnose that stock.');
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown' && suggestions.length) {
      e.preventDefault();
      setActive((p) => (p + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp' && suggestions.length) {
      e.preventDefault();
      setActive((p) => (p <= 0 ? suggestions.length - 1 : p - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (active >= 0 && suggestions[active]) run(suggestions[active].code);
      else if (suggestions[0]) run(suggestions[0].code);
      else if (findEmiten(query)) run(query);
    } else if (e.key === 'Escape') {
      setSuggestions([]);
      setActive(-1);
    }
  };

  const tone = diag?.recommended ? 'pos' : diag?.qualifies ? 'warn' : 'neg';

  return (
    <section className="mt-8 border-t border-line pt-6">
      <h3 className="font-serif text-xl font-medium">Why isn’t this stock recommended?</h3>
      <p className="mt-1.5 max-w-prose text-sm text-ink-muted">
        Search any IDX ticker to see exactly which {categoryLabel} criteria it passes or fails for this screen.
      </p>

      <div className="relative mt-4 max-w-md text-left">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path strokeLinecap="round" d="M21 21l-4.3-4.3" />
          </svg>
        </span>
        <input
          type="text"
          value={query}
          onChange={onChange}
          onKeyDown={onKeyDown}
          placeholder="Check a ticker — e.g. “ASII”"
          role="combobox"
          aria-expanded={suggestions.length > 0}
          aria-autocomplete="list"
          className="w-full rounded-xl border border-line bg-paper py-2.5 pl-10 pr-4 font-mono text-sm text-ink shadow-sm shadow-ink/5 transition-[transform,opacity] duration-200 placeholder:font-sans placeholder:text-ink-muted hover:border-ink-muted/50 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
        />
        {suggestions.length > 0 && (
          <ul
            role="listbox"
            className="dropdown-enter absolute left-0 right-0 z-dropdown mt-2 max-h-60 overflow-y-auto rounded-xl border border-line bg-paper py-1.5 shadow-xl shadow-ink/10"
          >
            {suggestions.map((s, index) => (
              <li key={s.code} role="option" aria-selected={index === active}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => run(s.code)}
                  onMouseEnter={() => setActive(index)}
                  className={`flex w-full items-baseline gap-3 px-3.5 py-2 text-left transition-colors duration-150 ${
                    index === active ? 'bg-well' : ''
                  }`}
                >
                  <span className="font-mono text-sm font-semibold">{s.code}</span>
                  <span className="flex-1 truncate text-xs text-ink-muted">{s.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {loading && (
        <div className="mt-4 flex items-center gap-3">
          <span className="jauhi-scan" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span className="font-mono text-xs text-ink-muted">Checking {query} against the screen…</span>
        </div>
      )}
      {err && !loading && <p className="mt-4 text-sm text-neg">{err}</p>}

      {diag && !loading && (
        <div className="mt-5 max-w-md rounded-xl border border-line p-4">
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-mono text-sm font-semibold text-ink">{diag.ticker}</p>
            <Pill tone={tone}>
              {diag.recommended ? 'On the list' : diag.qualifies ? 'Qualifies, not surfaced' : 'Excluded'}
            </Pill>
          </div>
          {diag.name && <p className="mt-0.5 text-xs text-ink-muted">{diag.name}</p>}
          <p className="mt-3 text-sm leading-relaxed text-ink">{diag.verdict}</p>
          {diag.checks.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {diag.checks.map((c, i) => (
                <li key={i} className="flex items-baseline gap-2 text-sm">
                  <span className={`shrink-0 ${c.ok ? 'text-pos' : 'text-neg'}`} aria-hidden="true">
                    {c.ok ? '✓' : '✗'}
                  </span>
                  <span className="flex-1 text-ink-muted">{c.label}</span>
                  <span className={`shrink-0 font-mono text-xs tabular-nums ${c.ok ? 'text-ink' : 'text-neg'}`}>
                    {c.detail}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

export default function StockScreeningPage() {
  // Flow: idle → (date modal) → loading → results → (upload modal) → re-ranked results
  const [dateModalOpen, setDateModalOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [newScreeningConfirmOpen, setNewScreeningConfirmOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Stepper state
  const [stage, setStage] = useState('date'); // 'date' → 'screening' → 'refine'

  // Filters
  const [numStocks, setNumStocks] = useState(5);
  const [analysisMode, setAnalysisMode] = useState('closing');
  const [category, setCategory] = useState(DEFAULT_CATEGORY);
  const [capTier, setCapTier] = useState('every');
  const [sector, setSector] = useState('');
  const [boardRiskFilter, setBoardRiskFilter] = useState('');

  // Run state
  const [asOfDate, setAsOfDate] = useState('');
  const [screenings, setScreenings] = useState([]);
  const [reranked, setReranked] = useState(false);
  const [brokerScreenshots, setBrokerScreenshots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // For closing‑mode workflow
  const [awaitingBrokerUpload, setAwaitingBrokerUpload] = useState(false);
  const [initialScreenings, setInitialScreenings] = useState([]);
  // AI usage tracking
  const [aiUsed, setAiUsed] = useState(false);

  // Framework JAUHI AI — real macro context + AI top-down narrative
  const [macro, setMacro] = useState(null);
  const [framework, setFramework] = useState(null);
  const [frameworkLoading, setFrameworkLoading] = useState(false);
  const [frameworkError, setFrameworkError] = useState(null);

  // Saving
  const [screeningName, setScreeningName] = useState('');
  const [savedAs, setSavedAs] = useState(null);
  const [savedScreenings, setSavedScreenings] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(SAVED_KEY)) ?? [];
    } catch {
      return [];
    }
  });

  const [saveSuccess, setSaveSuccess] = useState(false);
  const [rerankSuccess, setRerankSuccess] = useState(false);

  const hasResults = screenings.length > 0;
  const activeCategory = getCategory(category);
  // Strategy now lives inline (always visible), so the "More filters" badge
  // counts only the secondary settings tucked inside the panel.
  const moreFiltersCount =
    (analysisMode !== 'closing' ? 1 : 0) +
    (capTier !== 'every' ? 1 : 0) +
    (sector ? 1 : 0) +
    (boardRiskFilter ? 1 : 0);

  // Stepper progress: date → screening → refine
  let stepperCurrent = 1;
  if (stage === 'screening' || stage === 'refine') stepperCurrent = 2;
  if (stage === 'refine') stepperCurrent = 3;

  // Real macro context (always) + AI top-down narrative (when the Claude key is set).
  const generateFramework = async (list, date) => {
    setMacro(null);
    setFramework(null);
    setFrameworkError(null);
    setFrameworkLoading(true);
    try {
      const macroData = await fetchMacro(date || asOfDate);
      setMacro(macroData);
      if (claudeAIService.isConfigured() && list.length > 0) {
        try {
          const fw = await claudeAIService.getScreeningFramework({
            macroText: summarizeMacro(macroData),
            candidates: list.slice(0, 5),
            mode: analysisMode,
            asOfDate: date || asOfDate,
          });
          setFramework(fw);
        } catch (e) {
          setFrameworkError(e.message || 'AI narrative unavailable.');
        }
      }
    } catch (e) {
      setFrameworkError(e.message || 'Macro data unavailable.');
    } finally {
      setFrameworkLoading(false);
    }
  };

  const runScreening = async (date) => {
    if (loading) return;
    // Mid-day mode needs the Session-1 foreign-activity screenshot first.
    if (analysisMode === 'midday' && brokerScreenshots.length === 0) {
      setError('Mid‑day screening needs a Session‑1 foreign-activity screenshot — add it via “Attach broker screenshots” first.');
      return;
    }
    setLoading(true);
    setError(null);
    setReranked(false);
    setScreenings([]);
    setSavedAs(null);
    setMacro(null);
    setFramework(null);
    setFrameworkError(null);
    setAwaitingBrokerUpload(false);
    setInitialScreenings([]);
    setStage('screening');

    try {
      // Stage 1: scan the live IDX universe + score (JAUHI enforced in code).
      setError('Scanning the IDX universe and applying JAUHI screening...');
      const stage1Result = await screeningStage1(date, numStocks, {
        category,
        capTier,
        sector,
        boardLevel: boardRiskFilter || '',
      });

      // Track whether AI was used in Stage 1
      setAiUsed(!!stage1Result.aiReview);

      if (!stage1Result || stage1Result.candidates.length === 0) {
        setError('No candidates passed JAUHI restrictions. Try a different date or adjust filters.');
        setLoading(false);
        return;
      }

      // Closing mode: pause for broker-summary uploads before Stage 2
      if (analysisMode === 'closing') {
        // Store Stage 1 results for later Stage 2 processing
        setInitialScreenings(stage1Result.candidates);
        setAiUsed(!!stage1Result.aiReview);
        setAwaitingBrokerUpload(true);
        setLoading(false);
        setError(null);
        setStage('refine');
        generateFramework(stage1Result.candidates, date);
        return;
      }

      // Mid-day mode: proceed directly to Stage 2 with broker screenshots
      setError('Analyzing broker screenshots and detecting pack hunting patterns...');
      const stage2Params = {
        date: date,
        candidates: stage1Result.candidates,
        images: brokerScreenshots
      };

      const stage2Result = await screeningStage2(stage2Params);

      // Process Stage 2 results for display
      if (stage2Result && stage2Result.finalRankingTable) {
        // Carry the real market data from the enriched Stage 1 candidates onto
        // the re-ranked rows so name/price/1M aren't lost behind the AI ranking.
        const byTicker = new Map(stage1Result.candidates.map((c) => [c.ticker, c]));
        const formattedResults = stage2Result.finalRankingTable.map((item) => {
          const base = byTicker.get(item.ticker) ?? {};
          return {
            ticker: item.ticker,
            name: base.name ?? item.ticker,
            rank: item.ranking,
            close: base.close ?? 0,
            oneMonth: base.oneMonth ?? null,
            capTier: base.capTier ?? null,
            board: base.board ?? null,
            activeComposite: item.finalScore,
            overallRating: ratingFromScore(item.finalScore),
            scores: {
              shortTerm: item.baseScore / 100, // Normalize to 0-1 range
              midTerm: item.baseScore / 100,
              longTerm: item.baseScore / 100
            },
            marketCap: base.marketCap ?? 0
          };
        });

        setScreenings(formattedResults);
        setLoading(false);

        // Store raw analysis for potential display
        // Note: In a full implementation, we might want to display this raw analysis
      } else {
        setError('Failed to get screening results from AI analysis.');
        setLoading(false);
      }

      generateFramework(stage1Result.candidates, date);
    } catch (err) {
      console.error('Error in runScreening:', err);
      setError(err.message || 'An unexpected error occurred during screening.');
      setLoading(false);
    }
  };

  const handleDatePicked = (value) => {
    setAsOfDate(value);
    setDateModalOpen(false);
    runScreening(value);
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

  // Re-rank with AI-powered Stage 2 analysis. In closing mode the candidates
  // are held in initialScreenings until the broker uploads arrive.
  const rerankWithBrokers = async () => {
    const source = awaitingBrokerUpload ? initialScreenings : screenings;
    if (source.length === 0) return;

    setLoading(true);
    setError(null);

    try {
      // Stage 2: Analyze broker screenshots, detect pack hunting, apply penalties
      const stage2Params = {
        date: asOfDate,
        candidates: source,
        images: brokerScreenshots
      };

      const stage2Result = await screeningStage2(stage2Params);

      // Process Stage 2 results for display
      if (stage2Result && stage2Result.finalRankingTable) {
        // Carry the real market data from the enriched Stage 1 candidates onto
        // the re-ranked rows so name/price/1M aren't lost behind the AI ranking.
        const byTicker = new Map(source.map((c) => [c.ticker, c]));
        const formattedResults = stage2Result.finalRankingTable.map((item) => {
          const base = byTicker.get(item.ticker) ?? {};
          return {
            ticker: item.ticker,
            name: base.name ?? item.ticker,
            rank: item.ranking,
            close: base.close ?? 0,
            oneMonth: base.oneMonth ?? null,
            capTier: base.capTier ?? null,
            board: base.board ?? null,
            activeComposite: item.finalScore,
            overallRating: ratingFromScore(item.finalScore),
            scores: {
              shortTerm: item.baseScore / 100, // Normalize to 0-1 range
              midTerm: item.baseScore / 100,
              longTerm: item.baseScore / 100
            },
            marketCap: base.marketCap ?? 0
          };
        });

        setScreenings(formattedResults);
        setReranked(true);
        setAwaitingBrokerUpload(false);
        setUploadOpen(false);
        setRerankSuccess(true);
        setTimeout(() => setRerankSuccess(false), 1500);
      } else {
        setError('Failed to get screening results from AI analysis.');
      }
    } catch (err) {
      console.error('Error in rerankWithBrokers:', err);
      setError(err.message || 'An unexpected error occurred during re-ranking.');
    } finally {
      setLoading(false);
    }

    generateFramework(source, asOfDate);
  };

  const handleRefineAction = () => {
    if (brokerScreenshots.length === 0) {
      setUploadOpen(true);
      return;
    }
    rerankWithBrokers();
  };

  const handleSaveScreening = () => {
    if (!hasResults) return;
    const name = screeningName.trim() || `Screening ${asOfDate || TODAY}`;
    const entry = {
      name,
      date: asOfDate || TODAY,
      reranked,
      savedAt: new Date().toISOString(),
      results: screenings.map((s) => ({
        ticker: s.ticker,
        rank: s.rank,
        overallRating: s.overallRating,
        composite: s.activeComposite,
      })),
    };
    const next = [entry, ...savedScreenings.filter((s) => s.name !== name)];
    localStorage.setItem(SAVED_KEY, JSON.stringify(next));
    setSavedScreenings(next);
    setSavedAs(name);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 1500);
  };

  const requestNewScreening = () => {
    setNewScreeningConfirmOpen(true);
  };

  const startNewScreening = () => {
    setNewScreeningConfirmOpen(false);
    setDateModalOpen(false);
    setUploadOpen(false);
    setFiltersOpen(false);
    setAsOfDate('');
    setScreenings([]);
    setReranked(false);
    setBrokerScreenshots([]);
    setLoading(false);
    setError(null);
    setAwaitingBrokerUpload(false);
    setInitialScreenings([]);
    setAiUsed(false);
    setMacro(null);
    setFramework(null);
    setFrameworkLoading(false);
    setFrameworkError(null);
    setSavedAs(null);
    setScreeningName('');
    setSaveSuccess(false);
    setRerankSuccess(false);
    setStage('date');
  };

  const ratingFor = (r) => r.overallRating; // base rating; ranking order reflects active composite

  // Top-down "Framework JAUHI AI" panel: real macro reads + (optional) AI narrative.
  const frameworkSection = (macro || frameworkLoading || frameworkError) && (
    <section className="mt-8 border-t border-line pt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-wide text-ink-muted">JAUHI AI analyzed</p>
          <h3 className="font-serif text-xl font-medium">Market framework · top-down read</h3>
        </div>
        {macro && (
          <Pill tone={macro.bias === 'Bullish' ? 'pos' : macro.bias === 'Bearish' ? 'neg' : 'warn'}>
            {macro.regime} · {macro.bias}
          </Pill>
        )}
      </div>

      {macro && (
        <>
          <div className="mt-4 grid gap-x-10 sm:grid-cols-2">
            {Object.keys(macro.indices)
              .filter((k) => macro.indices[k])
              .map((k) => {
                const ch = macro.indices[k].dayChange;
                const tone = EQUITY_INDEX.has(k)
                  ? ch > 0
                    ? 'text-pos'
                    : ch < 0
                      ? 'text-neg'
                      : undefined
                  : undefined;
                return (
                  <Row
                    key={k}
                    label={macro.labels[k]}
                    value={`${macro.indices[k].close.toLocaleString(undefined, { maximumFractionDigits: 2 })} · ${fmtSignedPct(ch)}`}
                    tone={tone}
                  />
                );
              })}
          </div>
          <p className="mt-2 text-xs text-ink-muted">
            {macro.reasons.length ? macro.reasons.join(' · ') : 'Flat tape.'} — from live IHSG, FX & global indices.
          </p>
        </>
      )}

      {frameworkLoading && (
        <div className="mt-4 flex items-center justify-center gap-3">
          <span className="jauhi-scan" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span className="font-mono text-xs text-ink-muted">JAUHI AI is analyzing...</span>
        </div>
      )}
      {frameworkError && !frameworkLoading && (
        <p className="mt-3 text-xs text-ink-muted">
          Macro shown above; AI narrative unavailable ({frameworkError})
        </p>
      )}

      {framework && (
        <div className="mt-6 border-t border-line pt-5">
          <div className="mb-4 flex flex-wrap items-baseline gap-3">
            <p className="text-base font-semibold text-ink">
              JAUHI AI analysis result
            </p>
            <Pill tone="pos">Complete</Pill>
          </div>
          <div className="max-w-prose space-y-5">
          {framework.topDown && <p className="text-sm leading-relaxed text-ink">{framework.topDown}</p>}
          {Array.isArray(framework.scenarios) && framework.scenarios.length > 0 && (
            <div>
              <p className="text-sm font-medium">If / then</p>
              <ul className="mt-2 divide-y divide-line">
                {framework.scenarios.map((s, i) => (
                  <li
                    key={i}
                    className="grid grid-cols-[2.25rem_1fr] items-baseline gap-x-3 gap-y-1 py-3 text-sm leading-relaxed first:pt-1 last:pb-0"
                  >
                    <span className="font-mono text-[11px] uppercase tracking-wide text-ink-muted">If</span>
                    <span className="text-ink">{s.if}</span>
                    <span className="font-mono text-[11px] uppercase tracking-wide text-brand">Then</span>
                    <span className="text-ink-muted">{s.then}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {Array.isArray(framework.mentalModel) && framework.mentalModel.length > 0 && (
            <div>
              <p className="text-sm font-medium">Trader mental model</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-muted">
                {framework.mentalModel.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </div>
          )}
          {Array.isArray(framework.picks) && framework.picks.length > 0 && (
            <div>
              <p className="text-sm font-medium">On the picks</p>
              <ul className="mt-2 space-y-2">
                {framework.picks.map((p, i) => (
                  <li key={i} className="text-sm leading-relaxed">
                    <span className="font-mono font-semibold">{p.ticker}</span>{' '}
                    <span className="text-ink-muted">— {p.note}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          </div>
        </div>
      )}
    </section>
  );

  return (
    <div className="flex flex-col">
      {/* Top bar — title left, compact Filters control on the right */}

      {/* ===== Stepper and main content ===== */}
      {(!loading && !error) && (
        <div className="py-6">
          <Stepper steps={STEP_LABELS} current={stepperCurrent} />

          {/* Stage 1: Select Date */}
          {stage === 'date' && (
            <section className="stage-enter mx-auto mt-16 max-w-xl text-center">
              <h3 className="font-serif text-4xl font-medium tracking-tight sm:text-5xl">
                Find today's candidates
              </h3>
              <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-ink-muted">
                Scanning the IDX universe for the <span className="font-medium text-ink">{activeCategory.label}</span> strategy,
                then handing you the top {numStocks} to refine with broker summaries.
              </p>
              {/* Configure, then run: strategy is the one decision most users
                  change, so it stays inline; the rest tucks behind "More
                  filters". The CTA sits below as the visual terminus. */}
              <div className="mx-auto mt-8 max-w-sm space-y-3 text-left">
                <div className="space-y-1.5">
                  <FieldLabel htmlFor="category-filter">Strategy</FieldLabel>
                  <select
                    id="category-filter"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                        {c.id === DEFAULT_CATEGORY ? ' (default)' : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs leading-relaxed text-ink-muted">
                    {activeCategory.blurb}
                    {activeCategory.fundamentals ? ' Deeper fundamental scan — takes a little longer.' : ''}
                  </p>
                </div>

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setFiltersOpen((v) => !v)}
                    aria-expanded={filtersOpen}
                    className="inline-flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:border-ink-muted/50 hover:text-ink hover:scale-[1.02] active:scale-[0.95]"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 5h18M6 12h12M10 19h4" />
                    </svg>
                    More filters
                    {moreFiltersCount > 0 && (
                      <span className="rounded-full bg-brand-tint px-1.5 text-xs font-semibold text-brand">
                        {moreFiltersCount}
                      </span>
                    )}
                  </button>

                  {filtersOpen && (
                    <>
                      {/* click-away */}
                      <div className="fixed inset-0 z-dropdown" onClick={() => setFiltersOpen(false)} aria-hidden="true" />
                      <div className="dropdown-enter absolute left-0 z-sticky mt-2 max-h-[80vh] w-[22rem] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-line bg-paper p-5 text-left shadow-xl shadow-ink/10">
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                              <FieldLabel>Stocks to surface</FieldLabel>
                              <div className="inline-flex rounded-lg border border-line p-1">
                                {COUNT_OPTIONS.map((n) => (
                                  <button
                                    key={n}
                                    type="button"
                                    onClick={() => setNumStocks(n)}
                                    className={`rounded-md px-2.5 py-1 text-sm font-medium tabular-nums transition-colors ${
                                      numStocks === n ? 'bg-brand text-white' : 'text-ink-muted hover:text-ink'
                                    } hover:scale-[1.02] active:scale-[0.95]`}
                                  >
                                    {n}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div className="space-y-1.5">
                              <FieldLabel>Analysis mode</FieldLabel>
                              <div className="inline-flex rounded-lg border border-line p-1">
                                {[
                                  { value: 'closing', label: 'EOD close' },
                                  { value: 'midday', label: 'Midday' },
                                ].map((m) => (
                                  <button
                                    key={m.value}
                                    type="button"
                                    onClick={() => setAnalysisMode(m.value)}
                                    className={`rounded-md px-2.5 py-1 text-sm font-medium transition-colors ${
                                      analysisMode === m.value ? 'bg-brand text-white' : 'text-ink-muted hover:text-ink'
                                    } hover:scale-[1.02] active:scale-[0.95]`}
                                  >
                                    {m.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <FieldLabel>Market cap</FieldLabel>
                            <div className="flex flex-wrap gap-1 rounded-lg border border-line p-1">
                              {CAP_TIERS.map((t) => (
                                <button
                                  key={t.id}
                                  type="button"
                                  onClick={() => setCapTier(t.id)}
                                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                                    capTier === t.id ? 'bg-brand text-white' : 'text-ink-muted hover:text-ink'
                                  } hover:scale-[1.02] active:scale-[0.95]`}
                                >
                                  {t.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                              <FieldLabel htmlFor="sector-filter">Sector</FieldLabel>
                              <select
                                id="sector-filter"
                                value={sector}
                                onChange={(e) => setSector(e.target.value)}
                                className="w-full rounded-md border border-line bg-paper px-2.5 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
                              >
                                <option value="">All sectors</option>
                                {SECTORS.map((s) => (
                                  <option key={s} value={s}>
                                    {s}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="space-y-1.5">
                              <FieldLabel htmlFor="board-risk-filter">Listing board</FieldLabel>
                              <select
                                id="board-risk-filter"
                                value={boardRiskFilter}
                                onChange={(e) => setBoardRiskFilter(e.target.value)}
                                title="Optional — restricts the scan to a single IDX listing board."
                                className="w-full rounded-md border border-line bg-paper px-2.5 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
                              >
                                <option value="">Any board</option>
                                <option value="high">Special Monitoring</option>
                                <option value="elevated">Acceleration</option>
                                <option value="moderate">Development / New Economy</option>
                                <option value="normal">Main board</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setDateModalOpen(true)}
                className="mt-8 inline-flex items-center gap-2.5 rounded-xl bg-brand px-8 py-4 text-base font-medium text-white shadow-lg shadow-brand/20 transition-[transform,opacity] duration-200 hover:bg-brand-deep hover:shadow-xl hover:shadow-brand/25 hover:scale-[1.02] active:scale-[0.95]"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 3l14 9-14 9V3z" />
                </svg>
                Run Screening
              </button>

                {savedScreenings.length > 0 && (
                  <div className="mx-auto mt-14 max-w-md rounded-xl border border-line p-5 text-left">
                    <p className="text-sm font-medium">Saved screenings</p>
                    <ul className="mt-3 space-y-2">
                      {savedScreenings.slice(0, 5).map((s) => (
                        <li key={s.name} className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="font-medium">{s.name}</span>
                          <span className="font-mono text-xs text-ink-muted">
                            {s.date} · {s.results.length} stocks
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
          )}

          {/* Stage 2: Run Screening */}
          {stage === 'screening' && (
            <>
              {awaitingBrokerUpload && (
                <article className="report-enter pt-8">
                  <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b border-line pb-6">
                    <div>
                      <p className="font-mono text-xs text-ink-muted">
                        Closing screen{asOfDate ? ` · as of ${asOfDate}` : ''} · {initialScreenings.length} candidate
                        {initialScreenings.length === 1 ? '' : 's'}
                      </p>
                      <h2 className="mt-1 font-serif text-4xl font-medium tracking-tight">Candidates ready</h2>
                      <p className="mt-2 max-w-prose text-sm text-ink-muted">
                        Optionally attach broker-summary screenshots, then re-rank to apply pack-hunting
                        detection — or skip straight to the final ranking.
                      </p>
                    </div>
                    <QuietButton onClick={requestNewScreening}>New screening</QuietButton>
                  </header>

                  <ul className="mt-6 divide-y divide-line">
                    {initialScreenings.map((s, i) => {
                      const owner = category === 'conglomerate' ? conglomerateOwner(s.ticker) : null;
                      return (
                      <li key={s.ticker} className="flex items-baseline gap-3 py-2.5">
                        <span className="w-5 shrink-0 font-mono text-sm tabular-nums text-ink-muted">{i + 1}</span>
                        <span className="font-mono text-sm font-semibold text-ink">{s.ticker}</span>
                        <span className="flex-1 min-w-0 text-xs text-ink-muted">
                          <span className="block truncate">
                            {s.name}
                            {s.capTier ? ` · ${s.capTier}` : ''}
                          </span>
                          {owner && (
                            <span className="mt-1 block" title={`Controlling owner — ${owner}`}>
                              <Pill tone="muted">{owner}</Pill>
                            </span>
                          )}
                        </span>
                        {s.composite != null && (
                          <span
                            className="font-mono text-sm tabular-nums text-ink-muted"
                            title="Initial ranking score"
                          >
                            {s.composite.toFixed(1)}
                          </span>
                        )}
                        {s.overallRating && <RatingFigure rating={s.overallRating} className="text-sm" />}
                        <span className="w-20 text-right font-mono text-sm tabular-nums">{formatRp(s.close)}</span>
                      </li>
                      );
                    })}
                  </ul>

                  <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-5">
                    <PrimaryButton onClick={handleRefineAction}>
                      {brokerScreenshots.length > 0 ? 'Re-rank candidates' : 'Get final ranking'}
                    </PrimaryButton>
                    <QuietButton onClick={() => setUploadOpen(true)}>
                      {brokerScreenshots.length > 0
                        ? `${brokerScreenshots.length} screenshot${brokerScreenshots.length > 1 ? 's' : ''} attached · add more`
                        : 'Attach broker screenshots'}
                    </QuietButton>
                  </div>

                  <WhyNotRecommended
                    date={asOfDate}
                    filters={{ category, capTier, sector, boardLevel: boardRiskFilter }}
                    results={initialScreenings}
                  />

                  {frameworkSection}
                </article>
              )}

              {/* Midday mode results or loading state */}
              {!awaitingBrokerUpload && hasResults && !loading && (
                <article className="report-enter pt-8">
                  <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b border-line pb-6">
                    <div>
                      <p className="font-mono text-xs text-ink-muted">
                        Ranked {asOfDate ? `· as of ${asOfDate}` : ''} · {analysisMode === 'midday' ? 'midday' : 'EOD close'}{aiUsed && ' · AI-enhanced'}
                      </p>
                      <h2 className="mt-1 font-serif text-4xl font-medium tracking-tight">
                        Top {screenings.length} candidate{screenings.length === 1 ? '' : 's'}
                      </h2>
                      <p className="mt-2 text-sm text-ink-muted">
                        {reranked
                          ? 'Re-ranked with broker summaries — weighted toward near-term flow.'
                          : `${activeCategory.label} — ${activeCategory.blurb}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {reranked && <Pill tone="brand">Refined</Pill>}
                      {aiUsed && <Pill tone="pos">AI-enhanced</Pill>}
                      <QuietButton onClick={requestNewScreening}>New screening</QuietButton>
                    </div>
                  </header>

                  {/* Ranked table */}
                  <div className="mt-6 overflow-x-auto">
                    <table className="w-full table-fixed">
                      <colgroup>
                        <col className="w-10" />
                        <col />
                        <col className="w-28" />
                        <col className="w-20" />
                        <col className="w-16" />
                        <col className="w-16" />
                      </colgroup>
                      <thead>
                        <tr className="border-y border-line text-xs font-medium text-ink-muted">
                          <th className="py-2.5 pl-1 pr-2 text-left">#</th>
                          <th className="py-2.5 px-2 text-left">Stock</th>
                          <th className="py-2.5 px-2 text-right">Price</th>
                          <th className="py-2.5 px-2 text-right">1M</th>
                          <th className="py-2.5 px-2 text-right">Score</th>
                          <th className="py-2.5 pl-2 pr-1 text-right">Rating</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {screenings.map((result, index) => (
                          <tr
                            key={result.ticker}
                            className={`align-top transition-colors duration-150 hover:bg-well/60 result-row-enter result-row-enter-delay-${Math.min(index, 9)}`}
                          >
                            <td className="py-3.5 pl-1 pr-2 font-mono text-sm tabular-nums text-ink-muted">
                              {result.rank}
                            </td>
                            <td className="py-3.5 px-2">
                              <div className="flex items-baseline gap-2">
                                <span className="font-mono text-sm font-semibold text-ink">{result.ticker}</span>
                                {result.board === 'Pemantauan Khusus' && (
                                  <span className="shrink-0 text-[10px] uppercase tracking-wide text-warn">
                                    monitored
                                  </span>
                                )}
                              </div>
                              <p className="mt-0.5 truncate text-xs text-ink-muted" title={result.name}>
                                {result.name}
                                {result.capTier && <span> · {result.capTier}</span>}
                              </p>
                            </td>
                            <td className="py-3.5 px-2 text-right font-mono text-sm tabular-nums">
                              {formatRp(result.close)}
                            </td>
                            <td className="py-3.5 px-2 text-right font-mono text-sm tabular-nums">
                              {result.oneMonth != null ? (
                                <span
                                  className={
                                    result.oneMonth > 0
                                      ? 'text-pos'
                                      : result.oneMonth < 0
                                        ? 'text-neg'
                                        : undefined
                                  }
                                >
                                  {formatPct(result.oneMonth)}
                                </span>
                              ) : (
                                <span className="text-ink-muted">—</span>
                              )}
                            </td>
                            <td className="py-3.5 px-2 text-right font-mono text-sm tabular-nums">
                              {result.activeComposite.toFixed(1)}
                            </td>
                            <td className="py-3.5 pl-2 pr-1 text-right">
                              <RatingFigure rating={ratingFor(result)} className="text-base" />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Refine step — attach broker summaries to re-rank */}
                  <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line p-5">
                    <div className="max-w-prose">
                      <p className="text-sm font-medium">
                        {reranked ? 'Broker summaries applied' : 'Refine with broker summaries'}
                      </p>
                      <p className="mt-1 text-sm text-ink-muted">
                        {brokerScreenshots.length > 0
                          ? `${brokerScreenshots.length} screenshot${brokerScreenshots.length > 1 ? 's' : ''} attached. Re-ranking weights the near-term flow these confirm.`
                          : 'Attach broker-summary screenshots for any of the names above, then re-rank toward near-term flow.'}
                      </p>
                    </div>
                    <PrimaryButton onClick={handleRefineAction}>
                      {brokerScreenshots.length > 0 ? 'Review & re-rank' : 'Attach broker screenshots'}
                    </PrimaryButton>
                  </div>

                  {/* Save */}
                  <div className="mt-6 flex flex-wrap items-end justify-between gap-4 border-t border-line pt-6">
                    <div className="min-w-64 flex-1">
                      <FieldLabel htmlFor="screening-name">Save this list as</FieldLabel>
                      <input
                        id="screening-name"
                        type="text"
                        value={screeningName}
                        onChange={(e) => setScreeningName(e.target.value)}
                        placeholder="e.g. 'Momentum leaders'"
                        className="w-full rounded-md border border-line bg-paper px-3.5 py-2.5 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
                      />
                    </div>
                    <PrimaryButton onClick={handleSaveScreening}>Save list</PrimaryButton>
                    {saveSuccess && (
                      <span className="ml-3 h-4 w-4">
                        <svg className="h-4 w-4 success-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </span>
                    )}
                  </div>
                  {savedAs && (
                    <p className="mt-3 text-sm text-pos">
                      Saved as "{savedAs}" — it will appear under saved screenings on the start screen.
                    </p>
                  )}

                  <WhyNotRecommended
                    date={asOfDate}
                    filters={{ category, capTier, sector, boardLevel: boardRiskFilter }}
                    results={screenings}
                  />

                  {frameworkSection}
                </article>
              )}

              {/* Loading state */}
              {!awaitingBrokerUpload && loading && (
                <div className="py-10">
                  <p className="text-center font-mono text-xs text-ink-muted">
                    Ranking candidates on live market data{asOfDate ? ` · as of ${asOfDate}` : ''}…
                  </p>
                  <ReportSkeleton />
                </div>
              )}

              {/* Error state */}
              {!awaitingBrokerUpload && !loading && error && (
                <div className="py-10 text-center">
                  <div role="alert" className="mx-auto max-w-md rounded-md border border-neg/30 bg-neg-tint px-4 py-3">
                    <p className="text-sm text-neg">{error}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDateModalOpen(true)}
                    className="mt-6 rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-deep active:scale-[0.95]"
                  >
                    Try again
                  </button>
                </div>
              )}
            </>
          )}

          {/* Stage 3: Refine with Brokers (broker upload modal content would go here, but it's handled by the Modal component) */}
          {stage === 'refine' && (
            // This stage is primarily handled by the awaitingBrokerUpload state in stage === 'screening' above
            // and the broker upload Modal below
            <div></div> // Placeholder - the actual refine UI is in the awaitingBrokerUpload conditional above
          )}
        </div>
      )}

      {/* ===== Loading ===== */}
      {loading && (
        <div className="py-10">
          <p className="text-center font-mono text-xs text-ink-muted">
            Ranking candidates on live market data{asOfDate ? ` · as of ${asOfDate}` : ''}…
          </p>
          <ReportSkeleton />
        </div>
      )}

      {/* ===== Error ===== */}
      {!loading && error && (
        <div className="py-10 text-center">
          <div role="alert" className="mx-auto max-w-md rounded-md border border-neg/30 bg-neg-tint px-4 py-3">
            <p className="text-sm text-neg">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => setDateModalOpen(true)}
            className="mt-6 rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-deep active:scale-[0.95]"
          >
            Try again
          </button>
        </div>
      )}

      {/* ===== Results ===== */}
      {awaitingBrokerUpload ? (
        <article className="report-enter pt-8">
          <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b border-line pb-6">
            <div>
              <p className="font-mono text-xs text-ink-muted">
                Closing screen{asOfDate ? ` · as of ${asOfDate}` : ''} · {initialScreenings.length} candidate
                {initialScreenings.length === 1 ? '' : 's'}{aiUsed && ' · AI-enhanced'}
              </p>
              <h2 className="mt-1 font-serif text-4xl font-medium tracking-tight">Candidates ready</h2>
              <p className="mt-2 max-w-prose text-sm text-ink-muted">
                Optionally attach broker-summary screenshots, then re-rank to apply pack-hunting
                detection — or skip straight to the final ranking.
              </p>
            </div>
            <QuietButton onClick={requestNewScreening}>New screening</QuietButton>
          </header>

          <ul className="mt-6 divide-y divide-line">
            {initialScreenings.map((s, i) => {
              const owner = category === 'conglomerate' ? conglomerateOwner(s.ticker) : null;
              return (
              <li key={s.ticker} className="flex items-baseline gap-3 py-2.5">
                <span className="w-5 shrink-0 font-mono text-sm tabular-nums text-ink-muted">{i + 1}</span>
                <span className="font-mono text-sm font-semibold text-ink">{s.ticker}</span>
                <span className="flex-1 min-w-0 text-xs text-ink-muted">
                  <span className="block truncate">
                    {s.name}
                    {s.capTier ? ` · ${s.capTier}` : ''}
                  </span>
                  {owner && (
                    <span className="mt-1 block" title={`Controlling owner — ${owner}`}>
                      <Pill tone="muted">{owner}</Pill>
                    </span>
                  )}
                </span>
                {s.composite != null && (
                  <span
                    className="font-mono text-sm tabular-nums text-ink-muted"
                    title="Initial ranking score"
                  >
                    {s.composite.toFixed(1)}
                  </span>
                )}
                {s.overallRating && <RatingFigure rating={s.overallRating} className="text-sm" />}
                <span className="w-20 text-right font-mono text-sm tabular-nums">{formatRp(s.close)}</span>
              </li>
              );
            })}
          </ul>

          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-5">
            <PrimaryButton onClick={handleRefineAction}>
              {brokerScreenshots.length > 0 ? 'Re-rank candidates' : 'Get final ranking'}
            </PrimaryButton>
            <QuietButton onClick={() => setUploadOpen(true)}>
              {brokerScreenshots.length > 0
                ? `${brokerScreenshots.length} screenshot${brokerScreenshots.length > 1 ? 's' : ''} attached · add more`
                : 'Attach broker screenshots'}
            </QuietButton>
          </div>

          <WhyNotRecommended
            date={asOfDate}
            filters={{ category, capTier, sector, boardLevel: boardRiskFilter }}
            results={initialScreenings}
          />

          {frameworkSection}

        </article>
      ) : (
        hasResults && !loading && (
          <article className="report-enter pt-8">
            <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b border-line pb-6">
              <div>
                <p className="font-mono text-xs text-ink-muted">
                  Ranked {asOfDate ? `· as of ${asOfDate}` : ''} · {analysisMode === 'midday' ? 'midday' : 'EOD close'}{aiUsed && ' · AI-enhanced'}
                </p>
                <h2 className="mt-1 font-serif text-4xl font-medium tracking-tight">
                  Top {screenings.length} candidate{screenings.length === 1 ? '' : 's'}
                </h2>
                <p className="mt-2 text-sm text-ink-muted">
                  {reranked
                    ? 'Re-ranked with broker summaries — weighted toward near-term flow.'
                    : 'Ranked by composite score (short 35% · mid 35% · long 30%).'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {reranked && <Pill tone="brand">Refined</Pill>}
                {aiUsed && <Pill tone="pos">AI-enhanced</Pill>}
                <QuietButton onClick={requestNewScreening}>New screening</QuietButton>
              </div>
            </header>

            {/* Ranked table */}
            <div className="mt-6 overflow-x-auto">
              <table className="w-full table-fixed">
                <colgroup>
                  <col className="w-10" />
                  <col />
                  <col className="w-28" />
                  <col className="w-20" />
                  <col className="w-16" />
                  <col className="w-16" />
                </colgroup>
                <thead>
                  <tr className="border-y border-line text-xs font-medium text-ink-muted">
                    <th className="py-2.5 pl-1 pr-2 text-left">#</th>
                    <th className="py-2.5 px-2 text-left">Stock</th>
                    <th className="py-2.5 px-2 text-right">Price</th>
                    <th className="py-2.5 px-2 text-right">1M</th>
                    <th className="py-2.5 px-2 text-right">Score</th>
                    <th className="py-2.5 pl-2 pr-1 text-right">Rating</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {screenings.map((result, index) => (
                    <tr
                      key={result.ticker}
                      className={`align-top transition-colors duration-150 hover:bg-well/60 result-row-enter result-row-enter-delay-${Math.min(index, 9)}`}
                    >
                      <td className="py-3.5 pl-1 pr-2 font-mono text-sm tabular-nums text-ink-muted">
                        {result.rank}
                      </td>
                      <td className="py-3.5 px-2">
                        <div className="flex items-baseline gap-2">
                          <span className="font-mono text-sm font-semibold text-ink">{result.ticker}</span>
                          {result.board === 'Pemantauan Khusus' && (
                            <span className="shrink-0 text-[10px] uppercase tracking-wide text-warn">
                              monitored
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-xs text-ink-muted" title={result.name}>
                          {result.name}
                          {result.capTier && <span> · {result.capTier}</span>}
                        </p>
                      </td>
                      <td className="py-3.5 px-2 text-right font-mono text-sm tabular-nums">
                        {formatRp(result.close)}
                      </td>
                      <td className="py-3.5 px-2 text-right font-mono text-sm tabular-nums">
                        {result.oneMonth != null ? (
                          <span
                            className={
                              result.oneMonth > 0
                                ? 'text-pos'
                                : result.oneMonth < 0
                                  ? 'text-neg'
                                  : undefined
                            }
                          >
                            {formatPct(result.oneMonth)}
                          </span>
                        ) : (
                          <span className="text-ink-muted">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-2 text-right font-mono text-sm tabular-nums">
                        {result.activeComposite.toFixed(1)}
                      </td>
                      <td className="py-3.5 pl-2 pr-1 text-right">
                        <RatingFigure rating={ratingFor(result)} className="text-base" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Refine step — attach broker summaries to re-rank */}
            <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line p-5">
              <div className="max-w-prose">
                <p className="text-sm font-medium">
                  {reranked ? 'Broker summaries applied' : 'Refine with broker summaries'}
                </p>
                <p className="mt-1 text-sm text-ink-muted">
                  {brokerScreenshots.length > 0
                    ? `${brokerScreenshots.length} screenshot${brokerScreenshots.length > 1 ? 's' : ''} attached. Re-ranking weights the near-term flow these confirm.`
                    : 'Attach broker-summary screenshots for any of the names above, then re-rank toward near-term flow.'}
                </p>
              </div>
              <PrimaryButton onClick={handleRefineAction}>
                {brokerScreenshots.length > 0 ? 'Review & re-rank' : 'Attach broker screenshots'}
              </PrimaryButton>
            </div>

            {/* Save */}
            <div className="mt-6 flex flex-wrap items-end justify-between gap-4 border-t border-line pt-6">
              <div className="min-w-64 flex-1">
                <FieldLabel htmlFor="screening-name">Save this list as</FieldLabel>
                <input
                  id="screening-name"
                  type="text"
                  value={screeningName}
                  onChange={(e) => setScreeningName(e.target.value)}
                  placeholder="e.g. 'Momentum leaders'"
                  className="w-full rounded-md border border-line bg-paper px-3.5 py-2.5 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
                />
              </div>
              <PrimaryButton onClick={handleSaveScreening}>Save list</PrimaryButton>
              {saveSuccess && (
                <span className="ml-3 h-4 w-4">
                  <svg className="h-4 w-4 success-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </span>
              )}
            </div>
            {savedAs && (
              <p className="mt-3 text-sm text-pos">
                Saved as "{savedAs}" — it will appear under saved screenings on the start screen.
              </p>
            )}

            <WhyNotRecommended
              date={asOfDate}
              filters={{ category, capTier, sector, boardLevel: boardRiskFilter }}
              results={screenings}
            />

            {frameworkSection}
          </article>
        )
      )}

      {/* ===== Date picker popup ===== */}
      <Modal
        open={dateModalOpen}
        onClose={() => {
          setDateModalOpen(false);
          setStage('date');
        }}
        title="As of which date?"
        description="The desk reads price action up to and including this session."
      >
        <div className="rounded-xl border border-line p-4">
          <DatePicker inline value={asOfDate} max={TODAY} onChange={handleDatePicked} />
        </div>
        <p className="mt-4 text-center text-xs text-ink-muted">
          Surfacing the top {numStocks} — adjust in Filters before running.
        </p>
      </Modal>

      {/* ===== Confirm new screening ===== */}
      <Modal
        open={newScreeningConfirmOpen}
        onClose={() => setNewScreeningConfirmOpen(false)}
        title="Start a new screening?"
        description="This will clear the current candidates, uploaded screenshots, and unsaved list name."
      >
        <div className="flex flex-wrap items-center justify-end gap-3">
          <QuietButton onClick={() => setNewScreeningConfirmOpen(false)}>Cancel</QuietButton>
          <PrimaryButton onClick={startNewScreening}>Start new screening</PrimaryButton>
        </div>
      </Modal>

      {/* ===== Broker screenshot upload + re-rank ===== */}
      <Modal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        title="Broker summary screenshots"
        description="Attach summaries for the candidates above, then re-rank toward near-term flow."
      >
        <BrokerScreenshotField
          id="screening-upload"
          files={brokerScreenshots}
          onAdd={addBrokerScreenshots}
          onRemove={removeScreenshot}
        />

        <div className="mt-6 flex items-center justify-between gap-4">
          <span className="text-sm text-ink-muted">
            {brokerScreenshots.length > 0
              ? `${brokerScreenshots.length} attached`
              : 'Optional — re-rank works without them.'}
          </span>
          <div className="flex items-center gap-3">
            {rerankSuccess && (
              <span className="h-4 w-4 text-pos">
                <svg className="h-4 w-4 success-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </span>
            )}
            <PrimaryButton onClick={rerankWithBrokers}>Re-rank candidates</PrimaryButton>
          </div>
        </div>
      </Modal>
    </div>
  );
}

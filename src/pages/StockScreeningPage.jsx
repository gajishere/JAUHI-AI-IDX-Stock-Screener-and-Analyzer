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
import { Segmented } from '../components/Segmented';
import { DatePicker } from '../components/DatePicker';
import { Modal } from '../components/Modal';
import { LiquidGlass } from '../components/LiquidGlass';
import { BrokerActionGauge, BrokerActionColumns } from '../components/BrokerAction';
import { ratingFromScore, toScoreTen, formatPct, formatRp } from '../lib/analysis';
import { screeningStage1, screeningStage2, diagnoseStock, fetchCandidateBandarmology } from '../lib/screeningService';
import { CATEGORIES, DEFAULT_CATEGORY, CAP_TIERS, getCategory } from '../lib/screeningCategories';
import { SECTORS, searchEmiten, findEmiten } from '../lib/universe';
import { conglomerateGroup } from '../data/conglomerates';
import { fetchMacro, summarizeMacro } from '../lib/macro';
import { claudeAIService } from '../lib/claudeAI';
import { useLang, useT } from '../lib/i18n';
import { useSound } from '../lib/sound';
import { useSpringPresence } from '../lib/useSpringPresence';
import { presets } from '../lib/motion';

const SAVED_KEY = 'idx-screenings';
const TODAY = new Date().toISOString().slice(0, 10);
const COUNT_OPTIONS = [3, 5, 10, 15];

// Constants needed for framework display (removed from old screening logic)
const EQUITY_INDEX = new Set(['ihsg', 'sp500', 'nasdaq', 'nikkei', 'hangseng']);
const fmtSignedPct = (v) => (v == null ? '—' : `${v > 0 ? '+' : ''}${(v * 100).toFixed(2)}%`);

// Bandarmology accumulation/distribution → pill tone. Accumulation reads
// positive (green), distribution negative (red), anything else cautionary.
// The IDX API returns several label forms — short ("Acc"/"Dist") and full
// ("Akumulasi"/"Distribusi", "Accumulation"/"Distribution") — so match the
// shortest distinguishing stem of each: "acc" / "akum" cover every accumulation
// spelling (note "akumulasi" has no double-c), "dist" covers every distribution
// spelling. "neutral"/"netral" falls through to warn, which is the intent.
const accTone = (label) => {
  const v = (label || '').toLowerCase();
  if (v.includes('akum') || v.includes('acc')) return 'pos';
  if (v.includes('dist')) return 'neg';
  return 'warn';
};

// Concise controlling owner for a conglomerate-group ticker (parenthetical
// detail stripped), or null. Shown on the candidate list for the Conglomerate
// screen only.
function conglomerateOwner(ticker) {
  const grp = conglomerateGroup(ticker);
  if (!grp) return null;
  return grp.controller.replace(/\s*\(.*\)\s*$/, '');
}

// Inline broker-summary panel rendered when a candidate's Acc/Dist pill is
// expanded. Reads the bandarmology already attached to the candidate (no fetch).
// Speaks the report vocabulary: a verdict header (serif phrase + tonal pill +
// net value in tabular figures), the restyled gauge, paired buy/sell columns,
// and the two session stats as dotted-leader Rows. The className prop lets the
// table-based expansion span its column via colSpan.
function BandarSummary({ bandar, className = '' }) {
  const t = useT();
  if (!bandar) return null;

  const verdict = bandar.accdist || bandar.top5Accdist;
  // Reuse the shared accTone so accumulation/distribution tint consistently
  // across the row pill and this summary (Indonesian labels included).
  const tone = accTone(verdict);
  const netValue = bandar.top5NetValue;

  return (
    <div className={`list-item-enter px-1 ${className}`}>
      {/* Verdict header — the label appears once here as the serif headline.
          The row's pill already carries it collapsed and the Top-5 stance Row
          repeats the secondary read below, so we don't echo a second pill. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className={`font-serif text-lg font-medium ${tone === 'pos' ? 'text-pos' : tone === 'neg' ? 'text-neg' : 'text-ink'}`}>
          {verdict || t('Broker action', 'Aksi broker')}
        </span>
        <span className="font-mono text-xs tabular-nums text-ink-muted">
          {netValue != null
            ? `${netValue >= 0 ? '+' : ''}${formatRp(netValue)}`
            : '—'}
          <span className="ml-1.5 text-ink-muted/80">{t('top-5 net', 'net 5 teratas')}</span>
        </span>
      </div>

      <div className="mt-4 border-t border-line pt-4">
        <BrokerActionGauge bandar={bandar} t={t} />
      </div>

      <div className="mt-4">
        <BrokerActionColumns bandar={bandar} t={t} maxRows={5} />
      </div>

      {/* Session stats as dotted-leader Rows — the report's typographic spine. */}
      <div className="mt-4 border-t border-line pt-2">
        <Row
          label={t('Top-5 stance', 'Sifat 5 teratas')}
          value={bandar.top5Accdist || '—'}
        />
        <Row
          label={t('Buyers / sellers', 'Pembeli / penjual')}
          value={`${bandar.totalBuyers ?? 0} / ${bandar.totalSellers ?? 0}`}
        />
      </div>
    </div>
  );
}


// Compact "why isn't this on the list?" search — a smaller sibling of the
// Stock Analysis search. Runs the active screen's gates against one ticker
// (via diagnoseStock) and shows a per-criterion pass/fail breakdown.
function WhyNotRecommended({ date, filters, results }) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [diag, setDiag] = useState(null);
  const [err, setErr] = useState(null);

  const categoryLabel = getCategory(filters.category).label;

  // Interruptible presence for the suggestion dropdown (same treatment as the
  // main ticker search). Animates on empty↔non-empty, not per keystroke.
  const { mounted: suggestionsMounted, nodeRef: suggestionsRef } = useSpringPresence(
    suggestions.length > 0,
    presets.popoverEnter,
    presets.popoverExit,
  );

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
      setErr(e.message || t('Could not diagnose that stock.', 'Tidak dapat mendiagnosis saham tersebut.'));
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
      <h3 className="font-serif text-xl font-medium">{t('Why isn’t this stock recommended?', 'Mengapa saham ini tidak direkomendasikan?')}</h3>
      <p className="mt-1.5 max-w-prose text-sm text-ink-muted">
        {t(
          `Search any IDX ticker to see exactly which ${categoryLabel} criteria it passes or fails for this screen.`,
          `Cari kode saham IDX mana pun untuk melihat kriteria ${categoryLabel} mana yang lolos atau gagal pada penyaringan ini.`,
        )}
      </p>

      <div className="relative mt-4 max-w-md text-left">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted">
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
          placeholder={t('Check a ticker — e.g. “ASII”', 'Periksa kode saham — mis. “ASII”')}
          role="combobox"
          aria-expanded={suggestions.length > 0}
          aria-controls="screening-ticker-suggestions"
          aria-activedescendant={active >= 0 ? `screening-ticker-option-${active}` : undefined}
          aria-autocomplete="list"
          className="tactile-soft w-full rounded-full border border-line bg-paper py-2.5 pl-11 pr-5 font-mono text-sm text-ink shadow-sm shadow-ink/5 placeholder:font-sans placeholder:text-ink-muted hover:border-ink-muted/50 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
        />
        {suggestionsMounted && suggestions.length > 0 && (
          <ul
            ref={suggestionsRef}
            id="screening-ticker-suggestions"
            role="listbox"
            style={{ transformOrigin: 'top center' }}
            className="surface-glass glass-morph absolute left-0 right-0 z-dropdown mt-2 max-h-60 overflow-y-auto rounded-xl border border-line py-1.5"
          >
            {suggestions.map((s, index) => (
              <li
                key={s.code}
                id={`screening-ticker-option-${index}`}
                role="option"
                aria-selected={index === active}
              >
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => run(s.code)}
                  onMouseEnter={() => setActive(index)}
                  className={`tactile-soft flex w-full items-baseline gap-3 px-3.5 py-2 text-left ${
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
          <span className="font-mono text-xs text-ink-muted">{t(`Checking ${query} against the screen…`, `Memeriksa ${query} terhadap penyaringan…`)}</span>
        </div>
      )}
      {err && !loading && <p className="mt-4 text-sm text-neg">{err}</p>}

      {diag && !loading && (
        <div className="glass-surface mt-5 max-w-md rounded-xl p-4">
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-mono text-sm font-semibold text-ink">{diag.ticker}</p>
            <Pill tone={tone}>
              {diag.recommended
                ? t('On the list', 'Masuk daftar')
                : diag.qualifies
                  ? t('Qualifies, not surfaced', 'Memenuhi syarat, tidak ditampilkan')
                  : t('Excluded', 'Dikecualikan')}
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
  const t = useT();
  const { lang } = useLang();
  const { playDing } = useSound();
  // Stepper labels for screening flow
  const STEP_LABELS = [
    t('Select date', 'Pilih tanggal'),
    t('Run screening', 'Jalankan penyaringan'),
    t('Refine with brokers', 'Sempurnakan dengan broker'),
  ];

  // Flow: idle → (date modal) → loading → results → (upload modal) → re-ranked results
  const [dateModalOpen, setDateModalOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [newScreeningConfirmOpen, setNewScreeningConfirmOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Interruptible popover presence: the Filters panel scales+fades from its
  // trigger (the Filters button), matching the settings popover and date
  // popup. Reopening mid-close cancels the close cleanly. The click-away
  // scrim below stays; only the enter/exit is now spring-driven.
  const { mounted: filtersMounted, nodeRef: filtersPanelRef } = useSpringPresence(
    filtersOpen,
    presets.popoverEnter,
    presets.popoverExit,
  );

  // Stepper state
  const [stage, setStage] = useState('date'); // 'date' → 'screening' → 'refine'

  // Filters
  const [numStocks, setNumStocks] = useState(5);
  const [analysisMode, setAnalysisMode] = useState('closing');
  const [category, setCategory] = useState(DEFAULT_CATEGORY);
  const [capTier, setCapTier] = useState([]);
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
  // Inline broker-summary expansion: which candidate row is expanded. Toggling
  // the same ticker collapses it. Bandarmology is loaded lazily on first expand
  // (kept off the screen's critical path), then cached on the candidate row.
  const [expandedBandarTicker, setExpandedBandarTicker] = useState(null);
  // Ticker whose broker tape is currently being fetched (null = idle).
  const [bandarLoading, setBandarLoading] = useState(null);

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
  // Strategy lives inside the Filters panel, so the badge counts every
  // non-default setting, including the chosen strategy.
  const activeFilterCount =
    (category !== DEFAULT_CATEGORY ? 1 : 0) +
    (analysisMode !== 'closing' ? 1 : 0) +
    (capTier.length > 0 ? 1 : 0) +
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
            language: lang,
          });
          setFramework(fw);
        } catch (e) {
          setFrameworkError(e.message || t('AI narrative unavailable.', 'Narasi AI tidak tersedia.'));
        }
      }
    } catch (e) {
      setFrameworkError(e.message || t('Macro data unavailable.', 'Data makro tidak tersedia.'));
    } finally {
      setFrameworkLoading(false);
    }
  };

  const runScreening = async (date) => {
    if (loading) return;
    // Mid-day mode needs the Session-1 foreign-activity screenshot first.
    if (analysisMode === 'midday' && brokerScreenshots.length === 0) {
      setError(
        t(
          'Mid‑day screening needs a Session‑1 foreign-activity screenshot — add it via “Attach broker screenshots” first.',
          'Penyaringan mid‑day memerlukan tangkapan layar aktivitas asing Sesi‑1 — tambahkan dulu lewat “Lampirkan tangkapan layar broker”.',
        ),
      );
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
      setError(t('Scanning the IDX universe and applying JAUHI screening...', 'Memindai semesta IDX dan menerapkan penyaringan JAUHI...'));
      const stage1Result = await screeningStage1(date, numStocks, {
        category,
        capTier,
        sector,
        boardLevel: boardRiskFilter || '',
      });

      // Track whether AI was used in Stage 1
      setAiUsed(!!stage1Result.aiReview);

      if (!stage1Result || stage1Result.candidates.length === 0) {
        setError(
          t(
            'No candidates passed JAUHI restrictions. Try a different date or adjust filters.',
            'Tidak ada kandidat yang lolos batasan JAUHI. Coba tanggal lain atau sesuaikan filter.',
          ),
        );
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
        // Candidates have landed — chime.
        playDing();
        generateFramework(stage1Result.candidates, date);
        return;
      }

      // Mid-day mode: proceed directly to Stage 2 with broker screenshots
      setError(
        t(
          'Analyzing broker screenshots and detecting pack hunting patterns...',
          'Menganalisis tangkapan layar broker dan mendeteksi pola perburuan kawanan...',
        ),
      );
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
            // finalScore is 0-100 (the AI judge's scale); rescale it onto the same
            // public 1-10 score the deterministic engine uses, so the screening
            // table reads consistently whether or not broker screenshots were used.
            activeComposite: toScoreTen(item.finalScore, 0, 100),
            overallRating: ratingFromScore(toScoreTen(item.finalScore, 0, 100)),
            scores: {
              shortTerm: item.baseScore / 100, // Normalize to 0-1 range
              midTerm: item.baseScore / 100,
              longTerm: item.baseScore / 100
            },
            marketCap: base.marketCap ?? 0,
            bandarmology: base.bandarmology ?? null
          };
        });

        setScreenings(formattedResults);
        setLoading(false);
        // Mid-day Stage-2 candidates have landed — chime.
        playDing();

        // Store raw analysis for potential display
        // Note: In a full implementation, we might want to display this raw analysis
      } else {
        setError(t('Failed to get screening results from AI analysis.', 'Gagal mendapatkan hasil penyaringan dari analisis AI.'));
        setLoading(false);
      }

      generateFramework(stage1Result.candidates, date);
    } catch (err) {
      setError(err.message || t('An unexpected error occurred during screening.', 'Terjadi kesalahan tak terduga selama penyaringan.'));
      setLoading(false);
    }
  };

  const handleDatePicked = (value) => {
    setAsOfDate(value);
    setDateModalOpen(false);
    runScreening(value);
  };

  // Toggle inline broker-summary expansion for a candidate row. Bandarmology is
  // fetched lazily on the first expand (it's off the screen's critical path),
  // then cached on the row so re-expanding is instant. A `{ empty: true }`
  // sentinel marks "fetched, no broker tape" so we don't re-request it.
  const toggleBandarExpand = (ticker) => {
    const collapsing = expandedBandarTicker === ticker;
    setExpandedBandarTicker(collapsing ? null : ticker);
    if (collapsing) return;

    const row = initialScreenings.find((s) => s.ticker === ticker);
    if (!row || row.bandarmology || !row.bandarSessions?.length) return; // loaded or no inputs

    setBandarLoading(ticker);
    fetchCandidateBandarmology(ticker, { asOfDate: row.bandarAsOf, sessions: row.bandarSessions })
      .then((bandar) => {
        const loaded = bandar || { empty: true };
        setInitialScreenings((list) =>
          list.map((s) => (s.ticker === ticker ? { ...s, bandarmology: loaded } : s)),
        );
      })
      .catch(() => {
        setInitialScreenings((list) =>
          list.map((s) => (s.ticker === ticker ? { ...s, bandarmology: { empty: true } } : s)),
        );
      })
      .finally(() => setBandarLoading((cur) => (cur === ticker ? null : cur)));
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
            name: base.name ?? item.ticket,
            rank: item.ranking,
            close: base.close ?? 0,
            oneMonth: base.oneMonth ?? null,
            capTier: base.capTier ?? null,
            board: base.board ?? null,
            // finalScore is 0-100 (the AI judge's scale); rescale it onto the same
            // public 1-10 score the deterministic engine uses, so the screening
            // table reads consistently whether or not broker screenshots were used.
            activeComposite: toScoreTen(item.finalScore, 0, 100),
            overallRating: ratingFromScore(toScoreTen(item.finalScore, 0, 100)),
            scores: {
              shortTerm: item.baseScore / 100, // Normalize to 0-1 range
              midTerm: item.baseScore / 100,
              longTerm: item.baseScore / 100
            },
            marketCap: base.marketCap ?? 0,
            bandarmology: base.bandarmology ?? null
          };
        });

        setScreenings(formattedResults);
        setReranked(true);
        setAwaitingBrokerUpload(false);
        setUploadOpen(false);
        setRerankSuccess(true);
        setTimeout(() => setRerankSuccess(false), 1500);
        // Re-rank complete — chime.
        playDing();
      } else {
        setError(t('Failed to get screening results from AI analysis.', 'Gagal mendapatkan hasil penyaringan dari analisis AI.'));
      }
    } catch (err) {
      setError(err.message || t('An unexpected error occurred during re-ranking.', 'Terjadi kesalahan tak terduga selama pemeringkatan ulang.'));
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
    const name = screeningName.trim() || `${t('Screening', 'Penyaringan')} ${asOfDate || TODAY}`;
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
          <p className="font-mono text-[11px] uppercase tracking-wide text-ink-muted">{t('JAUHI AI analyzed', 'Dianalisis JAUHI AI')}</p>
          <h3 className="font-serif text-xl font-medium">{t('Market framework · top-down read', 'Kerangka pasar · pembacaan top-down')}</h3>
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
            {macro.reasons.length ? macro.reasons.join(' · ') : t('Flat tape.', 'Pasar datar.')}{' '}
            {t('— from live IHSG, FX & global indices.', '— dari IHSG, FX & indeks global secara langsung.')}
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
          <span className="font-mono text-xs text-ink-muted">{t('JAUHI AI is analyzing...', 'JAUHI AI sedang menganalisis...')}</span>
        </div>
      )}
      {frameworkError && !frameworkLoading && (
        <p className="mt-3 text-xs text-ink-muted">
          {t(
            `Macro shown above; AI narrative unavailable (${frameworkError})`,
            `Makro ditampilkan di atas; narasi AI tidak tersedia (${frameworkError})`,
          )}
        </p>
      )}

      {framework && (
        <div className="mt-6 border-t border-line pt-5">
          <div className="mb-4 flex flex-wrap items-baseline gap-3">
            <p className="text-base font-semibold text-ink">
              {t('JAUHI AI analysis result', 'Hasil analisis JAUHI AI')}
            </p>
            <Pill tone="pos">{t('Complete', 'Selesai')}</Pill>
          </div>
          <div className="max-w-prose space-y-5">
          {framework.topDown && <p className="text-sm leading-relaxed text-ink">{framework.topDown}</p>}
          {Array.isArray(framework.scenarios) && framework.scenarios.length > 0 && (
            <div>
              <p className="text-sm font-medium">{t('If / then', 'Jika / maka')}</p>
              <ul className="mt-2 divide-y divide-line">
                {framework.scenarios.map((s, i) => (
                  <li
                    key={i}
                    className="grid grid-cols-[2.25rem_1fr] items-baseline gap-x-3 gap-y-1 py-3 text-sm leading-relaxed first:pt-1 last:pb-0"
                  >
                    <span className="font-mono text-[11px] uppercase tracking-wide text-ink-muted">{t('If', 'Jika')}</span>
                    <span className="text-ink">{s.if}</span>
                    <span className="font-mono text-[11px] uppercase tracking-wide text-brand-strong">{t('Then', 'Maka')}</span>
                    <span className="text-ink-muted">{s.then}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {Array.isArray(framework.mentalModel) && framework.mentalModel.length > 0 && (
            <div>
              <p className="text-sm font-medium">{t('Trader mental model', 'Model berpikir trader')}</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-muted">
                {framework.mentalModel.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </div>
          )}
          {Array.isArray(framework.picks) && framework.picks.length > 0 && (
            <div>
              <p className="text-sm font-medium">{t('On the picks', 'Tentang pilihan')}</p>
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
      {/* ===== Stepper and main content ===== */}
      {(!loading && !error) && (
        <div className="py-2 sm:py-6">
          <Stepper steps={STEP_LABELS} current={stepperCurrent} />

          {/* Stage 1: Select Date */}
          {stage === 'date' && (
            <section className="stage-enter mx-auto mt-10 max-w-xl text-center sm:mt-16">
              <h3 className="font-serif text-4xl font-medium tracking-tight sm:text-5xl">
                {t("Find today's candidates", 'Temukan kandidat hari ini')}
              </h3>
              <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-ink-muted">
                {t(
                  `Scan the IDX universe for the top ${numStocks} names, then refine them with broker summaries.`,
                  `Pindai semesta IDX untuk ${numStocks} nama teratas, lalu sempurnakan dengan ringkasan broker.`,
                )}
              </p>

              <LiquidGlass
                as="button"
                variant="accent"
                type="button"
                onClick={() => setDateModalOpen(true)}
                className="tactile-deep mt-7 inline-flex min-h-12 items-center gap-2.5 rounded-full px-8 text-base font-medium hover:-translate-y-px sm:mt-8"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 3l14 9-14 9V3z" />
                </svg>
                {t('Run screening', 'Jalankan penyaringan')}
              </LiquidGlass>

              {/* Filters sit below the CTA, behind one button, so the hero stays
                  uncluttered. The panel holds strategy + every refinement.
                  Block-level (not inline) so it drops to its own line under the
                  CTA; the button centers via the section's text-center. */}
              <div className="relative mt-4 sm:mt-5">
                <button
                  type="button"
                  onClick={() => setFiltersOpen((v) => !v)}
                  aria-expanded={filtersOpen}
                  className="glass-quiet tactile-soft inline-flex min-h-11 items-center gap-2 px-5 py-2.5 text-sm font-medium text-ink-muted hover:-translate-y-px hover:text-ink active:translate-y-0"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 5h18M6 12h12M10 19h4" />
                  </svg>
                  {t('Filters', 'Filter')}
                  {activeFilterCount > 0 && (
                    <span className="rounded-full bg-brand-tint px-1.5 text-xs font-semibold text-brand-strong">
                      {activeFilterCount}
                    </span>
                  )}
                </button>

                {filtersOpen && (
                  <>
                    {/* click-away */}
                    <div className="fixed inset-0 z-dropdown" onClick={() => setFiltersOpen(false)} aria-hidden="true" />
                    {filtersMounted && (
                    <div
                      ref={filtersPanelRef}
                      style={{ transformOrigin: 'top center' }}
                      className="surface-glass ios-scroll absolute left-1/2 z-sticky mt-2 max-h-[80vh] w-[22rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 overflow-y-auto rounded-xl border border-line p-5 text-left"
                    >
                      <div className="space-y-4">
                        <div className="space-y-1.5">
                          <FieldLabel htmlFor="category-filter">{t('Strategy', 'Strategi')}</FieldLabel>
                          <select
                            id="category-filter"
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                            className="w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
                          >
                            {CATEGORIES.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.label}
                                {c.id === DEFAULT_CATEGORY ? t(' (default)', ' (bawaan)') : ''}
                              </option>
                            ))}
                          </select>
                          <p className="text-xs leading-relaxed text-ink-muted">
                            {activeCategory.blurb}
                            {activeCategory.fundamentals
                              ? t(' Deeper fundamental scan — takes a little longer.', ' Pemindaian fundamental lebih dalam — sedikit lebih lama.')
                              : ''}
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <FieldLabel>{t('Stocks to surface', 'Jumlah saham')}</FieldLabel>
                            <Segmented
                              role="radiogroup"
                              ariaLabel={t('Stocks to surface', 'Jumlah saham')}
                              size="sm"
                              value={numStocks}
                              onChange={setNumStocks}
                              options={COUNT_OPTIONS.map((n) => ({ value: n, label: String(n) }))}
                            />
                          </div>

                          <div className="space-y-1.5">
                            <FieldLabel>{t('Analysis mode', 'Mode analisis')}</FieldLabel>
                            <Segmented
                              role="radiogroup"
                              ariaLabel={t('Analysis mode', 'Mode analisis')}
                              size="sm"
                              value={analysisMode}
                              onChange={setAnalysisMode}
                              options={[
                                { value: 'closing', label: t('EOD close', 'Tutup EOD') },
                                { value: 'midday', label: t('Midday', 'Tengah hari') },
                              ]}
                            />
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <FieldLabel>{t('Market cap', 'Kapitalisasi pasar')}</FieldLabel>
                          <div className="flex flex-wrap gap-1 rounded-lg border border-line p-1">
                            {CAP_TIERS.map((tier) => {
                              const active =
                                tier.id === 'every'
                                  ? capTier.length === 0
                                  : capTier.includes(tier.id);
                              return (
                                <button
                                  key={tier.id}
                                  type="button"
                                  onClick={() => {
                                    if (tier.id === 'every') {
                                      setCapTier([]);
                                    } else {
                                      setCapTier((prev) =>
                                        prev.includes(tier.id)
                                          ? prev.filter((x) => x !== tier.id)
                                          : [...prev, tier.id],
                                      );
                                    }
                                  }}
                                  className={`tactile-soft whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium ${
                                    active ? 'bg-brand text-on-brand' : 'text-ink-muted hover:text-ink'
                                  }`}
                                >
                                  {tier.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <FieldLabel htmlFor="sector-filter">{t('Sector', 'Sektor')}</FieldLabel>
                            <select
                              id="sector-filter"
                              value={sector}
                              onChange={(e) => setSector(e.target.value)}
                              className="w-full rounded-md border border-line bg-paper px-2.5 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
                            >
                              <option value="">{t('All sectors', 'Semua sektor')}</option>
                              {SECTORS.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="space-y-1.5">
                            <FieldLabel htmlFor="board-risk-filter">{t('Listing board', 'Papan pencatatan')}</FieldLabel>
                            <select
                              id="board-risk-filter"
                              value={boardRiskFilter}
                              onChange={(e) => setBoardRiskFilter(e.target.value)}
                              title={t('Optional — restricts the scan to a single IDX listing board.', 'Opsional — membatasi pemindaian ke satu papan pencatatan IDX.')}
                              className="w-full rounded-md border border-line bg-paper px-2.5 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
                            >
                              <option value="">{t('Any board', 'Semua papan')}</option>
                              <option value="high">{t('Special Monitoring', 'Pemantauan Khusus')}</option>
                              <option value="elevated">{t('Acceleration', 'Akselerasi')}</option>
                              <option value="moderate">{t('Development / New Economy', 'Pengembangan / Ekonomi Baru')}</option>
                              <option value="normal">{t('Main board', 'Papan utama')}</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    </div>
                    )}
                  </>
                )}
              </div>

                {savedScreenings.length > 0 && (
                  <div className="surface-raised mx-auto mt-14 max-w-md rounded-xl border border-line p-5 text-left">
                    <p className="text-sm font-medium">{t('Saved screenings', 'Penyaringan tersimpan')}</p>
                    <ul className="mt-3 space-y-2">
                      {savedScreenings.slice(0, 5).map((s, i) => (
                        <li key={s.name} className="list-item-enter flex items-baseline justify-between gap-3 text-sm" style={{ '--i': i }}>
                          <span className="font-medium">{s.name}</span>
                          <span className="font-mono text-xs text-ink-muted">
                            {s.date} · {t(`${s.results.length} stocks`, `${s.results.length} saham`)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
          )}

          {/* Stage 3 (refine) is handled by the awaitingBrokerUpload + upload Modal below */}
        </div>
      )}

      {/* ===== Loading ===== */}
      {loading && (
        <div className="py-10">
          <p className="text-center font-mono text-xs text-ink-muted">
            {t(
              `Ranking candidates on live market data${asOfDate ? ` · as of ${asOfDate}` : ''}…`,
              `Memeringkat kandidat pada data pasar langsung${asOfDate ? ` · per ${asOfDate}` : ''}…`,
            )}
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
            className="tactile-deep mt-6 rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-on-brand hover:bg-brand-deep hover:-translate-y-px"
          >
            {t('Try again', 'Coba lagi')}
          </button>
        </div>
      )}

      {/* ===== Results ===== */}
      {awaitingBrokerUpload ? (
        <article className="report-enter pt-8">
          <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b border-line pb-6">
            <div>
              <p className="font-mono text-xs text-ink-muted">
                {t('Closing screen', 'Penyaringan penutupan')}
                {asOfDate ? t(` · as of ${asOfDate}`, ` · per ${asOfDate}`) : ''} ·{' '}
                {t(`${initialScreenings.length} candidate${initialScreenings.length === 1 ? '' : 's'}`, `${initialScreenings.length} kandidat`)}
                {aiUsed && t(' · AI-enhanced', ' · ditingkatkan AI')}
              </p>
              <h2 className="mt-1 font-serif text-4xl font-medium tracking-tight">{t('Candidates ready', 'Kandidat siap')}</h2>
              <p className="mt-2 max-w-prose text-sm text-ink-muted">
                {t(
                  'Optionally attach broker-summary screenshots, then re-rank to apply pack-hunting detection — or skip straight to the final ranking.',
                  'Lampirkan tangkapan layar ringkasan broker secara opsional, lalu peringkat ulang untuk menerapkan deteksi perburuan kawanan — atau langsung ke peringkat akhir.',
                )}
              </p>
            </div>
            <QuietButton onClick={requestNewScreening}>{t('New screening', 'Penyaringan baru')}</QuietButton>
          </header>

          <ul className="mt-6 divide-y divide-line">
            {initialScreenings.map((s, i) => {
              const owner = category === 'conglomerate' ? conglomerateOwner(s.ticker) : null;
              const expanded = expandedBandarTicker === s.ticker;
              return (
              <li key={s.ticker}>
                <div className="list-item-enter flex items-center gap-3 py-2.5" style={{ '--i': i }}>
                  <span className="w-5 shrink-0 self-start font-mono text-sm tabular-nums text-ink-muted">{i + 1}</span>
                  {/* Identity: ticker over name, one stacked cell. The data
                      columns align to this cell's vertical center. */}
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-sm font-semibold text-ink">{s.ticker}</span>
                      <span className="truncate text-xs text-ink-muted">
                        {s.name}
                        {s.capTier ? ` · ${s.capTier}` : ''}
                      </span>
                    </div>
                    {owner && (
                      <span className="mt-1 block" title={t(`Controlling owner — ${owner}`, `Pemilik pengendali — ${owner}`)}>
                        <Pill tone="muted">{owner}</Pill>
                      </span>
                    )}
                  </div>
                  {s.composite != null && (
                    <span
                      className="w-8 shrink-0 text-right font-mono text-sm tabular-nums text-ink-muted"
                      title={t('Initial ranking score', 'Skor peringkat awal')}
                    >
                      {s.composite.toFixed(1)}
                    </span>
                  )}
                  {s.overallRating && <RatingFigure rating={s.overallRating} className="w-7 shrink-0 text-left text-sm" />}
                  {(s.bandarmology?.accdist || s.bandarSessions?.length > 0) && (
                    <button
                      onClick={() => toggleBandarExpand(s.ticker)}
                      aria-expanded={expanded}
                      title={t(
                        'Broker accumulation/distribution for the session. Click to load and expand the broker summary.',
                        'Akumulasi/distribusi broker untuk sesi ini. Klik untuk memuat dan membuka ringkasan broker.',
                      )}
                      className="tactile-soft spring-color -mr-1 inline-flex shrink-0 items-center gap-1 rounded-full py-0.5 pl-2 pr-1.5 hover:bg-well/70"
                    >
                      {s.bandarmology?.accdist ? (
                        <Pill tone={accTone(s.bandarmology.accdist)}>{s.bandarmology.accdist}</Pill>
                      ) : (
                        <span className="text-[10px] font-medium uppercase tracking-wide text-ink-muted">
                          {bandarLoading === s.ticker ? t('Loading…', 'Memuat…') : t('Broker tape', 'Tape broker')}
                        </span>
                      )}
                      <svg
                        className="chev h-3 w-3 shrink-0 text-ink-muted"
                        style={{ transform: expanded ? 'rotate(180deg)' : undefined }}
                        viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                        aria-hidden="true"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
                      </svg>
                    </button>
                  )}
                  <span className="w-20 text-right font-mono text-sm tabular-nums">{formatRp(s.close)}</span>
                </div>
                {/* Inline broker-summary expansion. Always rendered so the
                    grid-template-rows collapse can animate 0fr→1fr (unmounting
                    on collapse would leave no node to transition). Uses the same
                    .details-collapse treatment as the report's details section. */}
                {(s.bandarmology || bandarLoading === s.ticker) && (
                  <div
                    className={`details-collapse details-collapse-tight ${expanded ? 'details-collapse-open' : ''}`}
                    aria-hidden={!expanded}
                  >
                    <div className="pb-3 pl-8 pr-1">
                      {bandarLoading === s.ticker ? (
                        <p className="text-xs text-ink-muted">{t('Loading broker tape…', 'Memuat tape broker…')}</p>
                      ) : s.bandarmology?.accdist ? (
                        <BandarSummary bandar={s.bandarmology} />
                      ) : (
                        <p className="text-xs text-ink-muted">
                          {t('No broker tape for this session.', 'Tidak ada tape broker untuk sesi ini.')}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </li>
              );
            })}
          </ul>

          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-5">
            <PrimaryButton onClick={handleRefineAction}>
              {brokerScreenshots.length > 0
                ? t('Re-rank candidates', 'Peringkat ulang kandidat')
                : t('Get final ranking', 'Dapatkan peringkat akhir')}
            </PrimaryButton>
            <QuietButton onClick={() => setUploadOpen(true)}>
              {brokerScreenshots.length > 0
                ? t(
                    `${brokerScreenshots.length} screenshot${brokerScreenshots.length > 1 ? 's' : ''} attached · add more`,
                    `${brokerScreenshots.length} tangkapan layar terlampir · tambah lagi`,
                  )
                : t('Attach broker screenshots', 'Lampirkan tangkapan layar broker')}
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
                  {t('Ranked', 'Diperingkat')} {asOfDate ? t(`· as of ${asOfDate}`, `· per ${asOfDate}`) : ''} ·{' '}
                  {analysisMode === 'midday' ? t('Midday', 'Tengah hari') : t('EOD close', 'Tutup EOD')}
                  {aiUsed && t(' · AI-enhanced', ' · ditingkatkan AI')}
                </p>
                <h2 className="mt-1 font-serif text-4xl font-medium tracking-tight">
                  {t(`Top ${screenings.length} candidate${screenings.length === 1 ? '' : 's'}`, `${screenings.length} kandidat teratas`)}
                </h2>
                <p className="mt-2 text-sm text-ink-muted">
                  {reranked
                    ? t(
                        'Re-ranked with broker summaries — weighted toward near-term flow.',
                        'Diperingkat ulang dengan ringkasan broker — dibobotkan ke aliran jangka pendek.',
                      )
                    : t(
                        'Ranked by composite score (short 35% · mid 35% · long 30%).',
                        'Diperingkat berdasarkan skor komposit (pendek 35% · menengah 35% · panjang 30%).',
                      )}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {reranked && <Pill tone="brand">{t('Refined', 'Disempurnakan')}</Pill>}
                {aiUsed && <Pill tone="pos">{t('AI-enhanced', 'Ditingkatkan AI')}</Pill>}
                <QuietButton onClick={requestNewScreening}>{t('New screening', 'Penyaringan baru')}</QuietButton>
              </div>
            </header>

            {/* Ranked table */}
            <div className="ios-scroll mt-6 overflow-x-auto">
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
                    <th className="py-2.5 px-2 text-left">{t('Stock', 'Saham')}</th>
                    <th className="py-2.5 px-2 text-right">{t('Price', 'Harga')}</th>
                    <th className="py-2.5 px-2 text-right">1M</th>
                    <th className="py-2.5 px-2 text-right">{t('Score', 'Skor')}</th>
                    <th className="py-2.5 pl-2 pr-1 text-right">{t('Rating', 'Peringkat')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {screenings.map((result, index) => (
                    <tr
                      key={result.ticker}
                      className="result-row-enter spring-color align-top hover:bg-well/60"
                      style={{ '--i': Math.min(index, 9) }}
                    >
                      <td className="py-3.5 pl-1 pr-2 font-mono text-sm tabular-nums text-ink-muted">
                        {result.rank}
                      </td>
                      <td className="py-3.5 px-2">
                        <div className="flex items-baseline gap-2">
                          <span className="font-mono text-sm font-semibold text-ink">{result.ticker}</span>
                          {result.board === 'Pemantauan Khusus' && (
                            <span className="shrink-0 text-[10px] uppercase tracking-wide text-warn">
                              {t('monitored', 'pemantauan')}
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
            <div className="surface-raised mt-8 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line p-5">
              <div className="max-w-prose">
                <p className="text-sm font-medium">
                  {reranked
                    ? t('Broker summaries applied', 'Ringkasan broker diterapkan')
                    : t('Refine with broker summaries', 'Sempurnakan dengan ringkasan broker')}
                </p>
                <p className="mt-1 text-sm text-ink-muted">
                  {brokerScreenshots.length > 0
                    ? t(
                        `${brokerScreenshots.length} screenshot${brokerScreenshots.length > 1 ? 's' : ''} attached. Re-ranking weights the near-term flow these confirm.`,
                        `${brokerScreenshots.length} tangkapan layar terlampir. Pemeringkatan ulang membobotkan aliran jangka pendek yang dikonfirmasi.`,
                      )
                    : t(
                        'Attach broker-summary screenshots for any of the names above, then re-rank toward near-term flow.',
                        'Lampirkan tangkapan layar ringkasan broker untuk salah satu nama di atas, lalu peringkat ulang ke aliran jangka pendek.',
                      )}
                </p>
              </div>
              <PrimaryButton onClick={handleRefineAction}>
                {brokerScreenshots.length > 0
                  ? t('Review & re-rank', 'Tinjau & peringkat ulang')
                  : t('Attach broker screenshots', 'Lampirkan tangkapan layar broker')}
              </PrimaryButton>
            </div>

            {/* Save */}
            <div className="mt-6 flex flex-wrap items-end justify-between gap-4 border-t border-line pt-6">
              <div className="min-w-64 flex-1">
                <FieldLabel htmlFor="screening-name">{t('Save this list as', 'Simpan daftar ini sebagai')}</FieldLabel>
                <input
                  id="screening-name"
                  type="text"
                  value={screeningName}
                  onChange={(e) => setScreeningName(e.target.value)}
                  placeholder={t("e.g. 'Momentum leaders'", "mis. 'Pemimpin momentum'")}
                  className="w-full rounded-md border border-line bg-paper px-3.5 py-2.5 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
                />
              </div>
              <PrimaryButton onClick={handleSaveScreening}>{t('Save list', 'Simpan daftar')}</PrimaryButton>
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
                {t(
                  `Saved as "${savedAs}" — it will appear under saved screenings on the start screen.`,
                  `Disimpan sebagai "${savedAs}" — akan muncul di penyaringan tersimpan pada layar awal.`,
                )}
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
        title={t('As of which date?', 'Per tanggal berapa?')}
        description={t(
          'The desk reads price action up to and including this session.',
          'Meja riset membaca pergerakan harga hingga dan termasuk sesi ini.',
        )}
      >
        <div className="pt-1">
          <DatePicker inline value={asOfDate} max={TODAY} onChange={handleDatePicked} />
        </div>
        <p className="mt-4 text-center text-xs text-ink-muted">
          {t(
            `Surfacing the top ${numStocks} — adjust in Filters before running.`,
            `Menampilkan ${numStocks} teratas — sesuaikan di Filter sebelum menjalankan.`,
          )}
        </p>
      </Modal>

      {/* ===== Confirm new screening ===== */}
      <Modal
        open={newScreeningConfirmOpen}
        onClose={() => setNewScreeningConfirmOpen(false)}
        title={t('Start a new screening?', 'Mulai penyaringan baru?')}
        description={t(
          'This will clear the current candidates, uploaded screenshots, and unsaved list name.',
          'Ini akan menghapus kandidat saat ini, tangkapan layar yang diunggah, dan nama daftar yang belum disimpan.',
        )}
      >
        <div className="flex flex-wrap items-center justify-end gap-3">
          <QuietButton onClick={() => setNewScreeningConfirmOpen(false)}>{t('Cancel', 'Batal')}</QuietButton>
          <PrimaryButton onClick={startNewScreening}>{t('Start new screening', 'Mulai penyaringan baru')}</PrimaryButton>
        </div>
      </Modal>

      {/* ===== Broker screenshot upload + re-rank ===== */}
      <Modal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        title={t('Broker summary screenshots', 'Tangkapan layar ringkasan broker')}
        description={t(
          'Attach summaries for the candidates above, then re-rank toward near-term flow.',
          'Lampirkan ringkasan untuk kandidat di atas, lalu peringkat ulang ke aliran jangka pendek.',
        )}
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
              ? t(`${brokerScreenshots.length} attached`, `${brokerScreenshots.length} terlampir`)
              : t('Optional — re-rank works without them.', 'Opsional — peringkat ulang tetap berjalan tanpanya.')}
          </span>
          <div className="flex items-center gap-3">
            {rerankSuccess && (
              <span className="h-4 w-4 text-pos">
                <svg className="h-4 w-4 success-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </span>
            )}
            <PrimaryButton onClick={rerankWithBrokers}>{t('Re-rank candidates', 'Peringkat ulang kandidat')}</PrimaryButton>
          </div>
        </div>
      </Modal>
    </div>
  );
}

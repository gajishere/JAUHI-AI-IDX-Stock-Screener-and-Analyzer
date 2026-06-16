import { useEffect, useState } from 'react';
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
import { fetchTopBrokers, fetchBandarmology } from '../lib/idxApi';
import { IdxBadge } from '../components/IdxBadge';
import { BrokerActionGauge, BrokerActionTable } from '../components/BrokerAction';
import { claudeAIService } from '../lib/claudeAI';
import { useLang, useT } from '../lib/i18n';

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

const accTone = (label) => {
  const lower = label.toLowerCase();
  if (/acc/i.test(lower)) return 'text-pos';
  if (/dist/i.test(lower)) return 'text-neg';
  return 'text-warn';
};

export default function StockAnalysisPage() {
  const t = useT();
  const { lang } = useLang();

  const TIMEFRAMES = [
    {
      key: 'shortTerm',
      title: t('Short term', 'Jangka pendek'),
      horizon: t('days–week', 'hari–minggu'),
      weights: t('Technical 45% · Flow 35% · Trend 20%', 'Teknikal 45% · Aliran 35% · Tren 20%'),
    },
    {
      key: 'midTerm',
      title: t('Mid term', 'Jangka menengah'),
      horizon: t('week–month', 'minggu–bulan'),
      weights: t(
        'Trend 35% · Technical 25% · Flow 20% · Fundamental 20%',
        'Tren 35% · Teknikal 25% · Aliran 20% · Fundamental 20%',
      ),
    },
    {
      key: 'longTerm',
      title: t('Long term', 'Jangka panjang'),
      horizon: t('month–year+', 'bulan–tahun+'),
      weights: t(
        'Fundamental 45% · Trend 30% · Technical 15% · Flow 10%',
        'Fundamental 45% · Tren 30% · Teknikal 15% · Aliran 10%',
      ),
    },
  ];
  const STEP_LABELS = [t('Select Stock', 'Pilih Saham'), t('Select Date', 'Pilih Tanggal')];

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
  // Live market-wide broker tape (IDX RapidAPI). Falls back to the bundled
  // reference session if the fetch fails or the key is unset. It is display-only
  // context and never enters the locked analysis score.
  const [liveBroker, setLiveBroker] = useState(null);

  useEffect(() => {
    let active = true;
    fetchTopBrokers()
      .then((data) => {
        if (active) setLiveBroker(data);
      })
      .catch(() => {
        /* keep the static brokerContext fallback */
      });
    return () => {
      active = false;
    };
  }, []);

  const broker = liveBroker ?? brokerContext;

  // Per-ticker broker accumulation/distribution (IDX bandarmology). Fetched as
  // part of runAnalysis (below), keyed off the actual as-of trading session, so
  // it's available before buildAnalysisReport scores the Flow & liquidity pillar.
  const [bandar, setBandar] = useState(null);
  const [bandarLoading, setBandarLoading] = useState(false);

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
    setBandar(null);
    try {
      const [chart, fundamentals] = await Promise.all([
        fetchChart(code, '2y'),
        fetchFundamentals(code),
      ]);
      const emitenInfo = findEmiten(code);

      // Bandarmology feeds the Flow & liquidity pillar (see flowScore in
      // analysis.js), so it must be fetched before scoring — keyed off the
      // actual as-of trading session, not the requested date (which may fall
      // on a non-trading day). A fetch failure degrades gracefully: the score
      // just falls back to the technical/volume-only flow read.
      const asOfCandles = chart.candles.filter((c) => c.date <= date);
      const asOfSession = asOfCandles[asOfCandles.length - 1]?.date ?? date;
      let bandarResult = null;
      setBandarLoading(true);
      try {
        bandarResult = await fetchBandarmology(code, { date: asOfSession });
      } catch {
        /* IDX bandarmology unavailable — score falls back to flow without it */
      } finally {
        setBandarLoading(false);
      }
      setBandar(bandarResult);

      const analysisData = buildAnalysisReport({
        code,
        requestedDate: date,
        chart,
        fundamentals,
        emitenInfo,
        bandarmology: bandarResult,
      });
      setAnalysis(analysisData);

      // Get AI-enhanced analysis
      setAILoading(true);
      try {
        const aiResult = await claudeAIService.getAIEnhancedAnalysis(code, analysisData, fundamentals, brokerScreenshots, bandarResult, lang);
        setAIAnalysis(aiResult);
      } catch (aiErr) {
        setAIError(aiErr.message || t('Failed to get AI analysis', 'Gagal mendapatkan analisis AI'));
      } finally {
        setAILoading(false);
      }

      setStage('report');
    } catch (err) {
      setError(err.message || t('Something went wrong fetching market data.', 'Terjadi kesalahan saat mengambil data pasar.'));
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
    setBandar(null);
  };

  const sentimentTone =
    analysis?.sentiment === 'Bullish' ? 'pos' : analysis?.sentiment === 'Bearish' ? 'neg' : 'warn';

  const stepperCurrent = stage === 'date' ? 2 : 1;

  return (
    <div className="flex flex-col">
      {/* ===== Input flow (steps 1–3) ===== */}
      {stage !== 'report' && !loading && (
        <div className="py-2 sm:py-6">
          <Stepper steps={STEP_LABELS} current={stepperCurrent} />

          {/* Step 1 — big centered search */}
          {stage === 'search' && (
            <section key="search" className="stage-enter mx-auto mt-9 max-w-2xl text-center sm:mt-12">
              <h2 className="font-serif text-4xl font-medium tracking-tight sm:text-5xl">
                {t('Which stock?', 'Saham yang mana?')}
              </h2>
              <p className="mt-3 text-sm text-ink-muted">
                {t(
                  `Search all ${EMITEN_COUNT} IDX-listed companies by code or name.`,
                  `Cari ${EMITEN_COUNT} perusahaan tercatat di IDX berdasarkan kode atau nama.`,
                )}
              </p>

              <div className="relative mt-7 text-left sm:mt-9">
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
                  placeholder={t('Try “BBCA” or “Telkom”', 'Coba “BBCA” atau “Telkom”')}
                  autoFocus
                  role="combobox"
                  aria-expanded={suggestedTickers.length > 0}
                  aria-autocomplete="list"
                  className="w-full rounded-2xl border border-line bg-paper py-4 pl-14 pr-5 font-mono text-lg text-ink shadow-lg shadow-ink/5 transition-[transform,opacity] duration-200 placeholder:font-sans placeholder:text-ink-muted/70 hover:border-ink-muted/50 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15"
                />
                {suggestedTickers.length > 0 && (
                  <ul
                    role="listbox"
                    className="dropdown-enter absolute left-0 right-0 z-dropdown mt-2 max-h-72 overflow-y-auto rounded-xl border border-line bg-elevated py-1.5 text-left shadow-xl shadow-ink/10"
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
                              {t('monitored', 'pemantauan')}
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
            <section key="date" className="stage-enter mx-auto mt-9 max-w-md text-center sm:mt-12">
              <button
                type="button"
                onClick={() => setStage('search')}
                className="mx-auto mb-6 inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-paper pl-3 pr-4 text-sm transition-colors hover:border-ink-muted/50 hover:scale-[1.02] active:scale-[0.95]"
              >
                <span className="text-ink-muted">‹ {t('Change', 'Ubah')}</span>
                <span className="font-mono font-semibold">{ticker}</span>
                <span className="hidden text-ink-muted sm:inline">· {selectedEmiten?.name}</span>
              </button>
              <h2 className="font-serif text-3xl font-medium tracking-tight sm:text-4xl">
                {t('As of which date?', 'Per tanggal berapa?')}
              </h2>
              <p className="mt-3 text-sm text-ink-muted">
                {t(
                  'The desk reads price action up to and including this session.',
                  'Meja riset membaca pergerakan harga hingga dan termasuk sesi ini.',
                )}
              </p>

              <div className="mt-8 rounded-2xl border border-line bg-paper p-6 shadow-lg shadow-ink/5">
                <DatePicker inline value={date} max={TODAY} onChange={handlePickDate} />
              </div>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                <PrimaryButton onClick={runAnalysis} loading={loading}>
                  {t('Analyze stock', 'Analisis saham')}
                </PrimaryButton>
                <QuietButton onClick={() => setUploadOpen(true)}>
                  {brokerScreenshots.length > 0
                    ? t(
                        `${brokerScreenshots.length} screenshot${brokerScreenshots.length > 1 ? 's' : ''} attached`,
                        `${brokerScreenshots.length} tangkapan layar terlampir`,
                      )
                    : t('Add screenshots', 'Tambah tangkapan layar')}
                </QuietButton>
              </div>
              <p className="mt-3 text-xs text-ink-muted">
                {t(
                  'Screenshots are optional and can be attached before analyzing.',
                  'Tangkapan layar bersifat opsional dan dapat dilampirkan sebelum analisis.',
                )}
              </p>
              {error && (
                <div role="alert" className="mt-5 rounded-md border border-neg/30 bg-neg-tint px-4 py-3 text-left">
                  <p className="text-sm font-medium text-neg">{t('Could not build the note', 'Tidak dapat menyusun catatan')}</p>
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
        title={t('Broker summary screenshots', 'Tangkapan layar ringkasan broker')}
        description={t(
          'Optional — the AI reads any attached broker summaries alongside the analysis.',
          'Opsional — AI membaca ringkasan broker yang dilampirkan bersama analisis.',
        )}
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
              ? t(`${brokerScreenshots.length} attached`, `${brokerScreenshots.length} terlampir`)
              : t('No screenshots yet', 'Belum ada tangkapan layar')}
          </span>
          <PrimaryButton onClick={() => setUploadOpen(false)}>{t('Done', 'Selesai')}</PrimaryButton>
        </div>
      </Modal>

      {/* Loading */}
      {loading && (
        <div className="py-6">
          <p className="text-center font-mono text-xs text-ink-muted">
            {t(`Pulling live market data for ${ticker}…`, `Mengambil data pasar langsung untuk ${ticker}…`)}
          </p>
          <ReportSkeleton />
        </div>
      )}

      {/* ===== Report ===== */}
      {stage === 'report' && analysis && (
        <article className="report-enter">
          <div className="mb-8 flex items-center justify-between gap-4">
            <p className="font-mono text-xs text-ink-muted">{t('Analysis complete', 'Analisis selesai')}</p>
            <QuietButton onClick={startOver}>{t('New analysis', 'Analisis baru')}</QuietButton>
          </div>

          {/* Report masthead */}
          <header className="relative border-b border-line pb-6">
            <div className="relative flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
              <div>
                <p className="font-mono text-xs text-ink-muted">
                  {t('Equity flow note · session', 'Catatan aliran saham · sesi')} {analysis.asOf}
                  {analysis.asOf !== analysis.date &&
                    t(` (last trade before ${analysis.date})`, ` (transaksi terakhir sebelum ${analysis.date})`)}
                </p>
                <h2 className="mt-1 font-serif text-6xl font-medium tracking-tighter leading-none">
                  {analysis.ticker}
                </h2>
                <p className="mt-2 text-sm text-ink-muted max-w-prose">
                  {analysis.name ?? t('IDX-listed equity', 'Saham tercatat di IDX')}
                </p>
              </div>
              <div className="text-right">
                <div className="flex items-baseline gap-3">
                  <RatingFigure rating={analysis.overallRatings.shortTerm.rating} className="text-6xl" />
                  <div className="text-left">
                    <p className="mt-0 text-xs text-ink-muted font-medium">{t('Short-term', 'Jangka pendek')}</p>
                    <p className="mt-0 text-xs text-ink">{t('Rating', 'Peringkat')}</p>
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
                  {Math.round(analysis.fiftyTwoWeekPos * 100)}% {t('of 52-week range', 'dari rentang 52-minggu')}
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
                  {t(
                    `${brokerScreenshots.length} screenshot${brokerScreenshots.length > 1 ? 's' : ''} on file`,
                    `${brokerScreenshots.length} tangkapan layar tersimpan`,
                  )}
                </Pill>
              )}
            </div>
          </header>

          {/* AI-enhanced insight — speaks the same inline-label voice as the report */}
          {aiAnalysis && (
            <Section
              title={t('AI-enhanced insights', 'Wawasan dengan AI')}
              aside={
                aiAnalysis.confidence ? (
                  <Pill tone={confidenceTone(aiAnalysis.confidence)}>
                    {(() => {
                      const c = aiAnalysis.confidence?.toLowerCase();
                      const word =
                        c === 'high'
                          ? t('High', 'Tinggi')
                          : c === 'low'
                            ? t('Low', 'Rendah')
                            : t('Medium', 'Sedang');
                      return t(`${word} confidence`, `Keyakinan ${word}`);
                    })()}
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
                    <span className="font-medium">{t('Also worth noting.', 'Perlu dicatat juga.')}</span>{' '}
                    <span className="text-ink-muted">{aiAnalysis.additionalConsiderations}</span>
                  </p>
                )}
                {aiAnalysis.confidenceReasoning && (
                  <p className="text-sm leading-relaxed">
                    <span className="font-medium">{t('Why this read.', 'Alasan pembacaan ini.')}</span>{' '}
                    <span className="text-ink-muted">{aiAnalysis.confidenceReasoning}</span>
                  </p>
                )}
                {aiAnalysis.actionableTip && (
                  <p className="text-sm leading-relaxed">
                    <span className="font-medium">{t('Trader tip.', 'Tips trader.')}</span>{' '}
                    <span className="text-ink-muted">{aiAnalysis.actionableTip}</span>
                  </p>
                )}
                {aiAnalysis.brokerScreenshotRead && (
                  <p className="text-sm leading-relaxed">
                    <span className="font-medium">{t('Screenshot read.', 'Pembacaan tangkapan layar.')}</span>{' '}
                    <span className="text-ink-muted">{aiAnalysis.brokerScreenshotRead}</span>
                  </p>
                )}
              </div>
            </Section>
          )}
          {aiLoading && (
            <Section title={t('AI-enhanced insights', 'Wawasan dengan AI')}>
              <div className="flex items-center gap-3">
                <span className="jauhi-scan" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
                <span className="font-mono text-xs text-ink-muted">{t('AI is reading the note…', 'AI sedang membaca catatan…')}</span>
              </div>
            </Section>
          )}
          {aiError && !aiLoading && (
            <Section title={t('AI-enhanced insights', 'Wawasan dengan AI')}>
              <p className="max-w-prose text-sm text-ink-muted">
                {t(
                  `The note above is built from market data; AI commentary is unavailable (${aiError}).`,
                  `Catatan di atas dibuat dari data pasar; komentar AI tidak tersedia (${aiError}).`,
                )}
              </p>
            </Section>
          )}


          {/* Essential sections - always visible */}
          <div className="space-y-6">
            {/* Rating by timeframe */}
            <Section title={t('Rating by timeframe', 'Peringkat per jangka waktu')}>
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
                        <span className="font-mono text-sm text-ink-muted">{overall.score10.toFixed(1)} / 10.0</span>
                      </p>
                      <p className="mt-2.5 text-sm">
                        <span className="text-ink-muted">{t('Key driver — ', 'Pendorong utama — ')}</span>
                        {overall.keyDriver}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-ink-muted">{frame.weights}</p>
                    </div>
                  );
                })}
              </div>
            </Section>

            {/* Rationale */}
            <Section title={t('Rationale', 'Dasar pemikiran')}>
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
            <Section title={t('Action plan', 'Rencana aksi')}>
              <div className="relative max-w-prose space-y-3">
                <p className="text-sm leading-relaxed">
                  <span className="font-medium">{t('Short term · trading.', 'Jangka pendek · trading.')}</span>{' '}
                  <span className="text-ink-muted">{analysis.actionRecommendations.shortTerm}</span>
                </p>
                <p className="text-sm leading-relaxed">
                  <span className="font-medium">{t('Mid term · swing.', 'Jangka menengah · swing.')}</span>{' '}
                  <span className="text-ink-muted">{analysis.actionRecommendations.midTerm}</span>
                </p>
                <p className="text-sm leading-relaxed">
                  <span className="font-medium">{t('Long term · invest.', 'Jangka panjang · investasi.')}</span>{' '}
                  <span className="text-ink-muted">{analysis.actionRecommendations.longTerm}</span>
                </p>
              </div>
            </Section>

            {/* Key levels */}
            <Section title={t('Key levels', 'Level kunci')}>
              <div className="relative grid gap-x-12 md:grid-cols-2">
                <Row label={t('Ideal entry', 'Entry ideal')} value={analysis.keyLevels.idealEntry} />
                <Row label={t('Stop loss', 'Stop loss')} value={analysis.keyLevels.stopLoss} tone="text-neg" />
                <Row label={t('Target — short term', 'Target — jangka pendek')} value={analysis.keyLevels.targetShortTerm} tone="text-pos" />
                <Row label={t('Target — mid term', 'Target — jangka menengah')} value={analysis.keyLevels.targetMidTerm} tone="text-pos" />
                <Row label={t('Target — long term', 'Target — jangka panjang')} value={analysis.keyLevels.targetLongTerm} tone="text-pos" />
              </div>
            </Section>
          </div>

          <div className="mt-6 border-t border-line pt-6">
            <QuietButton onClick={() => setDetailsExpanded(!detailsExpanded)}>
              {detailsExpanded
                ? t('Hide details', 'Sembunyikan detail')
                : t('Show details & analysis', 'Tampilkan detail & analisis')}
            </QuietButton>
          </div>
          {/* Expandable details */}
          <div
            className={`details-collapse ${detailsExpanded ? 'details-collapse-open' : ''}`}
            aria-hidden={!detailsExpanded}
          >
            <div className="space-y-6">
              {analysis.profile && (
                <Section title={t('Company profile', 'Profil perusahaan')}>
                  {analysis.profile.risk && analysis.profile.risk.level === 'high' && (
                    <div
                      role="alert"
                      className="mb-4 rounded-md border border-neg/30 bg-neg-tint px-4 py-2.5 text-sm text-neg"
                    >
                      {analysis.profile.risk.note}.
                    </div>
                  )}
                  <div className="relative grid gap-x-12 md:grid-cols-2">
                    <Row label={t('Market cap', 'Kapitalisasi pasar')} value={formatRpCompact(analysis.profile.marketCap)} />
                    <Row label={t('Size tier', 'Kelas ukuran')} value={analysis.profile.capTier ?? '—'} />
                    <Row
                      label={t('Shares outstanding', 'Saham beredar')}
                      value={
                        analysis.profile.shares
                          ? analysis.profile.shares.toLocaleString('en-US')
                          : '—'
                      }
                    />
                    <Row label={t('Listing board', 'Papan pencatatan')} value={analysis.profile.board ?? '—'} />
                    <Row label={t('Listed since', 'Tercatat sejak')} value={analysis.profile.listed ?? '—'} />
                  </div>
                  <p className="mt-2 text-xs text-ink-muted">
                    {t(
                      'Profile sourced from the IDX emiten reference (shares outstanding, listing board).',
                      'Profil bersumber dari referensi emiten IDX (saham beredar, papan pencatatan).',
                    )}
                  </p>
                </Section>
              )}

              <div className="mt-2">
                <Section
                  title={t('Flow & liquidity', 'Aliran & likuiditas')}
                  aside={<RatingBadge rating={analysis.flow.rating} />}
                >
                  <div className="relative grid gap-x-12 md:grid-cols-2">
                    <Row
                      label={t('Value traded (session)', 'Nilai transaksi (sesi)')}
                      value={formatRpCompact(analysis.flow.lastValueTraded)}
                    />
                    <Row
                      label={t('20-day average value', 'Nilai rata-rata 20-hari')}
                      value={formatRpCompact(analysis.flow.avgValueTraded20)}
                    />
                    <Row label={t('Volume trend', 'Tren volume')} value={analysis.flow.volumeTrend} />
                    <Row
                      label={t('OBV interpretation', 'Interpretasi OBV')}
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
                    {t(
                      'Per-ticker foreign and broker flows are not in the public price feed; this section reads participation from on-balance volume and traded value instead.',
                      'Aliran asing dan broker per-saham tidak tersedia di data harga publik; bagian ini membaca partisipasi dari on-balance volume dan nilai transaksi.',
                    )}
                  </p>
                </Section>
              </div>

              <Section
                title={t('Market context · broker activity', 'Konteks pasar · aktivitas broker')}
                aside={
                  broker.live ? (
                    <IdxBadge date={broker.sessionDate} />
                  ) : (
                    <Pill tone="muted">{t('Reference session', 'Sesi acuan')}</Pill>
                  )
                }
              >
                <div className="relative grid gap-x-12 md:grid-cols-2">
                  <Row
                    label={t('Session turnover (all brokers)', 'Nilai transaksi sesi (semua broker)')}
                    value={formatRpCompact(broker.turnoverValue)}
                  />
                  <Row
                    label={t('Foreign broker share', 'Porsi broker asing')}
                    value={
                      broker.foreignShare != null
                        ? `${Math.round(broker.foreignShare * 100)}%`
                        : '—'
                    }
                  />
                  <Row
                    label={t('Transactions', 'Transaksi')}
                    value={broker.totalFreq.toLocaleString('en-US')}
                  />
                  <Row label={t('Member firms', 'Anggota bursa')} value={String(broker.brokerCount)} />
                </div>
                <p className="mb-1 mt-4 text-sm text-ink-muted">{t('Most active brokers (by value)', 'Broker paling aktif (berdasarkan nilai)')}</p>
                <div className="relative grid gap-x-12 md:grid-cols-2">
                  {broker.topByValue.map((b) => (
                    <Row
                      key={b.code}
                      label={`${b.code} · ${b.name}${b.foreign ? t(' (foreign)', ' (asing)') : ''}`}
                      value={formatRpCompact(b.value)}
                    />
                  ))}
                </div>
                <p className="mt-3 max-w-prose text-xs text-ink-muted">
                  {broker.live
                    ? t(
                        `Live market-wide broker tape (IDX RapidAPI). Shown as participation context — it is not specific to ${analysis.ticker}.`,
                        `Rekaman broker seluruh pasar secara langsung (IDX RapidAPI). Ditampilkan sebagai konteks partisipasi — tidak spesifik untuk ${analysis.ticker}.`,
                      )
                    : t(
                        `Market-wide broker tape from the reference session (broker-data source). Shown as participation context — it is not specific to ${analysis.ticker}.`,
                        `Rekaman broker seluruh pasar dari sesi acuan (sumber broker-data). Ditampilkan sebagai konteks partisipasi — tidak spesifik untuk ${analysis.ticker}.`,
                      )}
                </p>
              </Section>

              {/* Bandarmology section */}
              {bandarLoading ? (
                <Section
                  title={t('Bandarmology · broker accumulation','Bandarmologi · akumulasi broker')}
                  aside={bandar ? <IdxBadge date={bandar.date} /> : null}
                >
                  <div className="flex items-center gap-3">
                    <span className="jauhi-scan" aria-hidden="true">
                      <span />
                      <span />
                      <span />
                    </span>
                    <span className="font-mono text-xs text-ink-muted">{t('Loading bandarmology...', 'Memuat bandarmologi...')}</span>
                  </div>
                </Section>
              ) : bandar && !bandar.empty ? (
                <Section
                  title={t('Bandarmology · broker accumulation','Bandarmologi · akumulasi broker')}
                  aside={<IdxBadge date={bandar.date} />}
                >
                    {/* Headline accumulation/distribution read */}
                    <div className="flex items-baseline gap-3">
                      <span className="font-mono text-xs text-ink-muted">{t('Accumulation/Distribution', 'Akumulasi/Distribusi')}</span>
                      <Pill tone={accTone(bandar.accdist)} className="text-xs">
                        {bandar.accdist}
                      </Pill>
                    </div>

                    <div className="mt-5 space-y-5">
                      <BrokerActionGauge bandar={bandar} t={t} />
                      <BrokerActionTable bandar={bandar} t={t} />

                      <div className="grid gap-x-6 sm:grid-cols-2">
                        <Row label={t('Top-5 stance', 'Sifat 5 teratas')} value={bandar.top5Accdist} />
                        <Row label={t('Net value of top 5', 'Nilai net 5 teratas')} value={formatRpCompact(bandar.top5NetValue)} />
                        <Row label={t('Buyers vs sellers', 'Pembeli vs penjual')} value={`${bandar.totalBuyers} / ${bandar.totalSellers}`} />
                        <Row label={t('Session value', 'Nilai sesi')} value={formatRpCompact(bandar.sessionValue)} />
                      </div>

                      <p className="text-xs text-ink-muted">
                        {t(
                          'Per-ticker broker accumulation/distribution from the IDX API — folded into the Flow & liquidity pillar above.',
                          'Akumulasi/distribusi broker per-saham dari IDX API — turut membentuk pilar Aliran & likuiditas di atas.'
                        )}
                      </p>
                    </div>
                  </Section>
              ) : bandar && bandar.empty ? (
                <Section
                  title={t('Bandarmology · broker accumulation','Bandarmologi · akumulasi broker')}
                  aside={bandar ? <IdxBadge date={bandar.date} /> : null}
                >
                  <p className="max-w-prose text-sm text-ink-muted">
                    {t('No broker-summary data for this session.','Tidak ada data ringkasan broker untuk sesi ini.')}
                  </p>
                </Section>
              ) : null}

              <Section
                title={t('Technicals', 'Teknikal')}
                aside={<RatingBadge rating={analysis.technical.rating} />}
              >
                <div className="relative grid gap-x-12 md:grid-cols-2">
                  <Row label={t('Price position', 'Posisi harga')} value={analysis.technical.pricePosition} />
                  <Row label={t('RSI (14)', 'RSI (14)')} value={analysis.technical.rsi14?.toFixed(0) ?? '—'} />
                  <Row label={t('Distance to ARA', 'Jarak ke ARA')} value={formatPct(analysis.technical.distanceToAra)} />
                  <Row label={t('Distance to ARB', 'Jarak ke ARB')} value={formatPct(analysis.technical.distanceToArb)} />
                </div>
                <p className="mt-3 max-w-prose text-sm leading-relaxed text-ink">
                  {analysis.technical.vwapNote}.{' '}
                  <span className="text-ink-muted">
                    {t('Support', 'Support')}: {formatRp(analysis.technical.support)} | {t('Resistance', 'Resistance')}:{' '}
                    {formatRp(analysis.technical.resistance)} {t('(20-session range)', '(rentang 20-sesi)')}
                  </span>
                </p>
              </Section>

              <Section
                title={t('Fundamentals', 'Fundamental')}
                aside={analysis.fundamentals && <RatingBadge rating={analysis.fundamentals.rating} />}
              >
                {analysis.fundamentals ? (
                  <div className="relative grid gap-x-12 md:grid-cols-2">
                    <Row
                      label={t('Earnings per share (annual)', 'Laba per saham (tahunan)')}
                      value={formatRp(analysis.fundamentals.eps, 0)}
                    />
                    <Row
                      label={t('Trailing P/E', 'P/E trailing')}
                      value={
                        analysis.fundamentals.per != null
                          ? `${analysis.fundamentals.per.toFixed(1)}x`
                          : '—'
                      }
                    />
                    <Row
                      label={t('Revenue growth (YoY)', 'Pertumbuhan pendapatan (YoY)')}
                      value={formatPct(analysis.fundamentals.revenueGrowth)}
                      tone={moveTone(analysis.fundamentals.revenueGrowth)}
                    />
                    <Row
                      label={t('Debt to equity', 'Utang terhadap ekuitas')}
                      value={
                        analysis.fundamentals.debtToEquity != null
                          ? `${analysis.fundamentals.debtToEquity.toFixed(2)}x`
                          : '—'
                      }
                    />
                  </div>
                ) : (
                  <p className="max-w-prose text-sm text-ink-muted">
                    {t(
                      'Published fundamentals were unavailable for this ticker; ratings below lean on price structure and flow.',
                      'Data fundamental yang dipublikasikan tidak tersedia untuk saham ini; peringkat di bawah bersandar pada struktur harga dan aliran dana.',
                    )}
                  </p>
                )}
              </Section>

              <Section
                title={t('Trend', 'Tren')}
                aside={<RatingBadge rating={analysis.trend.rating} />}>
              <div className="relative grid gap-x-12 md:grid-cols-2">
                <Row label={t('1-week move', 'Pergerakan 1-minggu')} value={formatPct(analysis.trend.oneWeek)} tone={moveTone(analysis.trend.oneWeek)} />
                <Row label={t('1-month move', 'Pergerakan 1-bulan')} value={formatPct(analysis.trend.oneMonth)} tone={moveTone(analysis.trend.oneMonth)} />
                <Row label={t('3-month move', 'Pergerakan 3-bulan')} value={formatPct(analysis.trend.threeMonths)} tone={moveTone(analysis.trend.threeMonths)} />
                <Row label={t('Volume trend', 'Tren volume')} value={analysis.trend.volumeTrend} />
              </div>
              </Section>
            </div>
          </div>
        </article>
      )}
    </div>
  );
}

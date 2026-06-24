import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  BrokerScreenshotField,
  FieldLabel,
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
import { LiquidGlass } from '../components/LiquidGlass';
import { Stepper } from '../components/Stepper';
import { Segmented } from '../components/Segmented';
import { fetchChart, fetchFundamentals } from '../lib/marketData';
import { buildAnalysisReport, formatPct, formatRp, formatRpCompact } from '../lib/analysis';
import { searchEmiten, findEmiten, brokerContext, EMITEN_COUNT } from '../lib/universe';
import { fetchTopBrokers, fetchBandarmologyRange } from '../lib/idxApi';
import { IdxBadge } from '../components/IdxBadge';
import { BrokerActionGauge, BrokerActionTable } from '../components/BrokerAction';
import { claudeAIService } from '../lib/claudeAI';
import { newsService } from '../lib/news';
import { useLang, useT } from '../lib/i18n';
import { useSpringPresence } from '../lib/useSpringPresence';
import { presets } from '../lib/motion';
import { wibNow } from '../lib/marketHours';
import { useSound } from '../lib/sound';

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

// News sentiment reads the same way the headline sentiment pill does.
const newsSentimentTone = (s) => {
  const v = String(s || '').toLowerCase();
  return v === 'positive' ? 'pos' : v === 'negative' ? 'neg' : 'warn';
};

const RISK_TONE = { high: 'neg', elevated: 'warn', moderate: 'muted', normal: 'muted' };
const TODAY = new Date().toISOString().slice(0, 10);

const accTone = (label) => {
  const lower = label.toLowerCase();
  if (/acc/i.test(lower)) return 'text-pos';
  if (/dist/i.test(lower)) return 'text-neg';
  return 'text-warn';
};

// Verdict vocabulary shared by the buy/hold answer card. Maps each controlled
// token to a tone, a localized display word, and a fallback headline used when
// the AI call failed or returned an off-schema verdict.
const VERDICT_TONE = { BUY: 'pos', HOLD: 'pos', WAIT: 'warn', TRIM: 'warn', AVOID: 'neg', SELL: 'neg' };
const VERDICT_WORD = {
  BUY: ['Buy', 'Beli'],
  WAIT: ['Wait', 'Tunggu'],
  AVOID: ['Avoid', 'Hindari'],
  HOLD: ['Hold', 'Tahan'],
  TRIM: ['Trim', 'Kurangi'],
  SELL: ['Sell', 'Jual'],
};

// Tone-keyed styling for the verdict card so colors stay static (Tailwind can't
// see runtime-built class names). The card is a liquid-glass slab (`.glass-card`
// + `.glass-verdict` in index.css): the verdict tint shows through the
// translucent fill and rims the card, so color still carries the call — the
// Verdict Rule holds even under glass. The `.verdict-*` class still supplies the
// flat-gradient fallback for browsers without backdrop-filter, and tints the
// glass `::after` wash with the verdict hue (more saturated at the top behind the
// large display word, more opaque toward the body where the dotted-leader Rows
// live, so muted labels keep WCAG AA — the contract the gradient was built for).
const VERDICT_TONE_STYLE = {
  pos: { word: 'text-pos', card: 'verdict-pos border-pos/30', dot: 'bg-pos' },
  warn: { word: 'text-warn', card: 'verdict-warn border-warn/40', dot: 'bg-warn' },
  neg: { word: 'text-neg', card: 'verdict-neg border-neg/30', dot: 'bg-neg' },
};

// When the AI verdict is missing/invalid, derive a sensible call from the locked
// composite so the user still gets a direct answer.
function deriveFallbackVerdict(intent, analysis) {
  const r = analysis.overallRatings || {};
  const short = r.shortTerm?.score ?? 5;
  const mid = r.midTerm?.score ?? 5;
  if (intent === 'buy') return short >= 6.5 ? 'BUY' : short >= 5 ? 'WAIT' : 'AVOID';
  const avg = (short + mid) / 2;
  return avg >= 6.5 ? 'HOLD' : avg >= 5 ? 'TRIM' : 'SELL';
}

// The headline answer to the user's question (buy-or-not / hold-or-sell). Reads
// the AI verdict when present, falls back to the locked composite otherwise, and
// always shows the concrete price levels (and live P&L for holders). Facts are
// dotted-leader Rows — the report's typographic spine — never tiled cards.
function VerdictCard({ intent, ai, analysis, positionPnl }) {
  const t = useT();
  const levels = analysis.levels || {};
  const kl = analysis.keyLevels || {};
  const close = analysis.close;

  const validTokens = intent === 'buy' ? ['BUY', 'WAIT', 'AVOID'] : ['HOLD', 'TRIM', 'SELL'];
  let verdict = String(ai?.verdict || '').toUpperCase().trim();
  const fromAI = validTokens.includes(verdict);
  if (!fromAI) verdict = deriveFallbackVerdict(intent, analysis);

  const tone = VERDICT_TONE[verdict] || 'warn';
  const style = VERDICT_TONE_STYLE[tone];
  const word = VERDICT_WORD[verdict] ? t(VERDICT_WORD[verdict][0], VERDICT_WORD[verdict][1]) : verdict;

  const question =
    intent === 'buy'
      ? t(`Should I buy ${analysis.ticker}?`, `Apakah saya beli ${analysis.ticker}?`)
      : t(`Should I hold or sell ${analysis.ticker}?`, `Tahan atau jual ${analysis.ticker}?`);

  // Upside from the as-of close to the nearest (short-term) target.
  const upside = levels.targetShort != null && close ? (levels.targetShort - close) / close : null;
  const pnlTone = positionPnl?.isProfit ? 'text-pos' : 'text-neg';

  const headline =
    (ai?.verdictHeadline || '').trim() ||
    t('Based on the market data below.', 'Berdasarkan data pasar di bawah.');
  const reason = (ai?.verdictReason || '').trim();
  const guidance = (ai?.priceGuidance || '').trim();

  return (
    <div className={`glass-card glass-verdict verdict-reveal rounded-2xl p-6 sm:p-7 ${style.card}`}>
      {/* Kicker sits on the strongest part of the verdict gradient, where the
          muted token drops below AA — use a 70% ink so it clears 4.5:1 on the
          full tint in both themes without going full-weight. */}
      <p className="font-serif text-lg font-medium">{question}</p>

      <div className="mt-5 flex flex-col items-start gap-x-3 gap-y-1 sm:mt-6 sm:flex-row sm:items-baseline">
        <span className={`font-serif text-4xl font-medium tracking-tight sm:text-5xl ${style.word}`}>{word}</span>
        <span className="text-sm text-ink">{headline}</span>
      </div>

      {/* Holder position — live unrealized P&L from the as-of close. */}
      {intent === 'hold' && positionPnl && (
        <div className="mt-5 grid gap-x-10 gap-y-0 sm:grid-cols-2">
          <Row label={t('Average entry', 'Entri rata-rata')} value={formatRp(positionPnl.entryPrice)} />
          <Row label={t('Current price', 'Harga saat ini')} value={formatRp(close)} />
          <Row label={t('Unrealized P&L', 'P&L belum terealisasi')} value={formatPct(positionPnl.pct)} tone={pnlTone} />
          <Row
            label={t('Unrealized value', 'Nilai belum terealisasi')}
            value={positionPnl.quantity ? formatRp(positionPnl.amount) : '—'}
            tone={positionPnl.quantity ? pnlTone : undefined}
          />
        </div>
      )}

      {/* Concrete price levels to act on. */}
      <div className="mt-4 grid gap-x-10 gap-y-0 border-t border-line/70 pt-4 sm:grid-cols-2">
        {intent === 'buy' ? (
          <>
            <Row label={t('Ideal entry', 'Entri ideal')} value={kl.idealEntry} />
            <Row label={t('Short-term target', 'Target jangka pendek')} value={kl.targetShortTerm} tone="text-pos" />
            {upside != null && (
              <Row label={t('Upside to target', 'Potensi naik ke target')} value={formatPct(upside)} tone="text-pos" />
            )}
            <Row label={t('Stop loss', 'Stop loss')} value={kl.stopLoss} tone="text-neg" />
          </>
        ) : (
          <>
            <Row label={t('Take profit', 'Ambil untung')} value={kl.targetShortTerm} tone="text-pos" />
            <Row label={t('Cut loss', 'Batas rugi')} value={kl.stopLoss} tone="text-neg" />
            <Row label={t('Break-even', 'Titik impas')} value={positionPnl ? formatRp(positionPnl.entryPrice) : '—'} />
          </>
        )}
      </div>

      {guidance && (
        <p className="mt-5 max-w-prose text-sm leading-relaxed text-ink">
          <span className="font-medium">{t('Price plan. ', 'Rencana harga. ')}</span>
          {guidance}
        </p>
      )}
      {reason && <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink">{reason}</p>}

      <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-ink-muted">
        {ai?.confidence && (
          <Pill tone={confidenceTone(ai.confidence)}>
            {t(`AI confidence: ${ai.confidence}`, `Keyakinan AI: ${ai.confidence}`)}
          </Pill>
        )}
        <span className="inline-flex items-center gap-1.5">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${style.dot}`} aria-hidden="true" />
          {fromAI
            ? t('AI verdict, from the analysis below.', 'Putusan AI, dari analisis di bawah.')
            : t('Derived from the composite score (AI commentary unavailable).', 'Berasal dari skor komposit (komentar AI tidak tersedia).')}
        </span>
      </div>
    </div>
  );
}

export default function StockAnalysisPage() {
  const t = useT();
  const { lang } = useLang();
  const location = useLocation();
  const { playDing } = useSound();

  const TIMEFRAMES = [
    {
      key: 'shortTerm',
      title: t('Short term', 'Jangka pendek'),
      horizon: t('days–week', 'hari–minggu'),
      weights: t('Technical 35% · Flow 25% · Bandarmology 20% · Trend 10% · News 10%', 'Teknikal 35% · Aliran 25% · Bandarmologi 20% · Tren 10% · Berita 10%'),
    },
    {
      key: 'midTerm',
      title: t('Mid term', 'Jangka menengah'),
      horizon: t('week–month', 'minggu–bulan'),
      weights: t(
        'Trend 25% · Technical 15% · Flow 15% · Fundamental 15% · Bandarmology 20% · News 10%',
        'Tren 25% · Teknikal 15% · Aliran 15% · Fundamental 15% · Bandarmologi 20% · Berita 10%',
      ),
    },
    {
      key: 'longTerm',
      title: t('Long term', 'Jangka panjang'),
      horizon: t('month–year+', 'bulan–tahun+'),
      weights: t(
        'Fundamental 40% · Trend 20% · Technical 10% · News 10% · Bandarmology 10% · Flow 10%',
        'Fundamental 40% · Tren 20% · Teknikal 10% · Berita 10% · Bandarmologi 10% · Aliran 10%',
      ),
    },
  ];
  const STEP_LABELS = [t('Select stock', 'Pilih saham'), t('Select date', 'Pilih tanggal'), t('Your goal', 'Tujuan Anda')];

  // News lookback window the user picks on the date step (1 / 3 / 6 months).
  // The chosen range is passed to the news service; the classified sentiment
  // becomes a full weighted pillar in the composite score (see TIMEFRAME_WEIGHTS
  // in analysis.js).
  const NEWS_WINDOWS = [
    { value: 1, label: t('1 month', '1 bulan') },
    { value: 3, label: t('3 months', '3 bulan') },
    { value: 6, label: t('6 months', '6 bulan') },
  ];

  // stage: 'search' → 'date' → (intent modal) → 'buy' | 'hold' → 'report'
  const [stage, setStage] = useState('search');
  const [uploadOpen, setUploadOpen] = useState(false);
  // Intent flow: picking a date opens the intent modal; choosing an option
  // routes to a tailored menu ('buy' = prospecting, 'hold' = already own it)
  // that collects the remaining inputs before the analysis runs.
  const [intentOpen, setIntentOpen] = useState(false);
  const [intent, setIntent] = useState(null); // 'buy' | 'hold'
  const [entryPrice, setEntryPrice] = useState(''); // holder's average buy price
  const [quantity, setQuantity] = useState(''); // holder's share count

  const [ticker, setTicker] = useState('');
  const [date, setDate] = useState(TODAY);
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
  const [showFullReport, setShowFullReport] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
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
      .catch((err) => {
        console.error('IDX live broker tape failed, using static fallback:', err);
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

  // News sentiment over the user-selected lookback window. Fetched in parallel
  // with chart/fundamentals/bandarmology; the signed `score` nudges the Flow
  // and Trend pillars (see buildAnalysisReport). A failed/disabled fetch
  // degrades gracefully — the score runs without news, this section shows a
  // muted note.
  const [news, setNews] = useState(null);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError, setNewsError] = useState(null);
  const [newsWindow, setNewsWindow] = useState(6);

  const selectedEmiten = findEmiten(ticker);

  // Interruptible presence for the ticker-search suggestion list. `open` is
  // derived from list length, so the popover animates only on empty↔non-empty
  // (open/close) — not on every keystroke while typing, which would replay the
  // enter on each filter. Matches the settings popover + date popup treatment.
  const { mounted: suggestionsMounted, nodeRef: suggestionsRef } = useSpringPresence(
    suggestedTickers.length > 0,
    presets.popoverEnter,
    presets.popoverExit,
  );

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

  // Choosing a date opens the intent modal: do you already own this stock or not?
  const handlePickDate = (value) => {
    setDate(value);
    setUploadOpen(false);
    setIntentOpen(true);
  };

  // Intent chosen → route to the tailored menu where the answer is produced.
  const chooseIntent = (which) => {
    setIntent(which);
    setIntentOpen(false);
    setStage(which); // 'buy' | 'hold'
  };

  // Unrealized P&L for the holder path, computed locally from the average entry
  // price, share count, and the as-of close — never trusted to the AI's math.
  const positionPnl = (() => {
    if (intent !== 'hold') return null;
    const ep = Number(entryPrice);
    const close = analysis?.close;
    if (!ep || !Number.isFinite(ep) || close == null) return null;
    const qty = Number(quantity) || 0;
    const pct = (close - ep) / ep;
    return { pct, amount: (close - ep) * qty, isProfit: close >= ep, entryPrice: ep, quantity: qty };
  })();

  const addBrokerScreenshots = (incoming) => {
    setBrokerScreenshots((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}:${f.size}`));
      return [...prev, ...incoming.filter((f) => !seen.has(`${f.name}:${f.size}`))];
    });
  };

  const removeScreenshot = (index) => {
    setBrokerScreenshots((prev) => prev.filter((_, i) => i !== index));
  };

  const runAnalysis = async (overrides = {}) => {
    const code = (overrides.ticker ?? ticker).trim().toUpperCase();
    const asOfDate = overrides.date ?? date;
    const runIntent = overrides.intent ?? intent;
    if (!code || !asOfDate || loading) return;
    setUploadOpen(false);
    setLoading(true);
    setShowFullReport(false);
    setAnalysis(null);
    setAIAnalysis(null);
    setAIError(null);
    setError(null);
    setBandar(null);
    setNews(null);
    setNewsError(null);
    try {
      const emitenInfo = findEmiten(code);

      // Fetch the chart first — bandarmology needs its as-of session to key the
      // (ticker, date) call. Everything else (fundamentals, bandarmology, news)
      // then runs in parallel so latency is the slowest leg, not the sum.
      const chart = await fetchChart(code, '2y');

      const [fundRes, bandarRes, newsRes] = await Promise.allSettled([
        fetchFundamentals(code),
        (async () => {
          // Bandarmology is read over the trailing WEEK (W-1): the last 5
          // trading sessions on or before the analysis date, aggregated
          // client-side into one combined broker-flow read. Fetching each
          // session separately (rather than trusting an undocumented ranged
          // call) keeps the W-1 label truthful. A failure degrades gracefully:
          // the score falls back to the technical/volume-only flow read.
          const asOfCandles = chart.candles.filter((c) => c.date <= asOfDate);
          const asOfSession = asOfCandles[asOfCandles.length - 1]?.date ?? asOfDate;
          const tradingSessions = asOfCandles.map((c) => c.date);
          try {
            return await fetchBandarmologyRange(code, {
              asOfDate: asOfSession,
              tradingSessions,
              sessionCount: 5,
            });
          } catch (err) {
            console.error('IDX bandarmology range unavailable, falling back to flow without it:', err);
            throw err;
          }
        })(),
        newsService.fetchNewsSentiment(code, emitenInfo?.name, asOfDate, newsWindow, lang),
      ]);

      const fundamentals = fundRes.status === 'fulfilled' ? fundRes.value : null;

      setBandarLoading(true);
      const bandarResult = bandarRes.status === 'fulfilled' ? bandarRes.value : null;
      setBandar(bandarResult);
      setBandarLoading(false);

      setNewsLoading(true);
      const newsResult = newsRes.status === 'fulfilled' ? newsRes.value : null;
      setNews(newsResult);
      if (newsRes.status === 'rejected') {
        setNewsError(newsRes.reason?.message || t('News sentiment unavailable', 'Sentimen berita tidak tersedia'));
      }
      setNewsLoading(false);

      const analysisData = buildAnalysisReport({
        code,
        requestedDate: asOfDate,
        chart,
        fundamentals,
        emitenInfo,
        bandarmology: bandarResult,
        news: newsResult,
      });
      setAnalysis(analysisData);

      // Get AI-enhanced analysis, tailored to the user's intent (buy vs hold).
      // For the holder path, precompute unrealized P&L from the as-of close so
      // the AI reasons over the real position, not its own arithmetic.
      const aiIntent =
        runIntent === 'hold'
          ? (() => {
              const ep = Number(entryPrice);
              const qty = Number(quantity) || 0;
              const close = analysisData.close;
              const pct = ep ? (close - ep) / ep : null;
              return {
                mode: 'hold',
                entryPrice: ep,
                quantity: qty,
                pnl: ep ? { pct, amount: (close - ep) * qty, isProfit: close >= ep } : null,
              };
            })()
          : runIntent === 'buy'
            ? { mode: 'buy' }
            : null;

      setAILoading(true);
      try {
        const aiResult = await claudeAIService.getAIEnhancedAnalysis(code, analysisData, fundamentals, brokerScreenshots, bandarResult, lang, aiIntent);
        setAIAnalysis(aiResult);
      } catch (aiErr) {
        setAIError(aiErr.message || t('Failed to get AI analysis', 'Gagal mendapatkan analisis AI'));
      } finally {
        setAILoading(false);
      }

      setStage('report');
      // The report the user waited through the analysis for has landed — chime.
      // Fires whether the AI enrichment succeeded or degraded; the report is
      // done either way, which is what the trader was waiting on.
      playDing();
    } catch (err) {
      setError(err.message || t('Something went wrong fetching market data.', 'Terjadi kesalahan saat mengambil data pasar.'));
    } finally {
      setLoading(false);
    }
  };

  const startOver = () => {
    setConfirmNew(false);
    setStage('search');
    setUploadOpen(false);
    setIntentOpen(false);
    setIntent(null);
    setEntryPrice('');
    setQuantity('');
    setShowFullReport(false);
    setTicker('');
    setDate('');
    setBrokerScreenshots([]);
    setAnalysis(null);
    setError(null);
    setSuggestedTickers([]);
    setActiveSuggestion(-1);
    setBandar(null);
    setNews(null);
    setNewsError(null);
  };

  // Deep-link from the Live Screening "Full analysis →" button.
  // URL: /analysis?ticker=XXXX&intent=hold&autorun=1
  // The component is always mounted (hidden-panel routing), so we watch
  // location.search to detect when the user navigates here from screening.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const autoTicker = params.get('ticker');
    if (!autoTicker || params.get('autorun') !== '1') return;
    if (loading) return; // don't interrupt an in-progress run

    const normalizedTicker = autoTicker.toUpperCase();
    const wibDate = wibNow().dateStr; // today's WIB trading date
    const autoIntent = params.get('intent') || 'hold';

    // Defer state + analysis kick past the current render (same pattern as
    // AutoScreeningPage's load kick) to avoid set-state-in-effect lint errors
    // and to ensure React has committed before we fire the analysis.
    const id = setTimeout(() => {
      setTicker(normalizedTicker);
      setDate(wibDate);
      setIntent(autoIntent);
      setStage(autoIntent);
      setIntentOpen(false);
      setSuggestedTickers([]);
      setError(null);
      setAnalysis(null);
      setAIAnalysis(null);
      setBandar(null);
      setNews(null);
      setNewsError(null);
      setBrokerScreenshots([]);
      // Pass values as overrides so runAnalysis doesn't read the stale
      // pre-setTimeout closure values for ticker / date / intent.
      runAnalysis({ ticker: normalizedTicker, date: wibDate, intent: autoIntent });
    }, 0);
    return () => clearTimeout(id);
  }, [location.search]); // eslint-disable-line react-hooks/exhaustive-deps

  const sentimentTone =
    analysis?.sentiment === 'Bullish' ? 'pos' : analysis?.sentiment === 'Bearish' ? 'neg' : 'warn';

  const stepperCurrent = stage === 'buy' || stage === 'hold' ? 3 : stage === 'date' ? 2 : 1;

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
                <span className="pointer-events-none absolute left-6 top-1/2 -translate-y-1/2 text-ink-muted">
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
                  aria-controls="ticker-suggestions"
                  aria-activedescendant={
                    activeSuggestion >= 0 ? `ticker-option-${activeSuggestion}` : undefined
                  }
                  aria-autocomplete="list"
                  className="tactile-soft w-full rounded-full border border-line bg-paper py-4 pl-16 pr-6 font-mono text-lg text-ink shadow-lg shadow-ink/5 placeholder:font-sans placeholder:text-ink-muted/70 hover:border-ink-muted/50 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15"
                />
                {suggestionsMounted && suggestedTickers.length > 0 && (
                  <ul
                    ref={suggestionsRef}
                    id="ticker-suggestions"
                    role="listbox"
                    style={{ transformOrigin: 'top center' }}
                    className="surface-glass glass-morph ios-scroll absolute left-0 right-0 z-dropdown mt-2 max-h-72 overflow-y-auto rounded-xl border border-line py-1.5 text-left"
                  >
                    {suggestedTickers.map((s, index) => (
                      <li
                        key={s.code}
                        id={`ticker-option-${index}`}
                        role="option"
                        aria-selected={index === activeSuggestion}
                      >
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => selectStock(s.code)}
                          onMouseEnter={() => setActiveSuggestion(index)}
                          className={`tactile-soft flex w-full items-baseline gap-3 px-4 py-2.5 text-left ${
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
                className="tactile-soft mx-auto mb-6 inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-paper pl-3 pr-4 text-sm transition-colors hover:border-ink-muted/50 hover:-translate-y-px"
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

              <div className="glass-well mt-8">
                <div className="glass-surface rounded-2xl p-6">
                  <DatePicker inline value={date} max={TODAY} onChange={handlePickDate} />
                </div>
              </div>

              <p className="mt-5 text-xs text-ink-muted">
                {t(
                  'Pick a date to choose your goal next.',
                  'Pilih tanggal untuk menentukan tujuan Anda berikutnya.',
                )}
              </p>
            </section>
          )}

          {/* Step 3 — tailored menu by intent: 'buy' (prospecting) or 'hold'
              (already own it). Each menu collects the remaining inputs and runs
              the analysis, surfacing an intent-specific verdict on the report. */}
          {(stage === 'buy' || stage === 'hold') && (
            <section key={stage} className="stage-enter mx-auto mt-9 max-w-md text-center sm:mt-12">
              <button
                type="button"
                onClick={() => {
                  setStage('date');
                  setIntentOpen(true);
                }}
                className="tactile-soft mx-auto mb-6 inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-paper pl-3 pr-4 text-sm transition-colors hover:border-ink-muted/50 hover:-translate-y-px"
              >
                <span className="text-ink-muted">‹ {t('Change goal', 'Ubah tujuan')}</span>
                <span className="font-mono font-semibold">{ticker}</span>
                <span className="hidden text-ink-muted sm:inline">· {date}</span>
              </button>

              <h2 className="font-serif text-3xl font-medium tracking-tight sm:text-4xl">
                {stage === 'buy'
                  ? t('Is it worth buying?', 'Layak dibeli?')
                  : t('Hold or sell?', 'Tahan atau jual?')}
              </h2>
              <p className="mt-3 text-sm text-ink-muted">
                {stage === 'buy'
                  ? t(
                      'The desk will judge whether to buy now, wait, or skip — and at what price.',
                      'Meja riset akan menilai apakah beli sekarang, tunggu, atau lewati — dan di harga berapa.',
                    )
                  : t(
                      'Enter your position so the desk can judge hold vs. sell and the right exit price.',
                      'Masukkan posisi Anda agar meja riset dapat menilai tahan vs. jual dan harga keluar yang tepat.',
                    )}
              </p>

              {/* Holder position inputs — average entry price + share count drive
                  the live P&L and exit-price guidance on the verdict. */}
              {stage === 'hold' && (
                <div className="mt-7 grid gap-4 text-left sm:grid-cols-2">
                  <div>
                    <FieldLabel htmlFor="entry-price">{t('Average buy price (Rp)', 'Harga beli rata-rata (Rp)')}</FieldLabel>
                    <input
                      id="entry-price"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      value={entryPrice}
                      onChange={(e) => setEntryPrice(e.target.value)}
                      placeholder={t('e.g. 4500', 'mis. 4500')}
                      className="w-full rounded-lg border border-line bg-paper px-4 py-3 font-mono text-base text-ink shadow-sm transition-colors placeholder:font-sans placeholder:text-ink-muted hover:border-ink-muted/50 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                  </div>
                  <div>
                    <FieldLabel htmlFor="quantity">{t('Shares held', 'Jumlah saham')}</FieldLabel>
                    <input
                      id="quantity"
                      type="number"
                      inputMode="numeric"
                      min="0"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      placeholder={t('e.g. 1000', 'mis. 1000')}
                      className="w-full rounded-lg border border-line bg-paper px-4 py-3 font-mono text-base text-ink shadow-sm transition-colors placeholder:font-sans placeholder:text-ink-muted hover:border-ink-muted/50 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                  </div>
                </div>
              )}

              {/* News lookback window — how far back the AI web-searches for
                  ticker news. The signed sentiment score is a weighted pillar.
                  Centered to match the rest of the stage (header + actions). */}
              <div className="mt-7">
                <p className="text-sm font-medium">
                  {t('News lookback window', 'Rentang berita')}
                </p>
                <p className="mx-auto mt-1 max-w-sm text-xs text-ink-muted">
                  {t(
                    'The AI web-searches ticker news over this window and classifies it as positive or negative.',
                    'AI menelusuri berita saham dalam rentang ini dan mengklasifikasikannya sebagai positif atau negatif.',
                  )}
                </p>
                <div className="mt-3">
                  <Segmented
                    role="radiogroup"
                    ariaLabel={t('News lookback window', 'Rentang berita')}
                    className="max-w-xs"
                    size="sm"
                    value={newsWindow}
                    onChange={setNewsWindow}
                    options={NEWS_WINDOWS.map((w) => ({ value: w.value, label: w.label }))}
                  />
                </div>
              </div>

              <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
                <PrimaryButton onClick={runAnalysis} loading={loading} disabled={stage === 'hold' && !Number(entryPrice)}>
                  {t('Get the verdict', 'Lihat putusan')}
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
                {stage === 'hold' && !Number(entryPrice)
                  ? t('Enter your average buy price to continue.', 'Masukkan harga beli rata-rata untuk melanjutkan.')
                  : t(
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

      {/* Intent modal — opens right after a date is picked. Two clear options
          route to the matching menu above. */}
      <Modal
        open={intentOpen}
        onClose={() => setIntentOpen(false)}
        title={t('What are you trying to decide?', 'Apa yang ingin Anda putuskan?')}
        description={t(
          `For ${ticker}${date ? ` · ${date}` : ''} — pick the one that fits you.`,
          `Untuk ${ticker}${date ? ` · ${date}` : ''} — pilih yang sesuai dengan Anda.`,
        )}
      >
        <div className="grid gap-3">
          <LiquidGlass
            as="button"
            variant="card"
            type="button"
            onClick={() => chooseIntent('hold')}
            className="group flex items-start gap-4 rounded-xl p-4 text-left hover:-translate-y-px active:translate-y-0 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/20"
          >
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand-strong transition-colors group-hover:bg-brand group-hover:text-on-brand">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13h4l3 7 4-14 3 7h4" />
              </svg>
            </span>
            <span className="min-w-0">
              <span className="block font-serif text-lg font-medium">{t('I already own it', 'Saya sudah memilikinya')}</span>
              <span className="mt-0.5 block text-sm text-ink-muted">
                {t('Should I hold or sell — and at what price?', 'Sebaiknya tahan atau jual — dan di harga berapa?')}
              </span>
            </span>
          </LiquidGlass>

          <LiquidGlass
            as="button"
            variant="card"
            type="button"
            onClick={() => chooseIntent('buy')}
            className="group flex items-start gap-4 rounded-xl p-4 text-left hover:-translate-y-px active:translate-y-0 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/20"
          >
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand-strong transition-colors group-hover:bg-brand group-hover:text-on-brand">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.3-4.3M11 18a7 7 0 100-14 7 7 0 000 14zM11 8v6M8 11h6" />
              </svg>
            </span>
            <span className="min-w-0">
              <span className="block font-serif text-lg font-medium">{t("I don't own it yet", 'Saya belum memilikinya')}</span>
              <span className="mt-0.5 block text-sm text-ink-muted">
                {t('Is this stock worth buying or not?', 'Apakah saham ini layak dibeli atau tidak?')}
              </span>
            </span>
          </LiquidGlass>
        </div>
      </Modal>

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
            <QuietButton onClick={() => setConfirmNew(true)}>{t('New analysis', 'Analisis baru')}</QuietButton>
          </div>

          {/* Intent-tailored verdict — the direct answer to the user's question,
              with the full analytical report expandable beneath it. */}
          {intent && (
            <VerdictCard intent={intent} ai={aiAnalysis} analysis={analysis} positionPnl={positionPnl} />
          )}

          {/* Toggle for the full report. When no intent was chosen (legacy path)
              the report is always shown. */}
          {intent && (
            <button
              type="button"
              onClick={() => setShowFullReport((v) => !v)}
              aria-expanded={showFullReport}
              className="tactile-soft spring-color mt-6 inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-paper px-4 text-sm font-medium text-ink-muted hover:border-ink-muted/60 hover:text-ink"
            >
              <svg
                className={`chev h-4 w-4 ${showFullReport ? 'rotate-180' : ''}`}
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
              </svg>
              {showFullReport
                ? t('Hide full analysis', 'Sembunyikan analisis lengkap')
                : t('View full analysis', 'Lihat analisis lengkap')}
            </button>
          )}

          {/* The full report expands/collapses with the same grid-rows 0fr→1fr
              spring-collpase technique as the other disclosure sections, so the
              body rises/falls into place instead of mounting/unmounting in a
              single frame. When there's no intent (legacy path) it's always open. */}
          <div className={`report-enter details-collapse ${!intent || showFullReport ? 'details-collapse-open' : ''} mt-8`}>
          <div>
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
                    <p className="mt-0 text-xs text-ink-muted font-medium">{t('Short term', 'Jangka pendek')}</p>
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

          {/* News & sentiment — AI web-searches ticker news over the chosen
              lookback window and classifies each finding. The signed score
              folds into the Flow and Trend pillar ratings above. */}
          {news && (
            <Section
              title={t('News & sentiment', 'Berita & sentimen')}
              aside={
                <span className="flex items-center gap-2">
                  {analysis.news?.rating && (
                    <RatingBadge rating={analysis.news.rating} />
                  )}
                  <Pill tone={newsSentimentTone(news.sentiment)} className="font-medium">
                    {news.sentiment === 'positive'
                      ? t('Positive', 'Positif')
                      : news.sentiment === 'negative'
                        ? t('Negative', 'Negatif')
                        : t('Neutral', 'Netral')}
                  </Pill>
                  <Pill tone={confidenceTone(news.confidence)} className="font-medium">
                    {(() => {
                      const c = news.confidence?.toLowerCase();
                      const word =
                        c === 'high'
                          ? t('High', 'Tinggi')
                          : c === 'low'
                            ? t('Low', 'Rendah')
                            : t('Medium', 'Sedang');
                      return t(`${word} confidence`, `Keyakinan ${word}`);
                    })()}
                  </Pill>
                </span>
              }
            >
              <div className="max-w-prose space-y-3">
                {news.summary && (
                  <p className="text-sm leading-relaxed text-ink">{news.summary}</p>
                )}
                {!news.summary && (
                  <p className="text-sm leading-relaxed text-ink-muted">
                    {t(
                      'No material news was found for this ticker over the lookback window.',
                      'Tidak ditemukan berita material untuk saham ini dalam rentang waktu terpilih.',
                    )}
                  </p>
                )}

                <div className="relative grid gap-x-12 pt-1 md:grid-cols-2">
                  <Row
                    label={t('Sentiment score', 'Skor sentimen')}
                    value={`${news.score > 0 ? '+' : ''}${news.score.toFixed(2)}`}
                    tone={news.score > 0 ? 'text-pos' : news.score < 0 ? 'text-neg' : undefined}
                  />
                  {analysis.news?.pillarScore != null && (
                    <Row
                      label={t('Pillar score', 'Skor pilar')}
                      value={`${analysis.news.pillarScore.toFixed(1)} / 9.0`}
                    />
                  )}
                  <Row
                    label={t('Articles found', 'Artikel ditemukan')}
                    value={String(news.articles.length)}
                  />
                  <Row
                    label={t('Lookback window', 'Rentang waktu')}
                    value={`${news.windowMonths} ${news.windowMonths === 1 ? t('month', 'bulan') : t('months', 'bulan')}`}
                  />
                  <Row
                    label={t('As of', 'Per')}
                    value={news.asOf}
                  />
                </div>

                {news.articles.length > 0 && (
                  <ul className="mt-2 space-y-2">
                    {news.articles.map((a, i) => (
                      <li key={i} className="list-item-enter rounded-md border border-line bg-paper/60 px-3 py-2" style={{ '--i': i }}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            {a.url ? (
                              <a
                                href={a.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="spring-color text-sm font-medium leading-snug text-ink hover:text-brand hover:underline"
                              >
                                {a.headline || t('(untitled)', '(tanpa judul)')}
                              </a>
                            ) : (
                              <p className="text-sm font-medium leading-snug text-ink">
                                {a.headline || t('(untitled)', '(tanpa judul)')}
                              </p>
                            )}
                            <p className="mt-0.5 text-xs text-ink-muted">
                              {a.source}
                              {a.date ? ` · ${a.date}` : ''}
                            </p>
                            {a.impact && (
                              <p className="mt-1 text-xs leading-relaxed text-ink-muted">{a.impact}</p>
                            )}
                          </div>
                          <Pill tone={newsSentimentTone(a.sentiment)} className="shrink-0">
                            {a.sentiment === 'positive'
                              ? t('Pos', 'Pos')
                              : a.sentiment === 'negative'
                                ? t('Neg', 'Neg')
                                : t('Neu', 'Net')}
                          </Pill>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                <p className="text-xs text-ink-muted">
                  {t(
                    'Sourced via Claude web search over the lookback window. Classified by the AI as price-positive, price-negative, or neutral; the signed score is a full weighted pillar in the composite rating.',
                    'Diperoleh melalui pencarian web Claude dalam rentang terpilih. Diklasifikasikan AI sebagai positif, negatif, atau netral terhadap harga; skor bertanda menjadi pilar berbobot penuh dalam peringkat komposit.',
                  )}
                </p>
              </div>
            </Section>
          )}
          {newsLoading && (
            <Section title={t('News & sentiment', 'Berita & sentimen')}>
              <div className="flex items-center gap-3">
                <span className="jauhi-scan" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
                <span className="font-mono text-xs text-ink-muted">
                  {t('AI is searching the web for news…', 'AI sedang menelusuri web untuk berita…')}
                </span>
              </div>
            </Section>
          )}
          {newsError && !newsLoading && !news && (
            <Section title={t('News & sentiment', 'Berita & sentimen')}>
              <p className="max-w-prose text-sm text-ink-muted">
                {t(
                  `News sentiment is unavailable (${newsError}). The report above is unaffected and scored from market data alone.`,
                  `Sentimen berita tidak tersedia (${newsError}). Laporan di atas tidak terpengaruh dan dinilai murni dari data pasar.`,
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

                      {/* Per-pillar breakdown — each pillar's letter rating and its
                          signed contribution to this timeframe's 1–10 score.
                          Positive = lifting the rating, negative = dragging it. */}
                      {overall.pillarBreakdown?.length > 0 && (
                        <ul className="mt-3 space-y-1">
                          {overall.pillarBreakdown.map((p) => {
                            const absent = p.delta10 == null;
                            const delta = p.delta10;
                            const tone = absent ? 'text-ink-muted/40' : delta > 0.05 ? 'text-pos' : delta < -0.05 ? 'text-neg' : 'text-ink-muted';
                            const sign = delta > 0 ? '+' : '';
                            return (
                              <li key={p.key} className={`flex items-center justify-between gap-2 text-xs${absent ? ' opacity-40' : ''}`}>
                                <span className="flex min-w-0 items-baseline gap-2">
                                  {absent ? (
                                    <span className="inline-flex h-5 w-7 items-center justify-center rounded text-[10px] font-bold bg-surface-2 text-ink-muted">—</span>
                                  ) : (
                                    <RatingBadge rating={p.rating} />
                                  )}
                                  <span className="truncate text-ink-muted">{p.label}</span>
                                </span>
                                <span className={`shrink-0 font-mono tabular-nums ${tone}`}>
                                  {absent ? '—' : `${sign}${delta.toFixed(2)}`}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      )}
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
                      'Participation is read from on-balance volume and traded value. Broker accumulation/distribution is scored in its own Bandarmology (W-1) pillar.',
                      'Partisipasi dibaca dari on-balance volume dan nilai transaksi. Akumulasi/distribusi broker dinilai pada pilar Bandarmologi (W-1) tersendiri.',
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

              {/* Bandarmology section — read over the trailing week (W-1) */}
              {bandarLoading ? (
                <Section
                  title={t('Bandarmology · broker accumulation · W-1','Bandarmologi · akumulasi broker · W-1')}
                  aside={
                    <span className="flex items-center gap-2">
                      {analysis.bandarmology?.rating && <RatingBadge rating={analysis.bandarmology.rating} />}
                      {bandar ? <IdxBadge date={bandar.date} /> : null}
                    </span>
                  }
                >
                  <div className="flex items-center gap-3">
                    <span className="jauhi-scan" aria-hidden="true">
                      <span />
                      <span />
                      <span />
                    </span>
                    <span className="font-mono text-xs text-ink-muted">{t('Loading weekly bandarmology...', 'Memuat bandarmologi mingguan...')}</span>
                  </div>
                </Section>
              ) : bandar && !bandar.empty ? (
                <Section
                  title={t('Bandarmology · broker accumulation · W-1','Bandarmologi · akumulasi broker · W-1')}
                  aside={
                    <span className="flex items-center gap-2">
                      {analysis.bandarmology?.rating && <RatingBadge rating={analysis.bandarmology.rating} />}
                      <IdxBadge date={bandar.date} />
                    </span>
                  }
                >
                    {/* W-1 range notice — shows how many sessions were aggregated
                        and the inclusive date span of the trailing week. */}
                    {bandar.range && bandar.dateSpan && (
                      <div className="mb-4 flex items-center gap-2 rounded-md border border-info/30 bg-info-tint/40 px-3 py-2">
                        <svg className="h-3.5 w-3.5 shrink-0 text-info" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <rect x="2" y="3" width="12" height="11" rx="1.5" />
                          <path d="M2 6h12M5 1.5v3M11 1.5v3" strokeLinecap="round" />
                        </svg>
                        <p className="text-xs text-info">
                          {t(
                            `Aggregated over ${bandar.sessions} trading session${bandar.sessions === 1 ? '' : 's'} (${bandar.dateSpan.from} → ${bandar.dateSpan.to}).`,
                            `Dikumpulkan dari ${bandar.sessions} sesi transaksi${bandar.sessions === 1 ? '' : 's'} (${bandar.dateSpan.from} → ${bandar.dateSpan.to}).`,
                          )}
                        </p>
                      </div>
                    )}

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
                        <Row label={t('Buyers vs sellers', 'Pembeli vs penjual')} value={`${bandar.totalBuyers ?? '—'} / ${bandar.totalSellers ?? '—'}`} />
                        <Row label={t('Week value', 'Nilai mingguan')} value={formatRpCompact(bandar.sessionValue)} />
                      </div>

                      <p className="text-xs text-ink-muted">
                        {t(
                          'Weekly broker accumulation/distribution (W-1) from the IDX API — scored as its own pillar (net flow conviction, top-5 concentration, foreign direction).',
                          'Akumulasi/distribusi broker mingguan (W-1) dari IDX API — dinilai sebagai pilar tersendiri (keyakinan aliran net, konsentrasi 5 teratas, arah asing).'
                        )}
                      </p>
                    </div>
                  </Section>
              ) : bandar && bandar.empty ? (
                <Section
                  title={t('Bandarmology · broker accumulation · W-1','Bandarmologi · akumulasi broker · W-1')}
                  aside={
                    <span className="flex items-center gap-2">
                      {analysis.bandarmology?.rating && <RatingBadge rating={analysis.bandarmology.rating} />}
                      {bandar ? <IdxBadge date={bandar.date} /> : null}
                    </span>
                  }
                >
                  <p className="max-w-prose text-sm text-ink-muted">
                    {t('No broker-summary data for the trailing week.','Tidak ada data ringkasan broker untuk minggu terakhir.')}
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
          </div>
          </div>
        </article>
      )}

      {/* ===== Confirm new analysis ===== */}
      <Modal
        open={confirmNew}
        onClose={() => setConfirmNew(false)}
        title={t('Start a new analysis?', 'Mulai analisis baru?')}
        description={t(
          'This will clear the current report, uploaded screenshots, and all unsaved data.',
          'Ini akan menghapus laporan saat ini, tangkapan layar yang diunggah, dan semua data yang belum disimpan.',
        )}
      >
        <div className="flex flex-wrap items-center justify-end gap-3">
          <QuietButton onClick={() => setConfirmNew(false)}>{t('Cancel', 'Batal')}</QuietButton>
          <PrimaryButton onClick={startOver}>{t('Start new analysis', 'Mulai analisis baru')}</PrimaryButton>
        </div>
      </Modal>
    </div>
  );
}

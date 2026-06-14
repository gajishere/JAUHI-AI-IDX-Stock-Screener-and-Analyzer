import { useId, useState } from 'react';
import {
  FieldLabel,
  Pill,
  PrimaryButton,
  RatingBadge,
  RatingFigure,
  ReportSkeleton,
  Row,
  Section,
} from './report';
import { fileInputClass, inputClass } from './reportStyles';

const idxTickers = [
  { code: 'BBCA', name: 'Bank Central Asia' },
  { code: 'BBRI', name: 'Bank Rakyat Indonesia' },
  { code: 'BBNI', name: 'Bank Negara Indonesia' },
  { code: 'BMRI', name: 'Bank Mandiri' },
  { code: 'TLKM', name: 'Telkom Indonesia' },
  { code: 'ASII', name: 'Astra International' },
  { code: 'UNVR', name: 'Unilever Indonesia' },
  { code: 'GOTO', name: 'GoTo Gojek Tokopedia' },
  { code: 'ADMR', name: 'Adaro Minerals' },
  { code: 'ANTM', name: 'Antam' },
  { code: 'BRPT', name: 'Barito Pacific' },
  { code: 'CPIN', name: 'Charoen Pokphand Indonesia' },
  { code: 'ICBP', name: 'Indofood CBP Sukses Makmur' },
  { code: 'INDF', name: 'Indofood Sukses Makmur' },
  { code: 'JSMR', name: 'Jasa Marga' },
  { code: 'KLBF', name: 'Kalbe Farma' },
  { code: 'MYOR', name: 'Mayora Indah' },
  { code: 'PGAS', name: 'Perusahaan Gas Negara' },
  { code: 'PTBA', name: 'Bukit Asam' },
  { code: 'PTPP', name: 'Pembangunan Perumahan' },
  { code: 'SMGR', name: 'Semen Indonesia' },
  { code: 'SMRA', name: 'Summarecon Agung' },
  { code: 'TBIG', name: 'Tower Bersama Infrastructure' },
  { code: 'TCID', name: 'Mandom Indonesia' },
  { code: 'TOTL', name: 'Total Bangun Persada' },
  { code: 'UNTR', name: 'United Tractors' },
  { code: 'WIKA', name: 'Wijaya Karya' },
  { code: 'WTON', name: 'Wijaya Karya Beton' },
];

const TIMEFRAMES = [
  {
    key: 'shortTerm',
    title: 'Short term',
    horizon: 'days–week',
    weights: 'Foreign flow 40% · Technical 40% · Broker 20%',
  },
  {
    key: 'midTerm',
    title: 'Mid term',
    horizon: 'week–month',
    weights: 'Foreign flow 30% · Trend 30% · Fundamental 25% · Broker 15%',
  },
  {
    key: 'longTerm',
    title: 'Long term',
    horizon: 'month–year+',
    weights: 'Fundamental 40% · Trend 30% · Foreign flow 20% · Broker 10%',
  },
];

// Signed percentage moves color by direction, not by assumption
function moveTone(value) {
  if (value.startsWith('+')) return 'text-pos';
  if (value.startsWith('-') || value.startsWith('−')) return 'text-neg';
  return undefined;
}

function UploadField({ id, label, file, onChange }) {
  return (
    <div>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <input id={id} type="file" accept="image/*" onChange={onChange} className={fileInputClass} />
      {file && (
        <p className="mt-1.5 text-xs text-pos">
          {file.name} attached
        </p>
      )}
    </div>
  );
}

export default function StockAnalysis() {
  const tickerFieldId = useId();
  const dateFieldId = useId();
  const [ticker, setTicker] = useState('');
  const [date, setDate] = useState('');
  const [foreignBuyScreenshot, setForeignBuyScreenshot] = useState(null);
  const [brokerSummaryScreenshot, setBrokerSummaryScreenshot] = useState(null);
  const [bidOfferData, setBidOfferData] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [suggestedTickers, setSuggestedTickers] = useState([]);

  const [activeSuggestion, setActiveSuggestion] = useState(-1);

  const handleTickerChange = (e) => {
    const value = e.target.value.toUpperCase();
    setTicker(value);
    setActiveSuggestion(-1);
    if (value.length >= 1) {
      const filtered = idxTickers.filter(
        (t) => t.code.startsWith(value) || t.name.toUpperCase().includes(value)
      );
      // An exact match needs no suggestion
      if (filtered.length === 1 && filtered[0].code === value) {
        setSuggestedTickers([]);
      } else {
        setSuggestedTickers(filtered.slice(0, 5));
      }
    } else {
      setSuggestedTickers([]);
    }
  };

  const selectSuggestion = (suggestion) => {
    setTicker(suggestion.code);
    setSuggestedTickers([]);
    setActiveSuggestion(-1);
  };

  const handleTickerKeyDown = (e) => {
    if (suggestedTickers.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveSuggestion((prev) => (prev + 1) % suggestedTickers.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveSuggestion((prev) => (prev <= 0 ? suggestedTickers.length - 1 : prev - 1));
    } else if (e.key === 'Enter' && activeSuggestion >= 0) {
      e.preventDefault();
      selectSuggestion(suggestedTickers[activeSuggestion]);
    } else if (e.key === 'Escape') {
      setSuggestedTickers([]);
      setActiveSuggestion(-1);
    }
  };

  const handleTickerBlur = (e) => {
    // Keep the list open when focus moves into it (click selection)
    if (e.relatedTarget?.closest?.('[role="listbox"]')) return;
    setSuggestedTickers([]);
    setActiveSuggestion(-1);
  };

  const handleFileChange = (setter) => (e) => {
    if (e.target.files[0]) {
      setter(e.target.files[0]);
    }
  };

  const ready = ticker.trim() !== '' && date !== '';

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!ready) return;
    setLoading(true);
    setAnalysis(null);
    // Simulate API call delay
    setTimeout(() => {
      setAnalysis({
        ticker: ticker.toUpperCase(),
        date: date,
        executiveSummary: {
          topValue: { status: 'Yes', ranking: 3 },
          topForeignBuy: { status: 'Yes', ranking: 1 },
          sentiment: 'Bullish',
        },
        foreignFlow: {
          netForeignBuy: 'Rp 85.2M',
          averageForeignFlow: 'Rp 60.0M',
          interpretation: 'Accumulation',
          rating: 'A+',
        },
        brokerAnalysis: {
          majorBrokers: [
            { code: 'YG', name: 'YG Securities', net: 'Rp 25.1M Buy' },
            { code: 'MS', name: 'Morgan Stanley', net: 'Rp 18.3M Buy' },
            { code: 'ZP', name: 'Zifepri Sekuritas', net: 'Rp 12.7M Buy' },
          ],
          buySellRatio: '75%',
          rating: 'A',
        },
        technicalAnalysis: {
          pricePosition: 'Above VWAP',
          distanceToARA: '15%',
          distanceToARB: '30%',
          vwapAnalysis: 'Price consistently above VWAP with strong bullish momentum',
          supportResistance: 'Support: Rp 9,800 | Resistance: Rp 10,500',
          rating: 'A+',
        },
        fundamentalAnalysis: {
          eps: 'Rp 1,250',
          per: '15.2x',
          revenueGrowth: '18% YoY',
          debtToEquity: '0.3x',
          sectorOutlook: 'Positive - strong domestic demand and export recovery',
          rating: 'A',
        },
        trendAnalysis: {
          oneWeek: '+8.5%',
          oneMonth: '+15.2%',
          threeMonths: '+32.7%',
          volumeTrend: 'Increasing',
          rating: 'A',
        },
        overallRatings: {
          shortTerm: { rating: 'A+', score: 8.9, keyDriver: 'Foreign Flow' },
          midTerm: { rating: 'A', score: 8.2, keyDriver: 'Trend' },
          longTerm: { rating: 'A', score: 8.0, keyDriver: 'Fundamental' },
        },
        briefRationale: {
          shortTerm:
            'Strong foreign buying momentum combined with technical breakout above key resistance levels provides excellent short-term trading opportunity.',
          midTerm:
            'Sustained uptrend with improving fundamentals and steady foreign accumulation supports medium-term holding.',
          longTerm:
            'Solid fundamentals with EPS growth above sector average and manageable debt levels make this a good long-term core holding.',
        },
        actionRecommendations: {
          shortTerm: 'Active trading, monitor entry at VWAP/support, target resistance/ARA',
          midTerm: 'Gradual accumulation on dips, hold for 1-3 month target',
          longTerm: 'Core holding, add on weakness, high conviction',
        },
        keyLevels: {
          idealEntry: 'Rp 9,900 – 10,100',
          stopLoss: 'Rp 9,500',
          targetShortTerm: 'Rp 10,800',
          targetMidTerm: 'Rp 11,500',
          targetLongTerm: 'Rp 12,500',
        },
      });
      setLoading(false);
    }, 1500);
  };

  const sentimentTone =
    analysis?.executiveSummary.sentiment === 'Bullish'
      ? 'pos'
      : analysis?.executiveSummary.sentiment === 'Bearish'
        ? 'neg'
        : 'warn';

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor={tickerFieldId}>Ticker symbol</FieldLabel>
            <div className="relative">
              <input
                id={tickerFieldId}
                type="text"
                value={ticker}
                onChange={handleTickerChange}
                onKeyDown={handleTickerKeyDown}
                onBlur={handleTickerBlur}
                className={`${inputClass} font-mono`}
                placeholder="e.g. BBCA"
                role="combobox"
                aria-expanded={suggestedTickers.length > 0}
                aria-controls={`${tickerFieldId}-listbox`}
                aria-activedescendant={
                  activeSuggestion >= 0 ? `${tickerFieldId}-option-${activeSuggestion}` : undefined
                }
                aria-autocomplete="list"
                autoFocus
              />
              {suggestedTickers.length > 0 && (
                <ul
                  id={`${tickerFieldId}-listbox`}
                  role="listbox"
                  className={`absolute left-0 right-0 z-dropdown mt-1.5 max-h-64 overflow-y-auto rounded-md border border-line bg-paper py-1 shadow-lg shadow-ink/5 dropdown-enter`}
                >
                  {suggestedTickers.map((suggestion, index) => (
                    <li
                      key={suggestion.code}
                      id={`${tickerFieldId}-option-${index}`}
                      role="option"
                      aria-selected={index === activeSuggestion}
                      className="list-item-enter"
                      style={{ animationDelay: `${index * 30}ms` }}
                    >
                      <button
                        type="button"
                        tabIndex={-1}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => selectSuggestion(suggestion)}
                        className={`block w-full px-3.5 py-2 text-left transition-[transform,opacity] duration-200 hover:bg-well hover:scale-[1.02] active:scale-[0.95] ${
                          index === activeSuggestion ? 'bg-well' : ''
                        }`}
                      >
                        <span className="font-mono text-sm font-medium">{suggestion.code}</span>
                        <span className="ml-2.5 text-xs text-ink-muted">{suggestion.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div>
            <FieldLabel htmlFor={dateFieldId}>Analysis date</FieldLabel>
            <input
              id={dateFieldId}
              type="date"
              value={date}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setDate(e.target.value)}
              className={`${inputClass} font-mono`}
            />
          </div>
        </div>

        <fieldset className="mt-7">
          <legend className="text-sm font-medium">Optional screenshots</legend>
          <p className="mb-3.5 mt-0.5 text-sm text-ink-muted">
            Attach exchange screenshots to sharpen the analysis.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <UploadField
              id="upload-foreign"
              label="Top foreign buy / value"
              file={foreignBuyScreenshot}
              onChange={handleFileChange(setForeignBuyScreenshot)}
            />
            <UploadField
              id="upload-broker"
              label="Broker summary"
              file={brokerSummaryScreenshot}
              onChange={handleFileChange(setBrokerSummaryScreenshot)}
            />
            <UploadField
              id="upload-bidoffer"
              label="Bid–offer data"
              file={bidOfferData}
              onChange={handleFileChange(setBidOfferData)}
            />
          </div>
        </fieldset>

        <div className="mt-7 flex items-center justify-between gap-4 border-t border-line pt-5">
          <p className="text-sm text-ink-muted">
            {ready ? 'Ready when you are.' : 'Pick a ticker and a date to begin.'}
          </p>
          <PrimaryButton type="submit" disabled={!ready} loading={loading}>
            {loading ? 'Analyzing…' : 'Analyze stock'}
          </PrimaryButton>
        </div>
      </form>

      {loading && <ReportSkeleton />}

      {analysis && (
        <article className="report-enter mt-12">
          {/* Report masthead */}
          <header className="border-b border-line pb-6">
            <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
              <div>
                <p className="font-mono text-xs text-ink-muted">
                  Equity flow note · {analysis.date}
                </p>
                <h2 className="mt-1 font-serif text-5xl font-medium tracking-tight">
                  {analysis.ticker}
                </h2>
                <p className="mt-1 text-sm text-ink-muted">
                  {idxTickers.find((t) => t.code === analysis.ticker)?.name ?? 'IDX-listed equity'}
                </p>
              </div>
              <div className="text-right">
                <RatingFigure rating={analysis.overallRatings.shortTerm.rating} className="text-5xl" />
                <p className="mt-1 text-xs text-ink-muted">Short-term rating</p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              {analysis.executiveSummary.topValue.status === 'Yes' && (
                <Pill tone="brand">Top Value · rank #{analysis.executiveSummary.topValue.ranking}</Pill>
              )}
              {analysis.executiveSummary.topForeignBuy.status === 'Yes' && (
                <Pill tone="brand">
                  Top Foreign Buy · rank #{analysis.executiveSummary.topForeignBuy.ranking}
                </Pill>
              )}
              <Pill tone={sentimentTone}>{analysis.executiveSummary.sentiment}</Pill>
            </div>
          </header>

          <div className="mt-2">
            <Section
              title="Foreign flow"
              aside={<RatingBadge rating={analysis.foreignFlow.rating} />}
            >
              <div className="grid gap-x-12 md:grid-cols-2">
                <Row label="Net foreign buy" value={analysis.foreignFlow.netForeignBuy} tone="text-pos" />
                <Row label="20-day average" value={analysis.foreignFlow.averageForeignFlow} />
                <Row label="Interpretation" value={analysis.foreignFlow.interpretation} />
              </div>
            </Section>

            <Section
              title="Broker positioning"
              aside={<RatingBadge rating={analysis.brokerAnalysis.rating} />}
            >
              <div className="grid gap-x-12 md:grid-cols-2">
                <div>
                  <p className="mb-1 text-sm text-ink-muted">Top buyers</p>
                  {analysis.brokerAnalysis.majorBrokers.map((broker) => (
                    <Row
                      key={broker.code}
                      label={`${broker.code} · ${broker.name}`}
                      value={broker.net}
                      tone="text-pos"
                    />
                  ))}
                </div>
                <div>
                  <p className="mb-1 text-sm text-ink-muted">Balance</p>
                  <Row label="Buy / sell ratio" value={analysis.brokerAnalysis.buySellRatio} />
                </div>
              </div>
            </Section>

            <Section
              title="Technicals"
              aside={<RatingBadge rating={analysis.technicalAnalysis.rating} />}
            >
              <div className="grid gap-x-12 md:grid-cols-2">
                <Row label="Price position" value={analysis.technicalAnalysis.pricePosition} />
                <Row label="Distance to ARA" value={analysis.technicalAnalysis.distanceToARA} />
                <Row label="Distance to ARB" value={analysis.technicalAnalysis.distanceToARB} />
              </div>
              <p className="mt-3 max-w-prose text-sm leading-relaxed text-ink">
                {analysis.technicalAnalysis.vwapAnalysis}.{' '}
                <span className="text-ink-muted">{analysis.technicalAnalysis.supportResistance}</span>
              </p>
            </Section>

            <Section
              title="Fundamentals"
              aside={<RatingBadge rating={analysis.fundamentalAnalysis.rating} />}
            >
              <div className="grid gap-x-12 md:grid-cols-2">
                <Row label="Earnings per share" value={analysis.fundamentalAnalysis.eps} />
                <Row label="Price / earnings" value={analysis.fundamentalAnalysis.per} />
                <Row label="Revenue growth" value={analysis.fundamentalAnalysis.revenueGrowth} tone="text-pos" />
                <Row label="Debt to equity" value={analysis.fundamentalAnalysis.debtToEquity} />
              </div>
              <p className="mt-3 max-w-prose text-sm leading-relaxed text-ink-muted">
                Sector outlook: <span className="text-ink">{analysis.fundamentalAnalysis.sectorOutlook}</span>
              </p>
            </Section>

            <Section title="Trend" aside={<RatingBadge rating={analysis.trendAnalysis.rating} />}>
              <div className="grid gap-x-12 md:grid-cols-2">
                <Row label="1-week move" value={analysis.trendAnalysis.oneWeek} tone={moveTone(analysis.trendAnalysis.oneWeek)} />
                <Row label="1-month move" value={analysis.trendAnalysis.oneMonth} tone={moveTone(analysis.trendAnalysis.oneMonth)} />
                <Row label="3-month move" value={analysis.trendAnalysis.threeMonths} tone={moveTone(analysis.trendAnalysis.threeMonths)} />
                <Row label="Volume trend" value={analysis.trendAnalysis.volumeTrend} />
              </div>
            </Section>

            <Section title="Rating by timeframe">
              <div className="grid gap-6 md:grid-cols-3 md:gap-0 md:divide-x md:divide-line">
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

            <Section title="Rationale">
              <div className="max-w-prose space-y-3">
                {TIMEFRAMES.map((frame) => (
                  <p key={frame.key} className="text-sm leading-relaxed">
                    <span className="font-medium">{frame.title}.</span>{' '}
                    <span className="text-ink-muted">{analysis.briefRationale[frame.key]}</span>
                  </p>
                ))}
              </div>
            </Section>

            <Section title="Action plan">
              <div className="max-w-prose space-y-3">
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

            <Section title="Key levels">
              <div className="grid gap-x-12 md:grid-cols-2">
                <Row label="Ideal entry" value={analysis.keyLevels.idealEntry} />
                <Row label="Stop loss" value={analysis.keyLevels.stopLoss} tone="text-neg" />
                <Row label="Target — short term" value={analysis.keyLevels.targetShortTerm} tone="text-pos" />
                <Row label="Target — mid term" value={analysis.keyLevels.targetMidTerm} tone="text-pos" />
                <Row label="Target — long term" value={analysis.keyLevels.targetLongTerm} tone="text-pos" />
              </div>
            </Section>
          </div>
        </article>
      )}
    </div>
  );
}

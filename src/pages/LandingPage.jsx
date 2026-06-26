// Landing page — the website's front door (route '/').
//
// A Cosmoq-style marketing surface adapted to this desk: a full-bleed cosmic
// hero with the glowing CTA, a live IDX market strip, a scrolling ticker tape of
// recognizable names, three engine cards, and a closing call to action. It reuses
// the Cosmoq pass already in the app — the global starfield/aurora backdrop, the
// `.glow-ring` CTA, Inter `.display` headings, and `useScrollReveal` — so it adds
// almost no new visual primitives, just composition. The actual tools live one
// click away (/auto-screening, /analysis, /screening).

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../lib/i18n';
import { useScrollReveal } from '../lib/useScrollReveal';
import { marketStatus, wibNow, nextScanSlot } from '../lib/marketHours';
import BackgroundPaths from '../components/BackgroundPaths';

// Market-phase presentation — mirrors AutoScreeningPage's PHASE map so the live
// strip here reads identically to the one on the screener it links to.
const PHASE = {
  'pre-market': { tone: 'warn', live: false, en: 'Pre-market', id: 'Pra-pembukaan' },
  'session-1': { tone: 'pos', live: true, en: 'Session 1 open', id: 'Sesi 1 buka' },
  'lunch-break': { tone: 'muted', live: false, en: 'Lunch break', id: 'Istirahat siang' },
  'session-2': { tone: 'pos', live: true, en: 'Session 2 open', id: 'Sesi 2 buka' },
  closed: { tone: 'muted', live: false, en: 'Market closed', id: 'Pasar tutup' },
};

function fmtCountdown(mins) {
  if (mins == null || mins < 0) return '—';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

// Recognizable IDX names for the ticker tape — a curated blue-chip + popular set,
// not the full universe (the caption makes the "whole universe" claim). Listed
// once; the marquee renders the list twice for a seamless loop.
const TAPE = [
  'BBCA', 'BBRI', 'BMRI', 'TLKM', 'ASII', 'BBNI', 'UNVR', 'ICBP',
  'GOTO', 'ANTM', 'ADRO', 'MDKA', 'AMRT', 'KLBF', 'INDF', 'PGAS',
  'BRPT', 'CPIN', 'UNTR', 'EXCL',
];

// ---- Hero ----
function Hero() {
  const t = useT();
  return (
    <section className="full-bleed relative -mt-10 overflow-hidden sm:-mt-16">
      {/* Flowing background paths — the woven line field behind the hero. */}
      <BackgroundPaths />
      {/* decorative orb glow over the paths — brand green + signal blue, soft */}
      <div
        aria-hidden="true"
        className="glow-orb pointer-events-none absolute left-1/2 top-[-10%] h-[28rem] w-[28rem] -translate-x-1/2 rounded-full opacity-70 motion-reduce:opacity-50 sm:h-[42rem] sm:w-[42rem]"
        style={{
          background:
            'radial-gradient(closest-side, color-mix(in srgb, var(--c-brand) 22%, transparent), color-mix(in srgb, var(--c-info) 12%, transparent) 55%, transparent 72%)',
        }}
      />
      <div className="relative z-10 mx-auto max-w-3xl px-5 pb-20 pt-20 text-center sm:px-6 sm:pb-28 sm:pt-28">
        <p className="hero-rise font-mono text-[11px] uppercase tracking-[0.2em] text-brand-strong" style={{ '--i': 0 }}>
          {t('the reading-room terminal', 'terminal ruang baca')}
        </p>
        <h1
          className="hero-rise display-xl mt-5 font-serif text-4xl font-medium [text-wrap:balance] sm:text-6xl"
          style={{ '--i': 1 }}
        >
          {t('The Indonesia Stock Exchange, read like a research desk.', 'Bursa Efek Indonesia, dibaca seperti meja riset.')}
        </h1>
        <p
          className="hero-rise mx-auto mt-6 max-w-xl text-base leading-relaxed text-ink-muted sm:text-lg"
          style={{ '--i': 2 }}
        >
          {t(
            'Live momentum screening, a locked A+ to C− analysis engine, and a top-down screening framework — one quiet terminal wired straight to the IDX tape.',
            'Penyaringan momentum langsung, mesin analisis terkunci A+ hingga C−, dan kerangka penyaringan top-down — satu terminal tenang yang terhubung langsung ke tape IDX.',
          )}
        </p>
        <div className="hero-rise mt-9 flex flex-wrap items-center justify-center gap-3" style={{ '--i': 3 }}>
          <Link
            to="/auto-screening"
            className="glow-ring glass-accent tactile-deep inline-flex min-h-12 items-center gap-2 rounded-full px-7 py-3 text-sm font-semibold hover:-translate-y-px active:translate-y-0"
          >
            {t('Open Live Screening', 'Buka Penyaringan Langsung')}
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
          <Link
            to="/analysis"
            className="glass-quiet tactile-soft inline-flex min-h-12 items-center gap-2 rounded-full px-7 py-3 text-sm font-medium text-ink-muted hover:-translate-y-px hover:text-ink active:translate-y-0"
          >
            {t('Analyze a stock', 'Analisis saham')}
          </Link>
        </div>
      </div>
    </section>
  );
}

// ---- Live market strip ----
function LiveStrip() {
  const t = useT();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const phase = PHASE[marketStatus(now)] ?? PHASE.closed;
  const wib = wibNow(now);
  const next = nextScanSlot(now);
  const dotClass = phase.tone === 'pos' ? 'bg-pos' : phase.tone === 'warn' ? 'bg-warn' : 'bg-ink-muted/60';

  return (
    <div className="glass-surface mx-auto -mt-6 flex max-w-2xl flex-wrap items-center justify-center gap-x-8 gap-y-3 rounded-2xl px-6 py-4">
      <div className="flex items-center gap-2.5">
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          {phase.live && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-pos/60 motion-reduce:hidden" />
          )}
          <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${dotClass}`} />
        </span>
        <span className="font-serif text-base font-medium">{t(phase.en, phase.id)}</span>
      </div>
      <div className="flex items-center gap-6 font-mono text-sm tabular-nums text-ink-muted">
        <span>
          {wib.hm} <span className="text-xs">WIB</span>
        </span>
        <span className="border-l border-line pl-6">
          {t('Next scan', 'Pemindaian')} <span className="text-ink">{next.slot}</span>
          <span className="text-xs"> · {fmtCountdown(next.minutesUntil)}</span>
        </span>
      </div>
    </div>
  );
}

// ---- Ticker marquee ----
function TickerMarquee() {
  const t = useT();
  const list = [...TAPE, ...TAPE]; // doubled for a seamless -50% loop
  return (
    <section className="full-bleed mt-16 border-y border-line/70 py-6">
      <p className="mb-4 text-center font-mono text-[11px] uppercase tracking-[0.16em] text-ink-muted">
        {t('Reads the entire IDX universe — 900+ tickers', 'Membaca seluruh alam semesta IDX — 900+ emiten')}
      </p>
      <div className="marquee">
        <div className="marquee-track gap-8 pr-8">
          {list.map((tk, i) => (
            <span key={i} className="font-mono text-sm font-semibold tracking-wide text-ink-muted/80">
              {tk}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---- Feature card ----
function FeatureCard({ icon, title, blurb, to, cta }) {
  const revealRef = useScrollReveal();
  return (
    <article ref={revealRef} className="glass-card glass-lift rounded-2xl p-6">
      <Link to={to} className="block">
        <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-tint text-brand-strong">
          {icon}
        </span>
        <h3 className="display font-serif text-xl font-medium tracking-tight">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">{blurb}</p>
        <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-strong">
          {cta}
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </span>
      </Link>
    </article>
  );
}

const RadarIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.07 4.93A10 10 0 1 0 22 12M12 12l5-3" />
    <circle cx="12" cy="12" r="2.2" />
  </svg>
);
const GradeIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 19V5M4 19h16M8 16l3-4 3 2 4-6" />
  </svg>
);
const FunnelIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 5h18l-7 8v6l-4-2v-4z" />
  </svg>
);

// ---- Engine cards section ----
function Engines() {
  const t = useT();
  const revealRef = useScrollReveal();
  return (
    <section className="landing-engines mt-20">
      <div ref={revealRef} className="text-center">
        <h2 className="display font-serif text-2xl font-medium tracking-tight [text-wrap:balance] sm:text-3xl">
          {t('Three engines, one desk', 'Tiga mesin, satu meja')}
        </h2>
        <p className="mx-auto mt-2 max-w-prose text-sm text-ink-muted">
          {t(
            'Each reads the same live tape, for a different question.',
            'Masing-masing membaca tape langsung yang sama, untuk pertanyaan berbeda.',
          )}
        </p>
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <FeatureCard
          to="/auto-screening"
          icon={<RadarIcon />}
          title={t('Live Auto-Screening', 'Penyaringan Otomatis')}
          blurb={t(
            'Momentum movers and breakouts, rescanned every 15 minutes with a live ATR trading plan on each name.',
            'Penggerak momentum & breakout, dipindai ulang tiap 15 menit dengan rencana trading ATR langsung di tiap saham.',
          )}
          cta={t('Open the screener', 'Buka penyaring')}
        />
        <FeatureCard
          to="/analysis"
          icon={<GradeIcon />}
          title={t('Stock Analysis', 'Analisis Saham')}
          blurb={t(
            'A locked A+ to C− scoring engine reads one ticker end to end — the verdict first, the full report below.',
            'Mesin skor terkunci A+ hingga C− membaca satu emiten dari ujung ke ujung — vonis dulu, laporan lengkap di bawah.',
          )}
          cta={t('Analyze a ticker', 'Analisis emiten')}
        />
        <FeatureCard
          to="/screening"
          icon={<FunnelIcon />}
          title={t('Stock Screening', 'Penyaringan Saham')}
          blurb={t(
            '“Framework My Bro”: a top-down macro screen with three hard restrictions — only names that survive all three surface.',
            '“Framework My Bro”: penyaringan makro top-down dengan tiga batasan ketat — hanya yang lolos ketiganya yang muncul.',
          )}
          cta={t('Run a screen', 'Jalankan penyaringan')}
        />
      </div>
    </section>
  );
}

// ---- Closing CTA ----
function ClosingCTA() {
  const t = useT();
  const revealRef = useScrollReveal();
  return (
    <section className="full-bleed relative mt-24 overflow-hidden py-20">
      <div
        aria-hidden="true"
        className="glow-orb pointer-events-none absolute left-1/2 top-1/2 -z-0 h-[20rem] w-[38rem] max-w-[140vw] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-60 sm:h-[30rem] sm:w-[60rem]"
        style={{
          background:
            'radial-gradient(closest-side, color-mix(in srgb, var(--c-brand) 20%, transparent), color-mix(in srgb, var(--c-info) 10%, transparent) 55%, transparent 74%)',
        }}
      />
      <div ref={revealRef} className="relative mx-auto max-w-xl px-5 text-center sm:px-6">
        <h2 className="display-xl font-serif text-3xl font-medium [text-wrap:balance] sm:text-5xl">
          {t('Start reading the tape.', 'Mulai membaca tape.')}
        </h2>
        <p className="mx-auto mt-4 max-w-md text-sm text-ink-muted sm:text-base">
          {t(
            'The live screener is already running. No account, no setup — just the IDX, read clearly.',
            'Penyaring langsung sudah berjalan. Tanpa akun, tanpa setup — cukup IDX, dibaca dengan jernih.',
          )}
        </p>
        <Link
          to="/auto-screening"
          className="glow-ring glass-accent tactile-deep mt-8 inline-flex min-h-12 items-center gap-2 rounded-full px-8 py-3 text-sm font-semibold hover:-translate-y-px active:translate-y-0"
        >
          {t('Open Live Screening', 'Buka Penyaringan Langsung')}
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </Link>
      </div>
    </section>
  );
}

// ---- LandingPage ----
export default function LandingPage() {
  return (
    // `.landing-root` lets index.css apply `content-visibility: auto` to the
    // below-fold sections (marquee / engines / closing CTA): the browser skips
    // rendering, layout and paint for them until they scroll into view, so the
    // heavy first paint pays only for the hero. The first child (Hero) is left
    // alone so LCP paints immediately.
    <div className="landing-root flex flex-col">
      <Hero />
      <LiveStrip />
      <TickerMarquee />
      <Engines />
      <ClosingCTA />
    </div>
  );
}

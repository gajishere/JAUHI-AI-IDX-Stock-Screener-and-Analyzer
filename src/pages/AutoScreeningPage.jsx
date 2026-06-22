// Live Auto-Screening — the website's landing page.
//
// Reads the latest server-side momentum snapshot (written by the fixed-time cron
// scan, /api/auto-screen-latest) and renders the top 5 movers as rank-railed
// rows, fronted by a live WIB market-status bar + next-scan countdown. It only
// READS the shared snapshot — the scan itself runs server-side — so every
// visitor sees the same fresh list, including the 08:00 pre-market one.
//
// Speaks the same Reading Room vocabulary as the rest of the desk: serif
// numerals, mono tickers, dotted rows, one green. Glass stays on chrome only
// (the refresh button); the content is opaque per DESIGN.md.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../lib/i18n';
import { useSound } from '../lib/sound';
import { Pill, RatingFigure } from '../components/report';
import { formatPct } from '../lib/analysis';
import { marketStatus, nextScanSlot, wibNow } from '../lib/marketHours';

// The server cron regenerates the snapshot every 15 minutes, so polling faster
// only refetches an unchanged Blob. Match the cron cadence; the on-focus refetch
// below still pulls a fresh scan immediately whenever the user returns to the tab.
const POLL_MS = 15 * 60_000;
const formatRp = (v) => (v == null ? '—' : `Rp ${Math.round(v).toLocaleString('id-ID')}`);
const signedPct = (p) => (p == null ? '—' : `${p > 0 ? '+' : ''}${p.toFixed(2)}%`);

// ---- market-phase + scan-type presentation ----
const PHASE = {
  'pre-market': { tone: 'warn', live: false, en: 'Pre-market', id: 'Pra-pembukaan' },
  'session-1': { tone: 'pos', live: true, en: 'Session 1 open', id: 'Sesi 1 buka' },
  'lunch-break': { tone: 'muted', live: false, en: 'Lunch break', id: 'Istirahat siang' },
  'session-2': { tone: 'pos', live: true, en: 'Session 2 open', id: 'Sesi 2 buka' },
  closed: { tone: 'muted', live: false, en: 'Market closed', id: 'Pasar tutup' },
};

function scanTypeLabel(t, type) {
  switch (type) {
    case 'pre-market':
      return t('Pre-market scan', 'Pemindaian pra-pembukaan');
    case 'pre-close':
      return t('Pre-close — to hold overnight', 'Jelang penutupan — untuk ditahan');
    case 'intraday':
      return t('Live intraday scan', 'Pemindaian intraday langsung');
    default:
      return t('Manual scan', 'Pemindaian manual');
  }
}

const accTone = (a) =>
  a == null ? 'muted' : /big acc|^acc/i.test(a) ? 'pos' : /dist/i.test(a) ? 'neg' : 'warn';

function fmtCountdown(mins) {
  if (mins == null || mins < 0) return '—';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

// ---- live market-status bar (ticks every second off the WIB clock) ----
//
// One phase pill leads (the trader's first question: is the tape live?), with
// the WIB clock and next-scan countdown as two supporting readouts. The whole
// bar reads as a single research-desk status line, not three equal blocks.
function StatusBar({ snapshot }) {
  const t = useT();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const phaseKey = marketStatus(now);
  const phase = PHASE[phaseKey] ?? PHASE.closed;
  const wib = wibNow(now);
  const next = nextScanSlot(now);
  const dotClass =
    phase.tone === 'pos' ? 'bg-pos' : phase.tone === 'warn' ? 'bg-warn' : 'bg-ink-muted/60';

  return (
    <div className="glass-surface rounded-2xl p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-5">
        {/* phase — the lead readout */}
        <div className="flex items-center gap-3">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            {phase.live && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-pos/60 motion-reduce:hidden" />
            )}
            <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${dotClass}`} />
          </span>
          <div>
            <p className="font-mono text-[11px] leading-tight text-brand-strong">
              {t('idx market', 'pasar idx')}
            </p>
            <p className="font-serif text-lg font-medium leading-tight">{t(phase.en, phase.id)}</p>
          </div>
        </div>

        {/* supporting readouts — clock + next-scan. Grouped so they wrap as a
            unit: on a phone they stack under the phase (never stranding the
            countdown alone); from sm: up they sit beside the phase, divided by
            the dotted leader. */}
        <div className="flex flex-col gap-3 sm:ml-auto sm:flex-row sm:items-center sm:gap-8">
          {/* WIB clock */}
          <div className="text-right sm:text-left">
            <p className="font-mono text-[11px] uppercase tracking-wide text-ink-muted">{t('Jakarta time', 'Waktu Jakarta')}</p>
            <p className="font-mono text-lg tabular-nums">
              {wib.hm} <span className="text-xs text-ink-muted">WIB</span>
            </p>
          </div>

          {/* next scan countdown — separated by a dotted leader from sm: up */}
          <div className="relative text-right before:absolute before:-left-4 before:top-1/2 before:hidden before:h-5 before:w-px before:-translate-y-1/2 before:bg-line sm:before:block">
            <p className="font-mono text-[11px] uppercase tracking-wide text-ink-muted">{t('Next scan', 'Pemindaian berikutnya')}</p>
            <p className="font-mono text-lg tabular-nums">
              {next.slot} <span className="text-xs text-ink-muted">· {fmtCountdown(next.minutesUntil)}</span>
            </p>
          </div>
        </div>
      </div>

      {/* last-updated strip */}
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-3 text-xs text-ink-muted">
        {snapshot?.generatedAt ? (
          <>
            <Pill tone={snapshot.scanType === 'pre-close' ? 'brand' : 'info'}>
              {scanTypeLabel(t, snapshot.scanType)}
            </Pill>
            <span className="font-mono tabular-nums">
              {t('Updated', 'Diperbarui')}{' '}
              {new Date(snapshot.generatedAt).toLocaleString('id-ID', {
                hour: '2-digit',
                minute: '2-digit',
                day: '2-digit',
                month: 'short',
                timeZone: 'Asia/Jakarta',
              })}{' '}
              WIB
            </span>
          </>
        ) : (
          <span>{t('Awaiting the first scan of the session.', 'Menunggu pemindaian pertama sesi ini.')}</span>
        )}
      </div>
    </div>
  );
}

// ---- one candidate, as a rank-railed row ----
//
// The whole row is the link to the deep analysis (Linear/Stripe affordance): a
// ranked list of 5 should be one navigable unit per pick, not a tiny "Full
// analysis →" afterthought. Inside, the LIVE quote is the hero figure of the
// card — this is a *live* screening surface — with today's change as its
// verdict-toned qualifier; momentum score + rating sit in the rail-side header;
// the thesis line closes the row so it reads like an authored research note.
function CandidateCard({ c, rank, index }) {
  const t = useT();
  const s = c.signals ?? {};
  const bandar = c.bandarmology;
  const liveUp = c.live?.changePct != null && c.live.changePct > 0;
  const liveDown = c.live?.changePct != null && c.live.changePct < 0;
  const changeTone = liveUp ? 'text-pos' : liveDown ? 'text-neg' : 'text-ink-muted';
  const href = `/analysis?ticker=${encodeURIComponent(c.ticker)}&intent=buy&autorun=1`;

  return (
    <article
      className="result-row-enter glass-card glass-lift overflow-hidden rounded-2xl motion-reduce:translate-y-0 motion-reduce:transition-none"
      style={{ '--i': Math.min(index, 9) }}
    >
      <Link to={href} className="tactile-soft group flex outline-none focus-visible:outline-none">
        {/* rank rail */}
        <div className="flex w-12 shrink-0 flex-col items-center justify-center border-r border-line bg-white/10 py-5 backdrop-blur-sm dark:bg-white/5 sm:w-16">
          <span className="font-serif text-2xl font-medium leading-none text-ink sm:text-3xl">{rank}</span>
        </div>

        <div className="min-w-0 flex-1 p-5">
          {/* head: ticker / name + score */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-base font-semibold tracking-tight text-ink">{c.ticker}</span>
                {c.board === 'Pemantauan Khusus' && (
                  <span className="shrink-0 text-[10px] uppercase tracking-wide text-warn">{t('monitored', 'pemantauan')}</span>
                )}
              </div>
              <p className="mt-0.5 truncate text-xs text-ink-muted" title={c.name}>
                {c.name}
                {c.capTier && <span> · {c.capTier}</span>}
                {c.sector && <span> · {c.sector}</span>}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <div className="flex items-baseline justify-end gap-1.5">
                <span className="font-mono text-xl font-semibold tabular-nums">
                  {c.composite != null ? c.composite.toFixed(1) : '—'}
                </span>
                <RatingFigure rating={c.overallRating} className="text-base" />
              </div>
              <p className="font-mono text-[11px] uppercase tracking-wide text-ink-muted">{t('momentum', 'momentum')}</p>
            </div>
          </div>

          {/* live quote — the hero figure on a live screening surface */}
          <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="font-mono text-lg tabular-nums text-ink sm:text-xl">{formatRp(c.live?.last ?? c.close)}</span>
            {c.live?.changePct != null && (
              <span className={`font-mono text-sm tabular-nums ${changeTone}`}>
                {signedPct(c.live.changePct)}
                <span className="ml-1 text-ink-muted">{t('today', 'hari ini')}</span>
              </span>
            )}
            {c.oneMonth != null && (
              <span className={`font-mono text-sm tabular-nums ${c.oneMonth > 0 ? 'text-pos' : c.oneMonth < 0 ? 'text-neg' : 'text-ink-muted'}`}>
                {formatPct(c.oneMonth)}
                <span className="ml-1 text-ink-muted">· 1M</span>
              </span>
            )}
          </div>

          {/* signal chips */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {s.goldenTrend && <Pill tone="pos">{t('Golden cross', 'Golden cross')}</Pill>}
            {s.rsi14 != null && <Pill tone="info">RSI {Math.round(s.rsi14)}</Pill>}
            {s.volumeRatio != null && (
              <Pill tone={s.volumeRatio >= 1.5 ? 'pos' : 'muted'}>{`${s.volumeRatio.toFixed(2)}× ${t('vol', 'vol')}`}</Pill>
            )}
            {c.velocityOk && <Pill tone="brand">{t('Active tape', 'Tape aktif')}</Pill>}
            {bandar?.accdist && <Pill tone={accTone(bandar.accdist)}>{`Bandar · ${bandar.accdist}`}</Pill>}
          </div>

          {/* thesis line — the "why this pick", reading like a research note */}
          <div className="mt-3 flex items-end justify-between gap-3 border-t border-line pt-3">
            <p className="min-w-0 text-xs leading-relaxed text-ink-muted">{c.reason}</p>
            <span className="shrink-0 whitespace-nowrap text-xs font-medium text-brand-strong transition-transform duration-200 [transition-timing-function:var(--ease-out-quart)] group-hover:translate-x-0.5 motion-reduce:translate-x-0 motion-reduce:transition-none">
              {t('Full analysis', 'Analisis lengkap')} <span aria-hidden="true">→</span>
            </span>
          </div>
        </div>
      </Link>
    </article>
  );
}

// ---- empty / scanning / error notice ----
function StateNotice({ kind }) {
  const t = useT();
  const scanning = kind === 'scanning' || kind === 'no-snapshot';
  return (
    <div className="glass-surface rounded-2xl px-6 py-12 text-center">
      {scanning ? (
        <>
          <span className="jauhi-scan mx-auto mb-4" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <p className="font-serif text-lg font-medium">{t('Running the first scan…', 'Menjalankan pemindaian pertama…')}</p>
          <p className="mt-1 text-sm text-ink-muted">
            {t('Fresh momentum picks land here shortly.', 'Pilihan momentum terbaru akan muncul sebentar lagi.')}
          </p>
        </>
      ) : (
        <>
          <p className="font-serif text-lg font-medium">{t('No picks available right now.', 'Belum ada pilihan saat ini.')}</p>
          <p className="mt-1 text-sm text-ink-muted">
            {t('The next scheduled scan will refresh this list.', 'Pemindaian terjadwal berikutnya akan menyegarkan daftar ini.')}
          </p>
        </>
      )}
    </div>
  );
}

export default function AutoScreeningPage() {
  const t = useT();
  const { playDing } = useSound();
  const [snapshot, setSnapshot] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | scanning | empty | error
  const [refreshing, setRefreshing] = useState(false);
  const abortRef = useRef(null);
  // The last scan timestamp we chimed for. The page polls every 15 min + on focus,
  // so without this guard the chime would fire on every poll of the same list.
  // We only ding when a genuinely fresh scan lands (generatedAt changed).
  const lastAnnouncedAt = useRef(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setRefreshing(true);
    try {
      const res = await fetch('/api/auto-screen-latest', { signal: ctrl.signal, cache: 'no-store' });
      const data = await res.json();
      if (data?.status === 'scanning' || data?.status === 'no-snapshot') {
        setStatus('scanning');
        setSnapshot(null);
      } else if (Array.isArray(data?.candidates) && data.candidates.length > 0) {
        setSnapshot(data);
        setStatus('ready');
        // Chime only on a genuinely new scan — not on a repeat poll of the same
        // snapshot. The first ready result is announced too (lastAnnouncedAt
        // starts null), so a manual Refresh that returns the current list still
        // dings; subsequent polls of that same list stay silent.
        if (data.generatedAt && data.generatedAt !== lastAnnouncedAt.current) {
          lastAnnouncedAt.current = data.generatedAt;
          playDing();
        }
      } else {
        setSnapshot(data?.generatedAt ? data : null);
        setStatus('empty');
      }
    } catch (e) {
      if (e.name !== 'AbortError') setStatus((s) => (s === 'loading' ? 'error' : s));
    } finally {
      setRefreshing(false);
    }
  }, [playDing]);

  useEffect(() => {
    // Defer the first fetch a tick so we don't setState synchronously in the
    // effect body; then poll on an interval and on window refocus.
    const kick = setTimeout(load, 0);
    const id = setInterval(load, POLL_MS);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => {
      clearTimeout(kick);
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
      abortRef.current?.abort();
    };
  }, [load]);

  const candidates = snapshot?.candidates ?? [];
  const marketClosed = marketStatus(new Date()) === 'closed';

  return (
    <div className="flex flex-col">
      {/* masthead */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] tracking-[0.14em] text-brand-strong">
            {t('auto-screening · momentum desk', 'penyaringan otomatis · meja momentum')}
          </p>
          <h2 className="mt-1.5 font-serif text-2xl font-medium tracking-tight sm:text-3xl">
            {t('Today’s 5 movers', '5 penggerak hari ini')}
          </h2>
          <p className="mt-1.5 max-w-prose text-sm text-ink-muted">
            {t(
              'Rescanned on the hour while the market is open — strongest momentum & breakout names on live IDX data.',
              'Dipindai tiap jam selama pasar buka — nama momentum & breakout terkuat dari data IDX langsung.',
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={refreshing}
          className="glass-quiet tactile-soft inline-flex min-h-11 items-center gap-2 px-4 py-2.5 text-sm font-medium text-ink-muted hover:-translate-y-px hover:text-ink active:translate-y-0 disabled:opacity-50"
        >
          <svg
            className={`h-4 w-4 ${refreshing ? 'animate-spin motion-reduce:animate-none' : ''}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 12a8 8 0 0114-5.3L20 8m0 0V4m0 4h-4m4 4a8 8 0 01-14 5.3L4 16m0 0v4m0-4h4" />
          </svg>
          {t('Refresh', 'Segarkan')}
        </button>
      </div>

      <div className="mt-5">
        <StatusBar snapshot={snapshot} />
      </div>

      {/* market-closed banner */}
      {marketClosed && status === 'ready' && (
        <div className="mt-4 rounded-xl border border-line bg-well/50 px-4 py-3 text-sm text-ink-muted">
          {t(
            'Market is closed — showing the last session’s pre-close list (your overnight watchlist).',
            'Pasar tutup — menampilkan daftar jelang penutupan sesi terakhir (watchlist semalam Anda).',
          )}
        </div>
      )}

      {/* picks */}
      <div className="mt-9">
        {status === 'loading' && (
          <div className="space-y-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-28 rounded-2xl" />
            ))}
          </div>
        )}
        {(status === 'scanning' || status === 'empty' || status === 'error') && <StateNotice kind={status} />}
        {status === 'ready' && (
          <div className="space-y-4">
            {candidates.map((c, i) => (
              <CandidateCard key={c.ticker} c={c} rank={i + 1} index={i} />
            ))}
          </div>
        )}
      </div>

      {/* funnel + disclaimer */}
      {snapshot?.summary && status === 'ready' && (
        <p className="mt-6 font-mono text-[11px] leading-relaxed text-ink-muted">{snapshot.summary}</p>
      )}
      <p className="mt-3 text-xs text-ink-muted">
        {t(
          'Momentum screening on live data — not investment advice. Scans run 08:00–15:30 WIB on trading days.',
          'Penyaringan momentum dari data langsung — bukan nasihat investasi. Pemindaian berjalan 08:00–15:30 WIB pada hari bursa.',
        )}
      </p>
    </div>
  );
}

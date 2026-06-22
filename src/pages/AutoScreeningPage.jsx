// Live Auto-Screening — the website's landing page.
//
// Reads the latest server-side momentum snapshot and renders the top 5 movers
// as rank-railed cards, each expandable into a full live trading plan
// (ATR-based entry / stop / T1 / T2 bar, R:R, RVOL, today's turnover).

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../lib/i18n';
import { useSound } from '../lib/sound';
import { Pill, RatingFigure } from '../components/report';
import { formatPct } from '../lib/analysis';
import { marketStatus, nextScanSlot, wibNow } from '../lib/marketHours';

const POLL_MS = 15 * 60_000;

// ---- formatters ----
const formatRp = (v) => (v == null ? '—' : `Rp ${Math.round(v).toLocaleString('id-ID')}`);
const signedPct = (p) => (p == null ? '—' : `${p > 0 ? '+' : ''}${p.toFixed(2)}%`);

// Compact IDR for large values (turnover, market cap)
const fmtMilliar = (v) => {
  if (v == null || !Number.isFinite(v) || v === 0) return '—';
  if (v >= 1e12) return `Rp ${(v / 1e12).toFixed(1)} T`;
  if (v >= 1e9) return `Rp ${(v / 1e9).toFixed(v >= 10e9 ? 0 : 1)} M`;
  if (v >= 1e6) return `Rp ${(v / 1e6).toFixed(0)} jt`;
  return `Rp ${Math.round(v).toLocaleString('id-ID')}`;
};

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
    case 'pre-market': return t('Pre-market scan', 'Pemindaian pra-pembukaan');
    case 'pre-close':  return t('Pre-close — to hold overnight', 'Jelang penutupan — untuk ditahan');
    case 'intraday':   return t('Live intraday scan', 'Pemindaian intraday langsung');
    default:           return t('Manual scan', 'Pemindaian manual');
  }
}

function planHorizon(t, type) {
  switch (type) {
    case 'pre-market': return t('Swing / Day', 'Swing / Harian');
    case 'pre-close':  return t('Hold overnight', 'Tahan semalam');
    case 'intraday':   return t('Intraday – Swing', 'Intraday – Swing');
    default:           return t('Swing', 'Swing');
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

// ---- StatusBar ----
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

        <div className="flex flex-col gap-3 sm:ml-auto sm:flex-row sm:items-center sm:gap-8">
          <div className="text-right sm:text-left">
            <p className="font-mono text-[11px] uppercase tracking-wide text-ink-muted">{t('Jakarta time', 'Waktu Jakarta')}</p>
            <p className="font-mono text-lg tabular-nums">
              {wib.hm} <span className="text-xs text-ink-muted">WIB</span>
            </p>
          </div>
          <div className="relative text-right before:absolute before:-left-4 before:top-1/2 before:hidden before:h-5 before:w-px before:-translate-y-1/2 before:bg-line sm:before:block">
            <p className="font-mono text-[11px] uppercase tracking-wide text-ink-muted">{t('Next scan', 'Pemindaian berikutnya')}</p>
            <p className="font-mono text-lg tabular-nums">
              {next.slot} <span className="text-xs text-ink-muted">· {fmtCountdown(next.minutesUntil)}</span>
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-3 text-xs text-ink-muted">
        {snapshot?.generatedAt ? (
          <>
            <Pill tone={snapshot.scanType === 'pre-close' ? 'brand' : 'info'}>
              {scanTypeLabel(t, snapshot.scanType)}
            </Pill>
            <span className="font-mono tabular-nums">
              {t('Updated', 'Diperbarui')}{' '}
              {new Date(snapshot.generatedAt).toLocaleString('id-ID', {
                hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short',
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

// ---- TradingPlanPanel ----
// Visual ATR-based entry / stop / target bar + stats row.
function TradingPlanPanel({ plan, live, rvol, lastValueTraded, scanType }) {
  const t = useT();
  if (!plan) return null;

  const livePrice = live?.last ?? null;
  const { entry, stop, t1, t2, rr, atr14Pct } = plan;

  // Proportional bar: stop=left edge, t2=right edge.
  const lo = stop * 0.993;
  const hi = t2 * 1.007;
  const span = hi - lo;
  const pos = (v) => Math.max(0, Math.min(100, ((v - lo) / span) * 100));

  const stopPos  = pos(stop);
  const entryPos = pos(entry);
  const t1Pos    = pos(t1);
  const t2Pos    = pos(t2);
  const livePos  = livePrice != null ? pos(livePrice) : null;

  const upFromEntry = (v) => entry > 0 ? ((v - entry) / entry * 100) : 0;
  const dnFromEntry = (v) => entry > 0 ? ((entry - v) / entry * 100) : 0;

  const rvolClass = rvol >= 5 ? 'text-pos' : rvol >= 3 ? 'text-brand-strong' : 'text-ink-muted';

  // Rough position size assuming 2% portfolio risk
  const riskPct = entry > stop ? (entry - stop) / entry : null;
  const posSizePct = riskPct ? Math.min(30, Math.round((0.02 / riskPct) * 100)) : null;

  return (
    <div className="px-5 pb-5 pt-1">
      {/* Bar + labels — mt-8 gives the upward-protruding dot markers (9px) breathing room */}
      <div className="relative mt-8">
        {/* Track */}
        <div className="relative h-[5px] w-full overflow-hidden rounded-full" style={{ background: 'var(--c-line)' }}>
          {/* Stop → Entry: danger zone */}
          <div
            className="absolute top-0 h-full"
            style={{
              left: `${stopPos}%`,
              width: `${Math.max(0, entryPos - stopPos)}%`,
              background: 'color-mix(in srgb, var(--c-neg) 45%, transparent)',
            }}
          />
          {/* Entry → T1: first target zone */}
          <div
            className="absolute top-0 h-full"
            style={{
              left: `${entryPos}%`,
              width: `${Math.max(0, t1Pos - entryPos)}%`,
              background: 'color-mix(in srgb, var(--c-brand) 35%, transparent)',
            }}
          />
          {/* T1 → T2: extended zone */}
          <div
            className="absolute top-0 h-full"
            style={{
              left: `${t1Pos}%`,
              width: `${Math.max(0, t2Pos - t1Pos)}%`,
              background: 'color-mix(in srgb, var(--c-pos) 45%, transparent)',
            }}
          />
        </div>

        {/* Dot markers (positioned with translateX centering, clamped) */}
        {/* STOP */}
        <div
          className="absolute -top-[7px]"
          style={{ left: `clamp(6px, ${stopPos}%, calc(100% - 6px))`, transform: 'translateX(-50%)' }}
        >
          <div className="h-3.5 w-3.5 rounded-full border-2"
            style={{ background: 'var(--c-neg)', borderColor: 'var(--c-paper)' }} />
        </div>
        {/* ENTRY */}
        <div
          className="absolute -top-[9px]"
          style={{ left: `clamp(8px, ${entryPos}%, calc(100% - 8px))`, transform: 'translateX(-50%)' }}
        >
          <div className="h-[18px] w-[18px] rounded-full border-2"
            style={{ background: 'var(--c-brand)', borderColor: 'var(--c-paper)' }} />
        </div>
        {/* LIVE price dot (dashed ring, if meaningfully different from entry) */}
        {livePos != null && Math.abs(livePos - entryPos) > 2 && (
          <div
            className="absolute -top-[7px] animate-pulse motion-reduce:animate-none"
            style={{ left: `clamp(6px, ${livePos}%, calc(100% - 6px))`, transform: 'translateX(-50%)' }}
          >
            <div className="h-3.5 w-3.5 rounded-full border-2 border-dashed"
              style={{ borderColor: 'var(--c-brand-strong)', background: 'transparent' }} />
          </div>
        )}
        {/* T1 */}
        <div
          className="absolute -top-[7px]"
          style={{ left: `clamp(6px, ${t1Pos}%, calc(100% - 6px))`, transform: 'translateX(-50%)' }}
        >
          <div className="h-3.5 w-3.5 rounded-full border-2"
            style={{ background: 'var(--c-pos)', borderColor: 'var(--c-paper)' }} />
        </div>
        {/* T2 */}
        <div
          className="absolute -top-[7px]"
          style={{ left: `clamp(6px, ${t2Pos}%, calc(100% - 6px))`, transform: 'translateX(-50%)' }}
        >
          <div className="h-3.5 w-3.5 rounded-full border-2"
            style={{ background: 'transparent', borderColor: 'var(--c-pos)' }} />
        </div>
      </div>

      {/* Price labels: 2-col on mobile (STOP|ENTRY then T1|T2), 4-col on sm+ */}
      <div className="mt-5 grid grid-cols-2 gap-x-3 gap-y-4 text-center sm:grid-cols-4 sm:gap-x-2 sm:gap-y-0">
        {/* STOP */}
        <div className="flex flex-col items-center">
          <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--c-neg)' }}>
            {t('STOP', 'CUT LOSS')}
          </span>
          <span className="mt-0.5 font-mono text-xs font-semibold tabular-nums" style={{ color: 'var(--c-neg)' }}>
            {formatRp(stop)}
          </span>
          <span className="font-mono text-[9px] tabular-nums" style={{ color: 'color-mix(in srgb, var(--c-neg) 70%, transparent)' }}>
            −{dnFromEntry(stop).toFixed(1)}%
          </span>
        </div>

        {/* ENTRY */}
        <div className="flex flex-col items-center">
          <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
            {t('ENTRY', 'MASUK')}
          </span>
          <span className="mt-0.5 font-mono text-xs font-semibold tabular-nums text-ink">
            {formatRp(entry)}
          </span>
          {livePrice && livePrice !== entry ? (
            <span className="font-mono text-[9px] tabular-nums" style={{ color: 'var(--c-brand-strong)' }}>
              live {formatRp(livePrice)}
            </span>
          ) : (
            <span className="font-mono text-[9px] text-ink-muted">{t('ref', 'ref')}</span>
          )}
        </div>

        {/* T1 */}
        <div className="flex flex-col items-center">
          <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--c-pos)' }}>
            T1
          </span>
          <span className="mt-0.5 font-mono text-xs font-semibold tabular-nums" style={{ color: 'var(--c-pos)' }}>
            {formatRp(t1)}
          </span>
          <span className="font-mono text-[9px] tabular-nums" style={{ color: 'color-mix(in srgb, var(--c-pos) 70%, transparent)' }}>
            +{upFromEntry(t1).toFixed(1)}%
          </span>
        </div>

        {/* T2 */}
        <div className="flex flex-col items-center">
          <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--c-pos)' }}>
            T2
          </span>
          <span className="mt-0.5 font-mono text-xs font-semibold tabular-nums" style={{ color: 'var(--c-pos)' }}>
            {formatRp(t2)}
          </span>
          <span className="font-mono text-[9px] tabular-nums" style={{ color: 'color-mix(in srgb, var(--c-pos) 70%, transparent)' }}>
            +{upFromEntry(t2).toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Stats row */}
      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-line pt-3">
        {rr != null && (
          <span className="font-mono text-[11px]">
            <span className="text-ink-muted">{t('R:R', 'R:R')} </span>
            <span className="font-semibold text-brand-strong">{rr.toFixed(1)}×</span>
          </span>
        )}
        {rvol != null && rvol > 0 && (
          <span className={`font-mono text-[11px] ${rvolClass}`}>
            <span className="text-ink-muted">RVOL </span>
            <span className="font-semibold">{rvol.toFixed(1)}×</span>
          </span>
        )}
        {lastValueTraded > 0 && (
          <span className="font-mono text-[11px]">
            <span className="text-ink-muted">{t('Vol', 'Vol')} </span>
            <span className="font-semibold text-ink">{fmtMilliar(lastValueTraded)}</span>
          </span>
        )}
        {atr14Pct > 0 && (
          <span className="font-mono text-[11px]">
            <span className="text-ink-muted">ATR </span>
            <span className="font-semibold text-ink">{(atr14Pct * 100).toFixed(1)}%</span>
          </span>
        )}
        {posSizePct != null && (
          <span className="font-mono text-[11px] text-ink-muted">
            {t('Pos', 'Pos')} <span className="font-semibold text-ink">~{posSizePct}%</span>{' '}
            <span className="text-[9px]">{t('(2% risk)', '(risiko 2%)')}</span>
          </span>
        )}
        <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.12em] text-ink-muted">
          {planHorizon(t, scanType)}
        </span>
      </div>

      {/* Disclaimer */}
      <p className="mt-3 font-mono text-[9px] leading-relaxed text-ink-muted">
        {t(
          'ATR-based plan from last close. Not investment advice — adjust for live price.',
          'Rencana berbasis ATR dari harga penutupan terakhir. Bukan nasihat investasi — sesuaikan dengan harga live.',
        )}
      </p>
    </div>
  );
}

// ---- CandidateCard ----
function CandidateCard({ c, rank, index, planExpanded, onTogglePlan, scanType }) {
  const t = useT();
  const s = c.signals ?? {};
  const bandar = c.bandarmology;
  const plan = c.plan ?? null;
  const liveUp   = c.live?.changePct != null && c.live.changePct > 0;
  const liveDown = c.live?.changePct != null && c.live.changePct < 0;
  const changeTone = liveUp ? 'text-pos' : liveDown ? 'text-neg' : 'text-ink-muted';
  const href = `/analysis?ticker=${encodeURIComponent(c.ticker)}&intent=buy&autorun=1`;

  const rvolTone = c.rvol >= 5 ? 'pos' : c.rvol >= 3 ? 'brand' : 'info';

  return (
    <article
      className="result-row-enter glass-card glass-lift overflow-hidden rounded-2xl motion-reduce:translate-y-0 motion-reduce:transition-none"
      style={{ '--i': Math.min(index, 9) }}
    >
      {/* Top section — the whole row is the deep-analysis link */}
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

          {/* live quote */}
          <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="font-mono text-lg tabular-nums text-ink sm:text-xl">
              {formatRp(c.live?.last ?? c.close)}
            </span>
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

          {/* signal chips — golden cross / RSI / RVOL / vol / bandar */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {s.goldenTrend && <Pill tone="pos">{t('Golden cross', 'Golden cross')}</Pill>}
            {s.rsi14 != null && <Pill tone="info">RSI {Math.round(s.rsi14)}</Pill>}
            {c.rvol != null && c.rvol > 0 && (
              <Pill tone={rvolTone}>RVOL {c.rvol.toFixed(1)}×</Pill>
            )}
            {c.lastValueTraded > 0 && (
              <Pill tone="muted">Vol {fmtMilliar(c.lastValueTraded)}</Pill>
            )}
            {c.velocityOk && <Pill tone="brand">{t('Active tape', 'Tape aktif')}</Pill>}
            {bandar?.accdist && <Pill tone={accTone(bandar.accdist)}>{`Bandar · ${bandar.accdist}`}</Pill>}
          </div>

          {/* thesis + deep-analysis link */}
          <div className="mt-3 flex items-end justify-between gap-3 border-t border-line pt-3">
            <p className="min-w-0 text-xs leading-relaxed text-ink-muted">{c.reason}</p>
            <span className="shrink-0 whitespace-nowrap text-xs font-medium text-brand-strong transition-transform duration-200 [transition-timing-function:var(--ease-out-quart)] group-hover:translate-x-0.5 motion-reduce:translate-x-0 motion-reduce:transition-none">
              {t('Full analysis', 'Analisis lengkap')} <span aria-hidden="true">→</span>
            </span>
          </div>
        </div>
      </Link>

      {/* Trading plan toggle + panel — outside the Link so click doesn't navigate */}
      {plan && (
        <div className="border-t border-line">
          <button
            type="button"
            onClick={() => onTogglePlan(c.ticker)}
            aria-expanded={planExpanded}
            className="flex w-full items-center justify-between px-5 py-3 text-left transition-colors duration-150 hover:bg-brand-tint/30 active:bg-brand-tint/50 dark:hover:bg-brand-tint/10"
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-strong">
                {t('Trading Plan', 'Rencana Trading')}
              </span>
              {/* R:R shows on all screen sizes when collapsed */}
              {!planExpanded && plan.rr != null && (
                <span className="font-mono text-[11px] text-ink-muted">
                  R:R <span className="font-semibold text-ink">{plan.rr.toFixed(1)}×</span>
                </span>
              )}
              {/* Entry / CL / T1 only on sm+ */}
              {!planExpanded && (
                <>
                  <span className="hidden font-mono text-[11px] text-ink-muted sm:inline">
                    {t('Entry', 'Masuk')} <span className="font-semibold text-ink">{formatRp(plan.entry)}</span>
                  </span>
                  <span className="hidden font-mono text-[11px] text-ink-muted sm:inline">
                    CL <span className="font-semibold" style={{ color: 'var(--c-neg)' }}>{formatRp(plan.stop)}</span>
                  </span>
                  <span className="hidden font-mono text-[11px] text-ink-muted sm:inline">
                    T1 <span className="font-semibold" style={{ color: 'var(--c-pos)' }}>{formatRp(plan.t1)}</span>
                  </span>
                </>
              )}
            </div>
            <span
              className="ml-3 shrink-0 font-mono text-[13px] text-ink-muted transition-transform duration-200 motion-reduce:transition-none"
              style={{ transform: planExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
              aria-hidden="true"
            >
              ▾
            </span>
          </button>

          {planExpanded && (
            <TradingPlanPanel
              plan={plan}
              live={c.live}
              rvol={c.rvol}
              lastValueTraded={c.lastValueTraded}
              scanType={scanType}
            />
          )}
        </div>
      )}
    </article>
  );
}

// ---- StateNotice ----
function StateNotice({ kind }) {
  const t = useT();
  const scanning = kind === 'scanning' || kind === 'no-snapshot';
  return (
    <div className="glass-surface rounded-2xl px-6 py-12 text-center">
      {scanning ? (
        <>
          <span className="jauhi-scan mx-auto mb-4" aria-hidden="true">
            <span /><span /><span />
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

// ---- AutoScreeningPage ----
export default function AutoScreeningPage() {
  const t = useT();
  const { playDing } = useSound();
  const [snapshot, setSnapshot] = useState(null);
  const [status, setStatus] = useState('loading');
  const [refreshing, setRefreshing] = useState(false);
  const [expandedPlan, setExpandedPlan] = useState(null);
  const abortRef = useRef(null);
  const lastAnnouncedAt = useRef(null);

  const togglePlan = (ticker) =>
    setExpandedPlan((cur) => (cur === ticker ? null : ticker));

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
          <h2 className="mt-1.5 font-serif text-2xl font-medium tracking-tight [text-wrap:balance] sm:text-3xl">
            {t("Today’s 5 movers", '5 penggerak hari ini')}
          </h2>
          <p className="mt-1.5 max-w-prose text-sm text-ink-muted">
            {t(
              'Rescanned every 15 min while the market is open — strongest momentum & breakout names with live ATR-based trading plan.',
              'Dipindai tiap 15 menit selama pasar buka — momentum & breakout terkuat dengan rencana trading ATR berbasis data langsung.',
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
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 12a8 8 0 0114-5.3L20 8m0 0V4m0 4h-4m4 4a8 8 0 01-14 5.3L4 16m0 0v4m0-4h4" />
          </svg>
          {t('Refresh', 'Segarkan')}
        </button>
      </div>

      <div className="mt-8">
        <StatusBar snapshot={snapshot} />
      </div>

      {marketClosed && status === 'ready' && (
        <div className="mt-4 rounded-xl border border-line bg-well/50 px-4 py-3 text-sm text-ink-muted">
          {t(
            "Market is closed — showing the last session's pre-close list (your overnight watchlist).",
            'Pasar tutup — menampilkan daftar jelang penutupan sesi terakhir (watchlist semalam Anda).',
          )}
        </div>
      )}

      {/* picks */}
      <div className="mt-9">
        {status === 'loading' && (
          <div className="space-y-5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-40 rounded-2xl" />
            ))}
          </div>
        )}
        {(status === 'scanning' || status === 'empty' || status === 'error') && <StateNotice kind={status} />}
        {status === 'ready' && (
          <div className="space-y-5">
            {candidates.map((c, i) => (
              <CandidateCard
                key={c.ticker}
                c={c}
                rank={i + 1}
                index={i}
                planExpanded={expandedPlan === c.ticker}
                onTogglePlan={togglePlan}
                scanType={snapshot?.scanType}
              />
            ))}
          </div>
        )}
      </div>

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

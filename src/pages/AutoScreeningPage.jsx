// Live Auto-Screening — the website's landing page.
//
// Redesigned to read like the rest of the desk: a quiet reading-room list, not a
// wall of frosted tiles. Candidates and discounts are opaque dotted-leader rows
// inside a single raised panel; signals are inline mono figures, not stacked
// chips; color appears only as a verdict. Liquid glass is concentrated into ONE
// deliberate moment — the floating market strip — per the glass-on-chrome-only
// rule. Each row expands into an on-brand dotted-leader trading plan.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../lib/i18n';
import { useSound } from '../lib/sound';
import { Row, RatingFigure } from '../components/report';
import { marketStatus, nextScanSlot, wibNow } from '../lib/marketHours';
import { useFlashOnChange } from '../lib/useFlashOnChange';

const POLL_MS = 15 * 60_000;

// ---- formatters ----
const formatRp = (v) => (v == null ? '—' : `Rp ${Math.round(v).toLocaleString('id-ID')}`);
const signedPct = (p) => (p == null ? '—' : `${p > 0 ? '+' : ''}${p.toFixed(2)}%`);

// Compact IDR for large values (turnover, market cap).
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
    case 'pre-close':  return t('Pre-close list', 'Daftar jelang penutupan');
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
  a == null ? 'text-ink-muted' : /big acc|^acc/i.test(a) ? 'text-pos' : /dist/i.test(a) ? 'text-neg' : 'text-warn';

function fmtCountdown(mins) {
  if (mins == null || mins < 0) return '—';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

// ---- MarketStrip ----
// The page's single liquid-glass surface: floating chrome reporting market phase,
// Jakarta time, and the next scan. Everything else on the page stays opaque.
function MarketStrip({ snapshot }) {
  const t = useT();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const phase = PHASE[marketStatus(now)] ?? PHASE.closed;
  const wib = wibNow(now);
  const next = nextScanSlot(now);
  const dotClass =
    phase.tone === 'pos' ? 'bg-pos' : phase.tone === 'warn' ? 'bg-warn' : 'bg-ink-muted/60';

  return (
    <div className="glass-surface rounded-2xl px-5 py-4 sm:px-6 sm:py-5">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
        <div className="flex items-center gap-3">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            {phase.live && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-pos/60 motion-reduce:hidden" />
            )}
            <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${dotClass}`} />
          </span>
          <div>
            <p className="font-mono text-[11px] leading-tight text-ink-muted">{t('idx market', 'pasar idx')}</p>
            <p className="font-serif text-lg font-medium leading-tight">{t(phase.en, phase.id)}</p>
          </div>
        </div>

        <div className="flex items-center gap-6 font-mono tabular-nums sm:ml-auto">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-ink-muted">{t('Jakarta', 'Jakarta')}</p>
            <p className="text-base leading-tight">
              {wib.hm} <span className="text-xs text-ink-muted">WIB</span>
            </p>
          </div>
          <div className="border-l border-line pl-6">
            <p className="text-[11px] uppercase tracking-wide text-ink-muted">{t('Next scan', 'Pemindaian berikutnya')}</p>
            <p className="text-base leading-tight">
              {next.slot} <span className="text-xs text-ink-muted">· {fmtCountdown(next.minutesUntil)}</span>
            </p>
          </div>
        </div>
      </div>

      {snapshot?.generatedAt && (
        <p className="mt-3 border-t border-line/70 pt-2.5 font-mono text-[11px] text-ink-muted">
          {scanTypeLabel(t, snapshot.scanType)} · {t('updated', 'diperbarui')}{' '}
          {new Date(snapshot.generatedAt).toLocaleString('id-ID', {
            hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short',
            timeZone: 'Asia/Jakarta',
          })}{' '}
          WIB
        </p>
      )}
    </div>
  );
}

// ---- PlanRows ----
// The trading plan as the report's typographic spine: a slim level track for
// orientation, then dotted-leader Rows (Entry / Cut loss / Targets), a compact
// stat line, and a one-line caveat. Shared by movers and discounts.
function PlanRows({ plan, live, rvol, lastValueTraded, scanType, kind }) {
  const t = useT();
  const { entry, stop, t1, t2, rr, atr14Pct } = plan;

  const lo = stop * 0.997;
  const hi = t2 * 1.003;
  const span = hi - lo || 1;
  const pos = (v) => Math.max(0, Math.min(100, ((v - lo) / span) * 100));
  const livePrice = live?.last ?? null;
  const up = (v) => (entry > 0 ? ((v - entry) / entry) * 100 : 0);
  const dn = (v) => (entry > 0 ? ((entry - v) / entry) * 100 : 0);
  const riskPct = entry > stop ? (entry - stop) / entry : null;
  const posSize = riskPct ? Math.min(30, Math.round((0.02 / riskPct) * 100)) : null;
  const livePos = livePrice != null ? pos(livePrice) : null;

  const stat = (label, value) => (
    <span>
      {label} <span className="font-semibold text-ink">{value}</span>
    </span>
  );

  return (
    <div className="mt-3 rounded-xl bg-well/60 px-4 py-3.5">
      {/* slim level track — quiet orientation, no protruding markers */}
      <div aria-hidden="true" className="relative mb-3.5 h-1 w-full overflow-hidden rounded-full bg-line">
        <div className="absolute top-0 h-full" style={{ left: `${pos(stop)}%`, width: `${Math.max(0, pos(entry) - pos(stop))}%`, background: 'color-mix(in srgb, var(--c-neg) 32%, transparent)' }} />
        <div className="absolute top-0 h-full" style={{ left: `${pos(entry)}%`, width: `${Math.max(0, pos(t1) - pos(entry))}%`, background: 'color-mix(in srgb, var(--c-brand) 28%, transparent)' }} />
        <div className="absolute top-0 h-full" style={{ left: `${pos(t1)}%`, width: `${Math.max(0, pos(t2) - pos(t1))}%`, background: 'color-mix(in srgb, var(--c-pos) 32%, transparent)' }} />
        {livePos != null && Math.abs(livePos - pos(entry)) > 2 && (
          <div className="absolute top-0 h-full w-px bg-brand-strong" style={{ left: `clamp(0px, ${livePos}%, calc(100% - 1px))` }} />
        )}
      </div>

      <Row label={t('Entry', 'Masuk')} value={livePrice && livePrice !== entry ? (<>{formatRp(entry)} <span className="text-ink-muted">· live {formatRp(livePrice)}</span></>) : formatRp(entry)} />
      <Row label={t('Cut loss', 'Cut loss')} tone="text-neg" value={<>{formatRp(stop)} <span className="text-ink-muted">−{dn(stop).toFixed(1)}%</span></>} />
      <Row label={t('Target 1', 'Target 1')} tone="text-pos" value={<>{formatRp(t1)} <span className="text-ink-muted">+{up(t1).toFixed(1)}%</span></>} />
      <Row label={t('Target 2', 'Target 2')} tone="text-pos" value={<>{formatRp(t2)} <span className="text-ink-muted">+{up(t2).toFixed(1)}%</span></>} />

      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-2.5 font-mono text-[11px] text-ink-muted">
        {rr != null && stat('R:R', `${rr.toFixed(1)}×`)}
        {rvol != null && rvol > 0 && stat('RVOL', `${rvol.toFixed(1)}×`)}
        {lastValueTraded > 0 && stat(t('Turnover', 'Nilai'), fmtMilliar(lastValueTraded))}
        {atr14Pct > 0 && stat('ATR', `${(atr14Pct * 100).toFixed(1)}%`)}
        {posSize != null && stat(t('Size', 'Posisi'), `~${posSize}%`)}
        <span className="ml-auto uppercase tracking-wide">{planHorizon(t, scanType)}</span>
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">
        {kind === 'discount'
          ? t(
              'Target reverts to MA50. Counter-trend — size down. Not investment advice.',
              'Target kembali ke MA50. Lawan arah — perkecil posisi. Bukan nasihat investasi.',
            )
          : t(
              'ATR plan from last close. Not investment advice — adjust to live price.',
              'Rencana ATR dari penutupan terakhir. Bukan nasihat investasi — sesuaikan dengan harga live.',
            )}
      </p>
    </div>
  );
}

// ---- PlanDisclosure ----
// The slim toggle + the expanded PlanRows. Sits inside a row, below its link.
function PlanDisclosure({ id, label, plan, live, rvol, lastValueTraded, scanType, kind, expanded, onToggle }) {
  const t = useT();
  if (!plan) return null;
  return (
    <div className="mt-3 border-t border-line pt-1">
      <button
        type="button"
        onClick={() => onToggle(id)}
        aria-expanded={expanded}
        className="tactile-soft flex w-full items-center justify-between gap-3 rounded-lg py-2.5 text-left"
      >
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-strong">{label}</span>
          {!expanded && plan.rr != null && (
            <span className="font-mono text-[11px] text-ink-muted">
              R:R <span className="font-semibold text-ink">{plan.rr.toFixed(1)}×</span>
            </span>
          )}
          {!expanded && (
            <>
              <span className="hidden font-mono text-[11px] text-ink-muted sm:inline">
                {t('Entry', 'Masuk')} <span className="font-semibold text-ink">{formatRp(plan.entry)}</span>
              </span>
              <span className="hidden font-mono text-[11px] text-ink-muted sm:inline">
                CL <span className="font-semibold text-neg">{formatRp(plan.stop)}</span>
              </span>
            </>
          )}
        </span>
        <span
          className="chev shrink-0 font-mono text-[13px] text-ink-muted motion-reduce:transition-none"
          style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
          aria-hidden="true"
        >
          ▾
        </span>
      </button>
      {expanded && (
        <PlanRows plan={plan} live={live} rvol={rvol} lastValueTraded={lastValueTraded} scanType={scanType} kind={kind} />
      )}
    </div>
  );
}

// A small right-chevron that nudges on row hover — the "opens full analysis" cue.
function RowArrow() {
  return (
    <svg
      className="chev spring-color h-4 w-4 shrink-0 self-center text-ink-muted/45 group-hover:translate-x-0.5 group-hover:text-ink-muted motion-reduce:transition-none"
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
    </svg>
  );
}

// ---- MoverRow (momentum A/B) ----
function MoverRow({ c, rank, index, planExpanded, onTogglePlan, scanType }) {
  const t = useT();
  const s = c.signals ?? {};
  const bandar = c.bandarmology;
  const liveUp = c.live?.changePct != null && c.live.changePct > 0;
  const liveDown = c.live?.changePct != null && c.live.changePct < 0;
  const changeTone = liveUp ? 'text-pos' : liveDown ? 'text-neg' : 'text-ink-muted';
  const href = `/analysis?ticker=${encodeURIComponent(c.ticker)}&intent=buy&autorun=1`;

  // Flash the live price + change% when a poll refresh moves them — a live list
  // reads as moving, not as a frozen row snapping forward. No count-up (would
  // misrepresent a real mid-poll price); the tint conveys direction only.
  const priceRef = useFlashOnChange(c.live?.last ?? c.close);
  const changeRef = useFlashOnChange(c.live?.changePct);

  // Signal as one quiet inline line — numbers are the content, not chips.
  const signals = [];
  if (s.rsi14 != null) signals.push(`RSI ${Math.round(s.rsi14)}`);
  if (c.rvol != null && c.rvol > 0) signals.push(`vol ${c.rvol.toFixed(1)}×`);
  if (s.goldenTrend) signals.push(t('uptrend', 'uptrend'));
  if (c.lastValueTraded > 0) signals.push(fmtMilliar(c.lastValueTraded));

  return (
    <li className="result-row-enter px-4 py-4 sm:px-5" style={{ '--i': Math.min(index, 9) }}>
      <Link to={href} className="tactile-soft group flex gap-3.5 rounded-lg sm:gap-4">
        <span className="w-5 shrink-0 pt-0.5 text-right font-mono text-sm tabular-nums text-ink-muted">{rank}</span>

        <div className="min-w-0 flex-1">
          {/* line 1 — ticker + price */}
          <div className="flex items-baseline justify-between gap-3">
            <div className="flex min-w-0 items-baseline gap-2">
              <span className="font-mono text-sm font-semibold text-ink">{c.ticker}</span>
              {c.tier === 'leader' && (
                <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-ink-muted">{t('trend leader', 'pemimpin tren')}</span>
              )}
              {c.tier === 'relaxed' && (
                <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-warn">{t('developing', 'berkembang')}</span>
              )}
              {c.board === 'Pemantauan Khusus' && (
                <span className="shrink-0 text-[10px] uppercase tracking-wide text-warn">{t('monitored', 'pemantauan')}</span>
              )}
            </div>
            <div className="flex shrink-0 items-baseline gap-2 font-mono tabular-nums">
              <span ref={priceRef} className="rounded px-0.5 text-sm text-ink">{formatRp(c.live?.last ?? c.close)}</span>
              {c.live?.changePct != null && (
                <span ref={changeRef} className={`rounded px-0.5 text-xs ${changeTone}`}>{signedPct(c.live.changePct)}</span>
              )}
            </div>
          </div>

          {/* line 2 — name + score/rating */}
          <div className="mt-0.5 flex items-baseline justify-between gap-3">
            <p className="min-w-0 truncate text-xs text-ink-muted" title={c.name}>
              {c.name}
              {c.capTier && <span> · {c.capTier}</span>}
              {c.sector && <span> · {c.sector}</span>}
            </p>
            <span className="flex shrink-0 items-baseline gap-1.5 font-mono text-xs tabular-nums text-ink-muted">
              {c.composite != null ? c.composite.toFixed(1) : '—'}
              <RatingFigure rating={c.overallRating} className="text-sm" />
            </span>
          </div>

          {/* line 3 — signal line */}
          {(signals.length > 0 || bandar?.accdist) && (
            <p className="mt-1.5 font-mono text-[11px] text-ink-muted">
              {signals.join(' · ')}
              {bandar?.accdist && (
                <>
                  {signals.length > 0 && ' · '}
                  <span className={accTone(bandar.accdist)}>{`Bandar ${bandar.accdist}`}</span>
                </>
              )}
            </p>
          )}
        </div>

        <RowArrow />
      </Link>

      <PlanDisclosure
        id={c.ticker}
        label={t('Trading plan', 'Rencana trading')}
        plan={c.plan ?? null}
        live={c.live}
        rvol={c.rvol}
        lastValueTraded={c.lastValueTraded}
        scanType={scanType}
        kind="momentum"
        expanded={planExpanded}
        onToggle={onTogglePlan}
      />
    </li>
  );
}

// ---- DiscountRow (Tier C — Sentiment Discount) ----
function DiscountRow({ c, rank, index, planExpanded, onTogglePlan, scanType }) {
  const t = useT();
  const f = c.fundamentals ?? {};
  const liveUp = c.live?.changePct != null && c.live.changePct > 0;
  const liveDown = c.live?.changePct != null && c.live.changePct < 0;
  const changeTone = liveUp ? 'text-pos' : liveDown ? 'text-neg' : 'text-ink-muted';
  const href = `/analysis?ticker=${encodeURIComponent(c.ticker)}&intent=buy&autorun=1`;

  // Same directional flash as MoverRow — a discount's live price/percent still
  // moves on a poll, and the tint helps the eye catch it.
  const priceRef = useFlashOnChange(c.live?.last ?? c.close);
  const changeRef = useFlashOnChange(c.live?.changePct);

  const signals = [];
  if (c.rsi14 != null) signals.push(`RSI ${Math.round(c.rsi14)}`);
  if (f.roe != null) signals.push(`ROE ${(f.roe * 100).toFixed(0)}%`);
  if (f.per != null && f.per > 0) signals.push(`PER ${f.per.toFixed(1)}×`);
  if (f.pbv != null) signals.push(`PBV ${f.pbv.toFixed(2)}×`);
  if (c.lastValueTraded > 0) signals.push(fmtMilliar(c.lastValueTraded));

  return (
    <li className="result-row-enter px-4 py-4 sm:px-5" style={{ '--i': Math.min(index, 9) }}>
      <Link to={href} className="tactile-soft group flex gap-3.5 rounded-lg sm:gap-4">
        <span className="w-5 shrink-0 pt-0.5 text-right font-mono text-sm tabular-nums text-ink-muted">{rank}</span>

        <div className="min-w-0 flex-1">
          {/* line 1 — ticker + price */}
          <div className="flex items-baseline justify-between gap-3">
            <div className="flex min-w-0 items-baseline gap-2">
              <span className="font-mono text-sm font-semibold text-ink">{c.ticker}</span>
              {c.depth === 'shallow' && (
                <span className="shrink-0 text-[10px] uppercase tracking-wide text-ink-muted">{t('shallow', 'dangkal')}</span>
              )}
              {c.board === 'Pemantauan Khusus' && (
                <span className="shrink-0 text-[10px] uppercase tracking-wide text-warn">{t('monitored', 'pemantauan')}</span>
              )}
            </div>
            <div className="flex shrink-0 items-baseline gap-2 font-mono tabular-nums">
              <span ref={priceRef} className="rounded px-0.5 text-sm text-ink">{formatRp(c.live?.last ?? c.close)}</span>
              {c.live?.changePct != null && (
                <span ref={changeRef} className={`rounded px-0.5 text-xs ${changeTone}`}>{signedPct(c.live.changePct)}</span>
              )}
            </div>
          </div>

          {/* line 2 — name + discount depth */}
          <div className="mt-0.5 flex items-baseline justify-between gap-3">
            <p className="min-w-0 truncate text-xs text-ink-muted" title={c.name}>
              {c.name}
              {c.capTier && <span> · {c.capTier}</span>}
              {c.sector && <span> · {c.sector}</span>}
            </p>
            <span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-ink">
              {c.discountPct == null
                ? '—'
                : c.discountPct > 0.05
                  ? `−${c.discountPct.toFixed(1)}%`
                  : t('at MA50', 'di MA50')}
              {c.discountPct != null && c.discountPct > 0.05 && (
                <span className="ml-1 font-normal text-ink-muted">{t('vs MA50', 'vs MA50')}</span>
              )}
            </span>
          </div>

          {/* line 3 — fundamentals line */}
          {signals.length > 0 && (
            <p className="mt-1.5 font-mono text-[11px] text-ink-muted">{signals.join(' · ')}</p>
          )}
        </div>

        <RowArrow />
      </Link>

      <PlanDisclosure
        id={`disc:${c.ticker}`}
        label={t('Rebound plan', 'Rencana rebound')}
        plan={c.plan ?? null}
        live={c.live}
        rvol={c.rvol}
        lastValueTraded={c.lastValueTraded}
        scanType={scanType}
        kind="discount"
        expanded={planExpanded}
        onToggle={onTogglePlan}
      />
    </li>
  );
}

// ---- DiscountSection (Tier C — standing, always-on) ----
function DiscountSection({ discounts, ihsg, expandedPlan, onTogglePlan, scanType }) {
  const t = useT();
  const list = Array.isArray(discounts) ? discounts : [];
  const ihsgRed = ihsg?.changePct != null && ihsg.changePct < 0;

  return (
    <section className="mt-14">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <h3 className="font-serif text-xl font-medium tracking-tight [text-wrap:balance] sm:text-2xl">
            {t('Sentiment discounts', 'Diskon sentimen')}
          </h3>
          <p className="mt-1.5 max-w-prose text-sm text-ink-muted">
            {t(
              'Sound blue chips (≥ Rp 1T) oversold by the market, not broken — trend intact, below MA50, washed-out RSI. Counter-trend, so size down.',
              'Saham unggulan (≥ Rp 1T) yang oversold karena sentimen, bukan rusak — tren utuh, di bawah MA50, RSI jenuh jual. Lawan arah, perkecil posisi.',
            )}
          </p>
        </div>
        {ihsg?.changePct != null && (
          <p className="font-mono text-xs tabular-nums text-ink-muted">
            IHSG <span className={ihsgRed ? 'text-neg' : 'text-pos'}>{signedPct(ihsg.changePct)}</span>
          </p>
        )}
      </div>

      <div className="mt-5">
        {list.length > 0 ? (
          <ol className="surface-raised divide-y divide-line overflow-hidden rounded-2xl border border-line">
            {list.map((c, i) => (
              <DiscountRow
                key={`disc-${c.ticker}`}
                c={c}
                rank={i + 1}
                index={i}
                planExpanded={expandedPlan === `disc:${c.ticker}`}
                onTogglePlan={onTogglePlan}
                scanType={scanType}
              />
            ))}
          </ol>
        ) : (
          <div className="surface-raised rounded-2xl border border-line px-6 py-9 text-center">
            <p className="font-serif text-base font-medium">{t('No discounts right now', 'Belum ada diskon saat ini')}</p>
            <p className="mt-1 text-sm text-ink-muted">
              {ihsgRed
                ? t('Quality names are holding up despite the red tape.', 'Saham berkualitas bertahan meski pasar merah.')
                : t("The market isn't discounting quality today.", 'Pasar tidak sedang mendiskon saham berkualitas hari ini.')}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

// ---- RecognizableRow (Tier D — Likuid & Populer) ----
function RecognizableRow({ c, rank, index, planExpanded, onTogglePlan, scanType }) {
  const t = useT();
  const s = c.signals ?? {};
  const liveUp = c.live?.changePct != null && c.live.changePct > 0;
  const liveDown = c.live?.changePct != null && c.live.changePct < 0;
  const changeTone = liveUp ? 'text-pos' : liveDown ? 'text-neg' : 'text-ink-muted';
  const href = `/analysis?ticker=${encodeURIComponent(c.ticker)}&intent=buy&autorun=1`;

  const priceRef = useFlashOnChange(c.live?.last ?? c.close);
  const changeRef = useFlashOnChange(c.live?.changePct);

  const signals = [];
  if (s.rsi14 != null) signals.push(`RSI ${Math.round(s.rsi14)}`);
  if (s.goldenTrend) signals.push(t('uptrend', 'uptrend'));
  if (c.lastValueTraded > 0) signals.push(fmtMilliar(c.lastValueTraded));

  return (
    <li className="result-row-enter px-4 py-4 sm:px-5" style={{ '--i': Math.min(index, 9) }}>
      <Link to={href} className="tactile-soft group flex gap-3.5 rounded-lg sm:gap-4">
        <span className="w-5 shrink-0 pt-0.5 text-right font-mono text-sm tabular-nums text-ink-muted">{rank}</span>

        <div className="min-w-0 flex-1">
          {/* line 1 — ticker + group + price */}
          <div className="flex items-baseline justify-between gap-3">
            <div className="flex min-w-0 items-baseline gap-2">
              <span className="font-mono text-sm font-semibold text-ink">{c.ticker}</span>
              {c.group && (
                <span className="shrink-0 truncate font-mono text-[10px] uppercase tracking-wide text-brand-strong">{c.group}</span>
              )}
            </div>
            <div className="flex shrink-0 items-baseline gap-2 font-mono tabular-nums">
              <span ref={priceRef} className="rounded px-0.5 text-sm text-ink">{formatRp(c.live?.last ?? c.close)}</span>
              {c.live?.changePct != null && (
                <span ref={changeRef} className={`rounded px-0.5 text-xs ${changeTone}`}>{signedPct(c.live.changePct)}</span>
              )}
            </div>
          </div>

          {/* line 2 — name + score/rating */}
          <div className="mt-0.5 flex items-baseline justify-between gap-3">
            <p className="min-w-0 truncate text-xs text-ink-muted" title={c.name}>
              {c.name}
              {c.capTier && <span> · {c.capTier}</span>}
              {c.sector && <span> · {c.sector}</span>}
            </p>
            <span className="flex shrink-0 items-baseline gap-1.5 font-mono text-xs tabular-nums text-ink-muted">
              {c.composite != null ? c.composite.toFixed(1) : '—'}
              <RatingFigure rating={c.overallRating} className="text-sm" />
            </span>
          </div>

          {/* line 3 — signal line */}
          {signals.length > 0 && (
            <p className="mt-1.5 font-mono text-[11px] text-ink-muted">{signals.join(' · ')}</p>
          )}
        </div>

        <RowArrow />
      </Link>

      <PlanDisclosure
        id={`recog:${c.ticker}`}
        label={t('Trading plan', 'Rencana trading')}
        plan={c.plan ?? null}
        live={c.live}
        rvol={c.rvol}
        lastValueTraded={c.lastValueTraded}
        scanType={scanType}
        kind="momentum"
        expanded={planExpanded}
        onToggle={onTogglePlan}
      />
    </li>
  );
}

// ---- RecognizableSection (Tier D — standing, always-on) ----
function RecognizableSection({ recognizable, expandedPlan, onTogglePlan, scanType }) {
  const t = useT();
  const list = Array.isArray(recognizable) ? recognizable : [];
  if (list.length === 0) return null; // quiet when nothing constructive among the big names

  return (
    <section className="mt-14">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <h3 className="font-serif text-xl font-medium tracking-tight [text-wrap:balance] sm:text-2xl">
            {t('Liquid & familiar', 'Likuid & populer')}
          </h3>
          <p className="mt-1.5 max-w-prose text-sm text-ink-muted">
            {t(
              'Names you actually know — big liquid issuers and listed conglomerate arms — riding a constructive trend, not a one-day spike. The trustworthy counterweight to the momentum movers above.',
              'Saham yang Anda kenal — emiten besar yang likuid dan anak usaha grup konglomerat — dalam tren yang sehat, bukan lonjakan sehari. Penyeimbang yang lebih terpercaya dari penggerak momentum di atas.',
            )}
          </p>
        </div>
      </div>

      <div className="mt-5">
        <ol className="surface-raised divide-y divide-line overflow-hidden rounded-2xl border border-line">
          {list.map((c, i) => (
            <RecognizableRow
              key={`recog-${c.ticker}`}
              c={c}
              rank={i + 1}
              index={i}
              planExpanded={expandedPlan === `recog:${c.ticker}`}
              onTogglePlan={onTogglePlan}
              scanType={scanType}
            />
          ))}
        </ol>
      </div>
    </section>
  );
}

// ---- StateNotice ----
function StateNotice({ kind }) {
  const t = useT();
  const scanning = kind === 'scanning' || kind === 'no-snapshot';
  return (
    <div className="surface-raised rounded-2xl border border-line px-6 py-12 text-center">
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

  const togglePlan = (id) => setExpandedPlan((cur) => (cur === id ? null : id));

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
            {t('Today’s movers', 'Penggerak hari ini')}
          </h2>
          <p className="mt-1.5 max-w-prose text-sm text-ink-muted">
            {t(
              'Rescanned every 15 minutes while the market is open — strongest momentum and breakout names, each with a live ATR trading plan.',
              'Dipindai tiap 15 menit selama pasar buka — momentum & breakout terkuat, masing-masing dengan rencana trading ATR langsung.',
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
        <MarketStrip snapshot={snapshot} />
      </div>

      {marketClosed && status === 'ready' && (
        <p className="mt-4 text-xs text-ink-muted">
          {t(
            'Market closed — showing the last session’s pre-close list (your overnight watchlist).',
            'Pasar tutup — menampilkan daftar jelang penutupan sesi terakhir (watchlist semalam Anda).',
          )}
        </p>
      )}

      {/* movers */}
      <div className="mt-8">
        {status === 'loading' && (
          <div className="surface-raised space-y-2 rounded-2xl border border-line p-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-16 rounded-xl" />
            ))}
          </div>
        )}
        {(status === 'scanning' || status === 'empty' || status === 'error') && <StateNotice kind={status} />}
        {status === 'ready' && (
          <ol className="surface-raised divide-y divide-line overflow-hidden rounded-2xl border border-line">
            {candidates.map((c, i) => (
              <MoverRow
                key={c.ticker}
                c={c}
                rank={i + 1}
                index={i}
                planExpanded={expandedPlan === c.ticker}
                onTogglePlan={togglePlan}
                scanType={snapshot?.scanType}
              />
            ))}
          </ol>
        )}
      </div>

      {/* Tier D — Likuid & Populer: the recognizable-name counterweight. */}
      {snapshot?.generatedAt && (
        <RecognizableSection
          recognizable={snapshot.recognizable}
          expandedPlan={expandedPlan}
          onTogglePlan={togglePlan}
          scanType={snapshot.scanType}
        />
      )}

      {/* Tier C — Sentiment Discount: a standing counter-trend section. */}
      {snapshot?.generatedAt && (
        <DiscountSection
          discounts={snapshot.discounts}
          ihsg={snapshot.ihsg}
          expandedPlan={expandedPlan}
          onTogglePlan={togglePlan}
          scanType={snapshot.scanType}
        />
      )}

      {snapshot?.summary && status === 'ready' && (
        <p className="mt-8 font-mono text-[11px] leading-relaxed text-ink-muted">{snapshot.summary}</p>
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

import { formatCompact } from '../lib/analysis';
import { useFlashOnChange } from '../lib/useFlashOnChange';

// The accumulation↔distribution read, driven by the IDX top-5 net concentration
// (not the raw session buy/sell totals, which always net to ~zero because they
// are the same matched trades split into two buckets).
//
// The bar is the one graphic element on the report surface, so it earns its
// place: a hairline track, a centered neutral tick, a solid amber knob, and the
// net % printed at the knob so the position reads without a ruler. Direction
// tints the label/pill only — the track itself stays neutral tint, never raw
// saturated green/red.
export function BrokerActionGauge({ bandar, t }) {
  const netRatio =
    bandar.sessionValue > 0
      ? Math.max(-1, Math.min(1, bandar.top5NetValue / bandar.sessionValue))
      : 0;
  const pct = 50 + netRatio * 50;
  const netPct = Math.round(netRatio * 100);
  const sign = netPct > 0 ? '+' : '';
  // Direction tints the label, not the bar.
  const dirTone = netPct > 0 ? 'text-pos' : netPct < 0 ? 'text-neg' : 'text-ink-muted';
  // Flash the net-flow label when it changes — a live broker tape that shifts on
  // a refresh should read as moving, not as a frozen number snapping forward.
  const labelRef = useFlashOnChange(netRatio);

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p className="font-mono text-xs text-ink-muted">
          {t('Broker action · net flow', 'Aksi broker · aliran net')}
        </p>
        <span
          ref={labelRef}
          className={`font-mono text-xs font-medium tabular-nums ${dirTone}`}
        >
          {sign}
          {netPct}%
        </span>
      </div>
      {/* Hairline track with a centered neutral midline tick. The gradient is
          held back to tint strength (tint tokens, not raw pos/neg) so it reads
          as a scale rather than a saturated banner. */}
      <div className="relative h-1.5 rounded-full bg-gradient-to-r from-neg-tint via-well-2 to-pos-tint">
        {/* Center midline */}
        <span aria-hidden="true" className="absolute top-1/2 left-1/2 h-2.5 w-px -translate-x-1/2 -translate-y-1/2 bg-line" />
        {/* Knob */}
        <span
          aria-hidden="true"
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-paper bg-brand shadow-[0_1px_3px_rgb(0_0_0/0.18)] motion-reduce:transition-none"
          style={{
            left: `${pct}%`,
            transition: 'left var(--spring-settle-dur) var(--spring-settle)',
          }}
        />
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[11px] text-ink-muted">
        <span>{t('Distribution', 'Distribusi')}</span>
        <span>{t('Neutral', 'Netral')}</span>
        <span>{t('Accumulation', 'Akumulasi')}</span>
      </div>
    </div>
  );
}

// Paired buy/sell columns for the screener's inline broker expansion. Two
// compact lists (top 5 each) where each row is code · dotted leader · value,
// buys tinted positive and sells tinted negative, foreign brokers flagged with
// a superscript dot. A single footer line carries the average buy/sell price so
// the per-row lot/avg noise of the dense table doesn't crowd the expansion.
//
// `maxRows` caps each side (defaults to 5). Buys and sells are rendered
// independently — a long sell tape no longer pads the buy column with em-dashes.
// One side of the paired tape (buyers or sellers). Hoisted to module scope so
// it keeps a stable identity across renders rather than being re-created inside
// BrokerActionColumns on every render.
function BrokerColumn({ title, rows, valueTone, t }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 font-mono text-[11px] uppercase tracking-wide text-ink-muted">{title}</p>
      {rows.length > 0 ? (
        <ul className="space-y-0.5">
          {rows.map((r, i) => (
            <li
              key={`${r.code}-${i}`}
              className="list-item-enter flex items-baseline gap-1.5 text-xs"
              style={{ '--i': i }}
              title={r.foreign ? t('Foreign broker', 'Broker asing') : undefined}
            >
              <span className="shrink-0 font-mono font-medium text-ink">
                {r.code}
                {r.foreign && <span className="text-brand-strong">·</span>}
              </span>
              <span aria-hidden="true" className="min-w-3 flex-1 -translate-y-1 border-b border-dotted border-line" />
              <span className={`shrink-0 font-mono tabular-nums ${valueTone}`}>
                {formatCompact(r.value)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-ink-muted">—</p>
      )}
    </div>
  );
}

export function BrokerActionColumns({ bandar, t, maxRows = 5 }) {
  const buys = (bandar.buyRows ?? []).slice(0, maxRows);
  const sells = (bandar.sellRows ?? []).slice(0, maxRows);
  if (buys.length === 0 && sells.length === 0) return null;

  const avgBuy = buys.length ? buys.reduce((s, r) => s + (r.avg || 0), 0) / buys.length : 0;
  const avgSell = sells.length ? sells.reduce((s, r) => s + (r.avg || 0), 0) / sells.length : 0;

  return (
    <div>
      <div className="grid grid-cols-2 gap-x-6">
        <BrokerColumn title={t('Top buyers', 'Pembeli teratas')} rows={buys} valueTone="text-pos" t={t} />
        <BrokerColumn title={t('Top sellers', 'Penjual teratas')} rows={sells} valueTone="text-neg" t={t} />
      </div>
      {(avgBuy > 0 || avgSell > 0) && (
        <p className="mt-3 font-mono text-[11px] text-ink-muted">
          {t('Avg buy', 'Rata-rata beli')}{' '}
          <span className="tabular-nums text-ink">{Math.round(avgBuy).toLocaleString('en-US')}</span>
          {' · '}
          {t('avg sell', 'rata-rata jual')}{' '}
          <span className="tabular-nums text-ink">{Math.round(avgSell).toLocaleString('en-US')}</span>
        </p>
      )}
    </div>
  );
}

// Side-by-side buy/sell broker tape — the dense table view of bandarmology,
// mirroring how brokers read it: code, net value, net lot, average price,
// ranked by value on each side. Used by the Analysis page (full report), where
// density is wanted; the screener's inline expansion uses BrokerActionColumns
// instead.
//
// `compact` tightens text/padding for tighter contexts (unused by the screener
// now but retained for other compact callers), and `maxRows` caps how many rows
// are rendered so a long tape doesn't blow out the view.
export function BrokerActionTable({ bandar, t, compact = false, maxRows }) {
  const buys = bandar.buyRows ?? [];
  const sells = bandar.sellRows ?? [];
  let rowCount = Math.max(buys.length, sells.length);
  if (rowCount === 0) return null;
  if (typeof maxRows === 'number' && maxRows > 0) rowCount = Math.min(rowCount, maxRows);
  const rows = Array.from({ length: rowCount }, (_, i) => ({ buy: buys[i], sell: sells[i] }));

  const cellPad = compact ? 'py-1 pr-1.5' : 'py-1.5 pr-2';
  const cellPadLeft = compact ? 'py-1 pl-3 pr-1.5' : 'border-l border-line py-1.5 pl-4 pr-2';
  const cellPadLast = compact ? 'py-1' : 'py-1.5';
  const numText = compact ? 'text-[11px]' : 'text-sm';
  const codeText = compact ? 'text-[11px]' : 'text-sm';
  const minW = compact ? 'min-w-[420px]' : 'min-w-[560px]';

  return (
    <div className="ios-scroll overflow-x-auto">
      <table className={`w-full ${minW} border-collapse ${numText}`}>
        <thead>
          <tr className="border-b border-line font-mono text-xs text-ink-muted">
            <th className={`${cellPad} text-left font-medium`}>{t('Buy', 'Beli')}</th>
            <th className={`${cellPad} text-right font-medium`}>{t('Value', 'Nilai')}</th>
            <th className={`${cellPad} text-right font-medium`}>{t('Lot', 'Lot')}</th>
            <th className={`${compact ? 'py-1 pr-2' : 'py-1.5 pr-4'} text-right font-medium`}>{t('Avg', 'Rata-rata')}</th>
            <th className={`${cellPadLeft} text-left font-medium`}>{t('Sell', 'Jual')}</th>
            <th className={`${cellPad} text-right font-medium`}>{t('Value', 'Nilai')}</th>
            <th className={`${cellPad} text-right font-medium`}>{t('Lot', 'Lot')}</th>
            <th className={`${cellPadLast} text-right font-medium`}>{t('Avg', 'Rata-rata')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line/60">
          {rows.map((row, i) => (
            <tr key={i}>
              <td className={`${cellPad} font-mono font-medium ${codeText}`}>
                {row.buy ? `${row.buy.code}${row.buy.foreign ? '*' : ''}` : '—'}
              </td>
              <td className={`${cellPad} text-right font-mono tabular-nums text-pos`}>
                {row.buy ? formatCompact(row.buy.value) : '—'}
              </td>
              <td className={`${cellPad} text-right font-mono tabular-nums text-ink-muted`}>
                {row.buy ? formatCompact(row.buy.lot) : '—'}
              </td>
              <td className={`${compact ? 'py-1 pr-2' : 'py-1.5 pr-4'} text-right font-mono tabular-nums text-ink-muted`}>
                {row.buy ? row.buy.avg.toLocaleString('en-US') : '—'}
              </td>
              <td className={`${cellPadLeft} font-mono font-medium ${codeText}`}>
                {row.sell ? `${row.sell.code}${row.sell.foreign ? '*' : ''}` : '—'}
              </td>
              <td className={`${cellPad} text-right font-mono tabular-nums text-neg`}>
                {row.sell ? formatCompact(row.sell.value) : '—'}
              </td>
              <td className={`${cellPad} text-right font-mono tabular-nums text-ink-muted`}>
                {row.sell ? formatCompact(row.sell.lot) : '—'}
              </td>
              <td className={`${cellPadLast} text-right font-mono tabular-nums text-ink-muted`}>
                {row.sell ? row.sell.avg.toLocaleString('en-US') : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={`mt-2 font-mono text-[11px] text-ink-muted`}>* {t('foreign broker', 'broker asing')}</p>
    </div>
  );
}

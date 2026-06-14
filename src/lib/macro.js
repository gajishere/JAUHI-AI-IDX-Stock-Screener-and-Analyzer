// Top-down macro context for the screening desk. Every input is REAL,
// pulled from Yahoo via the /yf proxy — no simulated/random data. Used by the
// "Framework JAUHI AI" screening engine (never by single-ticker Analysis).
import { fetchSymbolChart } from './marketData';

// Yahoo symbols for the macro pillars.
const SYMBOLS = {
  ihsg: '^JKSE', // Jakarta Composite (IHSG)
  usdidr: 'IDR=X', // USD/IDR — up = weaker rupiah
  dxy: 'DX-Y.NYB', // US Dollar Index — up = EM headwind
  sp500: '^GSPC',
  nasdaq: '^IXIC',
  nikkei: '^N225',
  hangseng: '^HSI',
};

const LABELS = {
  ihsg: 'IHSG',
  usdidr: 'USD/IDR',
  dxy: 'DXY',
  sp500: 'S&P 500',
  nasdaq: 'Nasdaq',
  nikkei: 'Nikkei 225',
  hangseng: 'Hang Seng',
};

// Last close + day/week change as of (or before) the screening date.
function reduceSeries(chart, asOfDate) {
  const candles = asOfDate ? chart.candles.filter((c) => c.date <= asOfDate) : chart.candles;
  if (candles.length < 2) return null;
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const weekAgo = candles[candles.length - 6];
  return {
    close: last.close,
    dayChange: (last.close - prev.close) / prev.close,
    weekChange: weekAgo ? (last.close - weekAgo.close) / weekAgo.close : null,
    asOf: last.date,
  };
}

const sign = (x) => (x > 0 ? 1 : x < 0 ? -1 : 0);

// Turn the raw index reads into weighted, signed pillars. Thresholds are small
// dead-bands so a flat tape reads neutral rather than noisy.
function buildPillars(d) {
  const pillars = {};
  const reasons = [];
  let score = 0;

  // Wall Street overnight — leads IDX open. (weight 0.25)
  const wall = [d.sp500?.dayChange, d.nasdaq?.dayChange].filter((v) => v != null);
  if (wall.length) {
    const avg = wall.reduce((a, b) => a + b, 0) / wall.length;
    const s = Math.abs(avg) < 0.003 ? 0 : sign(avg);
    pillars.global = { score: s, value: avg, label: 'Wall Street' };
    score += s * 0.25;
    if (s) reasons.push(`Wall Street ${s > 0 ? 'up' : 'down'} ${(avg * 100).toFixed(1)}% overnight`);
  }

  // Regional Asia — same-session risk appetite. (weight 0.15)
  const asia = [d.nikkei?.dayChange, d.hangseng?.dayChange].filter((v) => v != null);
  if (asia.length) {
    const avg = asia.reduce((a, b) => a + b, 0) / asia.length;
    const s = Math.abs(avg) < 0.004 ? 0 : sign(avg);
    pillars.asia = { score: s, value: avg, label: 'Asia regional' };
    score += s * 0.15;
    if (s) reasons.push(`Asia ${s > 0 ? 'green' : 'red'} ${(avg * 100).toFixed(1)}%`);
  }

  // Dollar index — rising DXY pressures EM/IDX. (weight 0.15, inverted)
  if (d.dxy) {
    const s = Math.abs(d.dxy.dayChange) < 0.002 ? 0 : -sign(d.dxy.dayChange);
    pillars.dollar = { score: s, value: d.dxy.dayChange, label: 'DXY' };
    score += s * 0.15;
    if (s) reasons.push(`DXY ${d.dxy.dayChange > 0 ? 'rising' : 'falling'} — ${s > 0 ? 'tailwind' : 'headwind'} for IDX`);
  }

  // Rupiah — USD/IDR down = stronger rupiah = supportive. (weight 0.20, inverted)
  if (d.usdidr) {
    const s = Math.abs(d.usdidr.dayChange) < 0.002 ? 0 : -sign(d.usdidr.dayChange);
    pillars.rupiah = { score: s, value: d.usdidr.dayChange, label: 'Rupiah' };
    score += s * 0.2;
    if (s) reasons.push(`Rupiah ${s > 0 ? 'strengthening' : 'weakening'} vs USD`);
  }

  // IHSG's own trend — day + week. (weight 0.25)
  if (d.ihsg) {
    const day = sign(d.ihsg.dayChange);
    const wk = d.ihsg.weekChange != null ? sign(d.ihsg.weekChange) : 0;
    const s = Math.abs(d.ihsg.dayChange) < 0.002 && Math.abs(d.ihsg.weekChange ?? 0) < 0.005 ? 0 : sign(day + wk * 0.5);
    pillars.local = { score: s, value: d.ihsg.dayChange, weekValue: d.ihsg.weekChange, label: 'IHSG trend' };
    score += s * 0.25;
    if (s) reasons.push(`IHSG ${s > 0 ? 'constructive' : 'soft'} (day ${(d.ihsg.dayChange * 100).toFixed(1)}%)`);
  }

  return { pillars, score, reasons };
}

function regimeFromScore(score) {
  if (score >= 0.25) return { regime: 'Risk-on', bias: 'Bullish' };
  if (score <= -0.25) return { regime: 'Risk-off', bias: 'Bearish' };
  return { regime: 'Mixed', bias: 'Neutral' };
}

// Fetch all macro pillars for the given screening date and assemble the regime.
// Returns null only if every fetch fails; otherwise degrades pillar-by-pillar.
export async function fetchMacro(asOfDate) {
  const keys = Object.keys(SYMBOLS);
  const settled = await Promise.allSettled(keys.map((k) => fetchSymbolChart(SYMBOLS[k], '1mo')));

  const indices = {};
  settled.forEach((o, i) => {
    indices[keys[i]] = o.status === 'fulfilled' ? reduceSeries(o.value, asOfDate) : null;
  });

  if (Object.values(indices).every((v) => v == null)) return null;

  const { pillars, score, reasons } = buildPillars(indices);
  const { regime, bias } = regimeFromScore(score);

  return {
    asOf: indices.ihsg?.asOf ?? asOfDate ?? null,
    indices,
    labels: LABELS,
    pillars,
    score: Math.max(-1, Math.min(1, score)),
    regime,
    bias,
    reasons,
  };
}

// Compact text the AI prompt can read, all real figures.
export function summarizeMacro(macro) {
  if (!macro) return 'Macro data unavailable.';
  const pct = (v) => (v == null ? 'n/a' : `${v > 0 ? '+' : ''}${(v * 100).toFixed(2)}%`);
  const lines = Object.keys(macro.indices)
    .filter((k) => macro.indices[k])
    .map((k) => `- ${macro.labels[k]}: ${macro.indices[k].close.toLocaleString()} (day ${pct(macro.indices[k].dayChange)}, wk ${pct(macro.indices[k].weekChange)})`);
  return [
    `Macro regime: ${macro.regime} (bias ${macro.bias}, score ${macro.score.toFixed(2)}).`,
    `Drivers: ${macro.reasons.join('; ') || 'flat tape'}.`,
    'Index reads (as of screening date):',
    ...lines,
  ].join('\n');
}

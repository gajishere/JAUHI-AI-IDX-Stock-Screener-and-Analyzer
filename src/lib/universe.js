// The IDX reference universe: the full emiten list and the broker
// activity table, with search and lookup helpers layered on top.
import { emiten } from '../data/emiten.js';
import { brokers } from '../data/brokers.js';

// ---------- emiten lookup & search ----------

export const EMITEN_COUNT = emiten.length;

const byCode = new Map(emiten.map((e) => [e.code, e]));

export function findEmiten(code) {
  if (!code) return null;
  return byCode.get(code.trim().toUpperCase()) ?? null;
}

// A small ranked search engine over all ~957 listings. Exact code beats
// code-prefix beats word-start name match beats loose substring.
export function searchEmiten(query, limit = 8) {
  const q = query.trim().toUpperCase();
  if (!q) return [];
  const scored = [];
  for (const e of emiten) {
    const code = e.code;
    const name = e.name.toUpperCase();
    let rank = -1;
    if (code === q) rank = 0;
    else if (code.startsWith(q)) rank = 1;
    else if (name.split(/[^A-Z0-9]+/).some((w) => w.startsWith(q))) rank = 2;
    else if (name.includes(q)) rank = 3;
    else if (code.includes(q)) rank = 4;
    if (rank >= 0) scored.push({ e, rank });
  }
  scored.sort((a, b) => a.rank - b.rank || a.e.code.localeCompare(b.e.code));
  return scored.slice(0, limit).map((s) => s.e);
}

// Distinct sectors present in the universe (Yahoo GICS-style), sorted for the
// screening sector dropdown. Names without a sector are simply excluded here.
export const SECTORS = [...new Set(emiten.map((e) => e.sector).filter(Boolean))].sort();

// ---------- market-cap classification ----------

export function marketCap(emitenInfo, price) {
  if (!emitenInfo?.shares || price == null) return null;
  return emitenInfo.shares * price;
}

export function capTier(cap) {
  if (cap == null) return null;
  if (cap >= 1e14) return 'Large cap'; // ≥ Rp 100T
  if (cap >= 1e13) return 'Mid cap'; //  ≥ Rp 10T
  if (cap >= 1e12) return 'Small cap'; // ≥ Rp 1T
  return 'Micro cap';
}

// IDX listing boards carry a risk signal. "Pemantauan Khusus" (special
// monitoring) flags companies under heightened supervision.
export function boardRisk(board) {
  if (!board) return null;
  if (board === 'Pemantauan Khusus')
    return { level: 'high', note: 'Special Monitoring board — heightened supervision, elevated risk' };
  if (board === 'Akselerasi')
    return { level: 'elevated', note: 'Acceleration board — small, early-stage issuer' };
  if (board === 'Pengembangan')
    return { level: 'moderate', note: 'Development board — does not meet Main board size criteria' };
  if (board === 'Ekonomi Baru')
    return { level: 'moderate', note: 'New Economy board — multiple voting share issuer' };
  return { level: 'normal', note: 'Main board listing' };
}

// ---------- broker activity context (single reference session) ----------

const brokerByCode = new Map(brokers.map((b) => [b.code, b]));

export function brokerName(code) {
  return brokerByCode.get(code)?.name ?? code;
}

// Clearly foreign/international member firms, by name keyword. Used to
// estimate foreign participation for the reference session.
const FOREIGN_KEYWORDS = [
  'UBS', 'J.P. Morgan', 'Morgan Stanley', 'CLSA', 'Macquarie', 'Maybank',
  'CGS', 'RHB', 'DBS', 'Credit Suisse', 'Citigroup', 'Deutsche', 'BNP',
  'Nomura', 'Daiwa', 'Korea Investment', 'KB Valbury', 'Mirae', 'Kiwoom',
  'Shinhan', 'Kay Hian', 'Phillip', 'KGI', 'Yuanta', 'NH Korindo', 'OCBC',
];

function isForeign(name) {
  const upper = name.toUpperCase();
  return FOREIGN_KEYWORDS.some((k) => upper.includes(k.toUpperCase()));
}

// Aggregate, market-wide broker activity for the reference session. Broker
// totals count both sides of every trade, so turnover ≈ sum / 2.
export const brokerContext = (() => {
  const totalVolume = brokers.reduce((a, b) => a + (b.volume ?? 0), 0);
  const totalValue = brokers.reduce((a, b) => a + (b.value ?? 0), 0);
  const totalFreq = brokers.reduce((a, b) => a + (b.freq ?? 0), 0);
  const foreignValue = brokers
    .filter((b) => isForeign(b.name))
    .reduce((a, b) => a + (b.value ?? 0), 0);
  const topByValue = [...brokers]
    .filter((b) => b.value != null)
    .sort((a, b) => b.value - a.value)
    .slice(0, 5)
    .map((b) => ({ ...b, foreign: isForeign(b.name) }));
  return {
    brokerCount: brokers.length,
    turnoverValue: totalValue / 2,
    turnoverVolume: totalVolume / 2,
    totalFreq,
    foreignShare: totalValue > 0 ? foreignValue / totalValue : null,
    topByValue,
  };
})();

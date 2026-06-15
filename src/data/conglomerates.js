// Major Indonesian conglomerate / holding groups and their IDX-listed issuers.
//
// IDX has no "Multi-Sector Holdings / Holding Companies" sector tag, so the
// Conglomerate / Holding Companies screen gates membership on this curated map
// instead of e.sector. Sourced from the user's brief (2026-06-16): the ten
// dominant family/holding groups whose subsidiaries trade on the exchange.
//
// Codes are IDX tickers (no .JK). A few names in the brief used colloquial or
// pre-listing codes — corrected here to the live IDX ticker (e.g. Blibli /
// Global Digital Niaga is BELI, not "BLIB"). Codes that aren't in the bundled
// emiten universe stay listed for documentation but simply never surface in a
// scan (the membership Set is intersected with the live universe).

export const CONGLOMERATE_GROUPS = [
  {
    group: 'Djarum / Hartono',
    controller: 'Hartono Family (Budi & Michael Bambang Hartono)',
    tickers: ['BBCA', 'TOWR', 'BELI'], // BELI = Global Digital Niaga (Blibli)
  },
  {
    group: 'Salim',
    controller: 'Anthoni Salim',
    // BUMI/BRMS sit under Bakrie below — Salim holds a 25.1% BRMS stake, but
    // Nirwan Bakrie remains the ultimate beneficiary, so they stay Bakrie group.
    tickers: ['INDF', 'ICBP', 'LSIP', 'SIMP', 'DNET', 'AMMN'],
  },
  {
    group: 'Barito Pacific',
    controller: 'Prajogo Pangestu',
    tickers: ['BRPT', 'TPIA', 'BREN', 'CUAN'],
  },
  {
    group: 'Sinar Mas',
    controller: 'Widjaja Family',
    tickers: ['INKP', 'TKIM', 'BSDE', 'SMMA', 'DSSA'],
  },
  {
    group: 'Astra',
    controller: 'Jardine Matheson (via Jardine Cycle & Carriage)',
    tickers: ['ASII', 'UNTR', 'AALI', 'AUTO', 'ASGR'],
  },
  {
    group: 'Emtek',
    controller: 'Sariaatmadja Family',
    tickers: ['EMTK', 'SCMA', 'BUKA', 'SAME'],
  },
  {
    group: 'CT Corp',
    controller: 'Chairul Tanjung',
    tickers: ['MEGA', 'BBHI', 'BOBA'], // BBHI = Allo Bank Indonesia (not "ALLO")
  },
  {
    group: 'Adaro',
    controller: 'Garibaldi "Boy" Thohir',
    tickers: ['ADRO', 'ADMR'],
  },
  {
    group: 'Bakrie',
    controller: 'Bakrie Family',
    tickers: ['BNBR', 'BUMI', 'BRMS', 'ENRG', 'DEWA'],
  },
  {
    group: 'MNC',
    controller: 'Hary Tanoesoedibjo',
    tickers: ['BHIT', 'BMTR', 'MNCN', 'KPIG', 'BCAP'],
  },
];

// ticker -> group descriptor. First group wins if a ticker were ever listed
// under two groups; today each ticker belongs to exactly one.
const TICKER_TO_GROUP = new Map();
for (const g of CONGLOMERATE_GROUPS) {
  for (const t of g.tickers) {
    if (!TICKER_TO_GROUP.has(t)) TICKER_TO_GROUP.set(t, g);
  }
}

export function conglomerateGroup(code) {
  if (!code) return null;
  return TICKER_TO_GROUP.get(code.trim().toUpperCase()) ?? null;
}

// All conglomerate-group tickers, for the Tier-1 universe pre-filter.
export const CONGLOMERATE_TICKERS = new Set(TICKER_TO_GROUP.keys());

// Live Indonesia Stock Exchange data via RapidAPI, proxied through the dev
// server at /idx (the key is injected server-side in vite.config.js, never in
// the browser bundle). The subscribed plan is BASIC with a ~1 request/second
// cap, so every call goes through a serial throttle and a single 429 retry —
// bursting (e.g. a full-universe screen) would otherwise be rejected. These
// surfaces are display-only context; they never feed the locked analysis score.

import { finishIdxActivity, setIdxConfigured, startIdxActivity } from './idxSession';

const BASE = '/idx';
const MIN_INTERVAL_MS = 1200; // stay under the BASIC 1 req/s ceiling

// Foreign vs local comes straight from the API's broker group, no name-matching.
const isForeignGroup = (group) => group === 'BROKER_GROUP_FOREIGN';

// Serial queue: chain each request after the previous one + a fixed gap.
let chain = Promise.resolve();
let lastAt = 0;

function scheduled(fn) {
  const run = async () => {
    const wait = Math.max(0, lastAt + MIN_INTERVAL_MS - Date.now());
    if (wait) await new Promise((r) => setTimeout(r, wait));
    try {
      return await fn();
    } finally {
      lastAt = Date.now();
    }
  };
  const result = chain.then(run, run);
  // Keep the chain alive regardless of individual success/failure.
  chain = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function idxFetch(path) {
  return scheduled(async () => {
    let res = await fetch(`${BASE}${path}`);
    // One polite retry if we still trip the per-second limit.
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, MIN_INTERVAL_MS));
      res = await fetch(`${BASE}${path}`);
    }
    if (!res.ok) {
      let message = `IDX API request failed (HTTP ${res.status})`;
      try {
        const errJson = await res.json();
        if (errJson?.message) message = errJson.message;
      } catch {
        /* body wasn't JSON (e.g. Vercel's own routing error page) — keep the generic message */
      }
      const err = new Error(message);
      err.status = res.status;
      throw err;
    }
    const json = await res.json();
    if (json?.success === false) {
      throw new Error(json?.message || 'IDX API returned an error');
    }
    // Responses wrap as { success, data: { message, data: <payload> } }.
    return json?.data?.data ?? json?.data ?? json;
  });
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// Market-wide broker tape for a session, shaped to match the static
// `brokerContext` in universe.js so it is a drop-in live replacement.
export async function fetchTopBrokers({
  period = 'TB_PERIOD_LAST_1_DAY',
  marketType = 'MARKET_TYPE_ALL',
} = {}) {
  const payload = await idxFetch(
    `/api/market-detector/top-broker?marketType=${marketType}&period=${period}` +
      `&order=ORDER_BY_DESC&sort=TB_SORT_BY_TOTAL_VALUE`,
  );
  const list = Array.isArray(payload?.list) ? payload.list : [];
  if (list.length === 0) throw new Error('IDX broker tape returned no rows');

  const totalValue = list.reduce((a, b) => a + num(b.total_value), 0);
  const totalVolume = list.reduce((a, b) => a + num(b.total_volume), 0);
  const totalFreq = list.reduce((a, b) => a + num(b.total_frequency), 0);
  const foreignValue = list
    .filter((b) => isForeignGroup(b.group))
    .reduce((a, b) => a + num(b.total_value), 0);

  const topByValue = [...list]
    .sort((a, b) => num(b.total_value) - num(a.total_value))
    .slice(0, 5)
    .map((b) => ({
      code: b.code,
      name: b.name,
      value: num(b.total_value),
      foreign: isForeignGroup(b.group),
    }));

  return {
    live: true,
    sessionDate: payload?.date?.idx ?? payload?.date?.to ?? null,
    brokerCount: list.length,
    // Broker totals count both sides of every trade, so turnover ≈ sum / 2.
    turnoverValue: totalValue / 2,
    turnoverVolume: totalVolume / 2,
    totalFreq,
    foreignShare: totalValue > 0 ? foreignValue / totalValue : null,
    topByValue,
  };
}

// Per-ticker broker accumulation/distribution ("bandarmology") for a single
// session. This is the per-stock broker flow the public price feed lacks.
//
// Each (ticker, date) pair is fetched at most once per page load and memoized:
// the data is fixed for a past session, and both the screening top-N re-score
// and the analysis report key off the same (ticker, asOf) pair — so the cache
// turns a repeated 1.2s-throttled round-trip into an instant hit. The promise
// (not the value) is cached so concurrent callers dedupe; failures are evicted
// so a transient error can be retried on the next call.
const bandarCache = new Map();

export function fetchBandarmology(ticker, { date } = {}) {
  const code = String(ticker || '').trim().toUpperCase();
  if (!code || !date) return Promise.reject(new Error('Bandarmology needs a ticker and a date'));

  const key = `${code}|${date}`;
  const cached = bandarCache.get(key);
  if (cached) return cached;

  const pending = fetchBandarmologyUncached(code, date);
  bandarCache.set(key, pending);
  pending.catch(() => bandarCache.delete(key));
  return pending;
}

async function fetchBandarmologyUncached(code, date) {
  const payload = await idxFetch(
    `/api/market-detector/broker-summary/${encodeURIComponent(code)}` +
      `?limit=25&marketBoard=MARKET_BOARD_ALL&transactionType=TRANSACTION_TYPE_NET` +
      `&investorType=INVESTOR_TYPE_ALL&from=${date}&to=${date}`,
  );

  const det = payload?.bandar_detector ?? {};
  const sum = payload?.broker_summary ?? {};
  const buys = Array.isArray(sum.brokers_buy) ? sum.brokers_buy : [];
  const sells = Array.isArray(sum.brokers_sell) ? sum.brokers_sell : [];

  // `type` is "Asing" (foreign) / "Lokal" (local). bval = net buy value (+),
  // sval = net sell value (−).
  const buyer = (b) => ({ code: b.netbs_broker_code, foreign: b.type === 'Asing', value: num(b.bval) });
  const seller = (b) => ({ code: b.netbs_broker_code, foreign: b.type === 'Asing', value: num(b.sval) });

  // Row shape for the broker-action table: both sides as positive magnitudes
  // (the API returns the sell side negative) plus lot and average price.
  // `type` also covers "Pemerintah" (government); foreign only flags "Asing".
  const buyRow = (b) => ({
    code: b.netbs_broker_code,
    foreign: b.type === 'Asing',
    value: Math.abs(num(b.bval)),
    lot: Math.abs(num(b.blot)),
    avg: num(b.netbs_buy_avg_price),
  });
  const sellRow = (b) => ({
    code: b.netbs_broker_code,
    foreign: b.type === 'Asing',
    value: Math.abs(num(b.sval)),
    lot: Math.abs(num(b.slot)),
    avg: num(b.netbs_sell_avg_price),
  });

  return {
    live: true,
    ticker: code,
    date,
    empty: buys.length === 0 && sells.length === 0,
    // Headline accumulation/distribution read for the session.
    accdist: det.broker_accdist ?? null,
    top5Accdist: det.top5?.accdist ?? null,
    top5NetValue: num(det.top5?.amount),
    totalBuyers: det.total_buyer ?? null,
    totalSellers: det.total_seller ?? null,
    sessionValue: num(det.value),
    // The API's own FULL-session buy/sell totals — these are never truncated
    // by the `limit` param the way buyRows/sellRows are, so they are the
    // accurate basis for the W-1 aggregate's net-flow conviction. The rows
    // below are still capped at `limit` for the table view only. Used by
    // aggregateBandarmology to avoid the systematic under-count that summing
    // truncated rows would introduce on liquid tickers.
    detBuyValue: num(det.buy_value),
    detSellValue: num(det.sell_value),
    topBuyers: buys.slice(0, 5).map(buyer),
    topSellers: sells.slice(0, 5).map(seller),
    // Fuller broker tape (up to the API's row limit) for the broker-action table.
    buyRows: buys.map(buyRow),
    sellRows: sells.map(sellRow),
  };
}

// Merge several single-session bandarmology payloads into one aggregate object
// with the SAME shape as a single-day result, so every downstream consumer
// (bandarmologyScoreComponent, the UI sections, the broker table) works
// unchanged. This is the client-side W-1 aggregation path: it's deterministic
// and honest regardless of whether the IDX endpoint would aggregate a date
// range itself (which is undocumented).
//
// Aggregation rules:
//  - Net value per broker is summed across sessions, then re-ranked, so the
//    "top buyers/sellers" reflect the whole week, not one noisy session.
//  - totalBuyers / totalSellers / sessionValue / top5NetValue are summed.
//  - accdist / top5Accdist are re-derived from the summed buyer vs seller
//    totals (the API's per-day string codes can't be meaningfully averaged).
//  - Rows with no net activity after summing are dropped.
//  - `sessions` records how many trading sessions actually contributed, and
//    `dateSpan` gives the inclusive first..last session dates for display.
export function aggregateBandarmology(results) {
  const sessions = results.filter((r) => r && !r.empty);
  if (sessions.length === 0) {
    // All sessions empty — return a single-day-shaped empty marker so callers
    // that check `.empty` still degrade gracefully.
    return {
      live: true,
      ticker: sessions[0]?.ticker ?? null,
      date: null,
      empty: true,
      accdist: null,
      top5Accdist: null,
      top5NetValue: 0,
      totalBuyers: null,
      totalSellers: null,
      sessionValue: 0,
      topBuyers: [],
      topSellers: [],
      buyRows: [],
      sellRows: [],
      sessions: 0,
      dateSpan: null,
      range: true,
    };
  }

  const ticker = sessions[0].ticker;

  // Sum net value per broker code on each side, keyed by `${code}|${foreign}`.
  // buyRows/sellRows carry lot + avg price too; lots are summed and the avg
  // is value-weighted across sessions so it stays representative.
  const buyMap = new Map();
  const sellMap = new Map();
  let sessionValue = 0;
  let totalBuyers = 0;
  let totalSellers = 0;

  for (const r of sessions) {
    sessionValue += r.sessionValue ?? 0;
    if (r.totalBuyers != null) totalBuyers += r.totalBuyers;
    if (r.totalSellers != null) totalSellers += r.totalSellers;

    for (const row of r.buyRows ?? []) {
      const k = `${row.code}|${row.foreign ? 1 : 0}`;
      const prev = buyMap.get(k) ?? { code: row.code, foreign: row.foreign, value: 0, lot: 0, valueForAvg: 0 };
      prev.value += row.value ?? 0;
      prev.lot += row.lot ?? 0;
      // Track value for a value-weighted average price.
      prev.valueForAvg += (row.value ?? 0) * (row.avg ?? 0);
      buyMap.set(k, prev);
    }
    for (const row of r.sellRows ?? []) {
      const k = `${row.code}|${row.foreign ? 1 : 0}`;
      const prev = sellMap.get(k) ?? { code: row.code, foreign: row.foreign, value: 0, lot: 0, valueForAvg: 0 };
      prev.value += row.value ?? 0;
      prev.lot += row.lot ?? 0;
      prev.valueForAvg += (row.value ?? 0) * (row.avg ?? 0);
      sellMap.set(k, prev);
    }
  }

  // Cross-net: a broker who flipped sides across sessions (net buyer one day,
  // net seller another) must be reconciled before finalizing. Without this step
  // they appear in BOTH buyRows and sellRows, making the W-1 table show inflated
  // gross values instead of a true weekly net position.
  for (const [k, buyEntry] of buyMap) {
    const sellEntry = sellMap.get(k);
    if (!sellEntry) continue;
    const net = buyEntry.value - sellEntry.value;
    if (net > 0) {
      // Still a net buyer — keep buy side with net value; preserve their buy avg.
      const buyAvg = buyEntry.value > 0 ? buyEntry.valueForAvg / buyEntry.value : 0;
      buyMap.set(k, {
        ...buyEntry,
        value: net,
        lot: Math.max(0, buyEntry.lot - sellEntry.lot),
        valueForAvg: net * buyAvg,
      });
      sellMap.delete(k);
    } else if (net < 0) {
      // Net seller — keep sell side with net value; preserve their sell avg.
      const sellAvg = sellEntry.value > 0 ? sellEntry.valueForAvg / sellEntry.value : 0;
      sellMap.set(k, {
        ...sellEntry,
        value: -net,
        lot: Math.max(0, sellEntry.lot - buyEntry.lot),
        valueForAvg: -net * sellAvg,
      });
      buyMap.delete(k);
    } else {
      // Exactly balanced across the week — remove from both sides.
      buyMap.delete(k);
      sellMap.delete(k);
    }
  }

  const finalize = (m) =>
    [...m.values()]
      .map((r) => ({ ...r, avg: r.value > 0 ? r.valueForAvg / r.value : 0 }))
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value);
  const buyRows = finalize(buyMap);
  const sellRows = finalize(sellMap);

  // The lightweight top-buyers/sellers shape (code · foreign · value).
  const topBuyers = buyRows.slice(0, 5).map((r) => ({ code: r.code, foreign: r.foreign, value: r.value }));
  const topSellers = sellRows.slice(0, 5).map((r) => ({ code: r.code, foreign: r.foreign, value: r.value }));

  // Re-derive accdist + the net-flow conviction basis from the API's own
  // FULL-session totals (detBuyValue/detSellValue), NOT from the summed
  // buyRows/sellRows. The rows are capped at `limit` per session, so summing
  // them would systematically under-count the long tail of smaller brokers on
  // liquid tickers — the source of the W-1 inaccuracy. The det totals are the
  // API's own aggregates and are never truncated. Falls back to row sums only
  // when a legacy/older payload lacks the det totals.
  let totalBuyValue = sessions.reduce((a, r) => a + (r.detBuyValue ?? 0), 0);
  let totalSellValue = sessions.reduce((a, r) => a + (r.detSellValue ?? 0), 0);
  if (totalBuyValue === 0 && totalSellValue === 0) {
    totalBuyValue = buyRows.reduce((a, b) => a + b.value, 0);
    totalSellValue = sellRows.reduce((a, b) => a + b.value, 0);
  }
  const netFlow = totalBuyValue - totalSellValue;
  const denom = totalBuyValue + totalSellValue;
  const netRatio = denom > 0 ? netFlow / denom : 0;
  const accdist = deriveAccdist(netRatio);
  // Carry the accurate totals so bandarScore can score off them directly
  // rather than re-summing the (truncated) rows.
  const buyTotal = totalBuyValue;
  const sellTotal = totalSellValue;
  const top5NetValue = topBuyers.reduce((a, b) => a + b.value, 0) - topSellers.reduce((a, b) => a + b.value, 0);

  const dates = sessions.map((r) => r.date).filter(Boolean).sort();
  const dateSpan = dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null;

  return {
    live: true,
    ticker,
    // `date` keeps the latest session so IdxBadge etc. show the most recent
    // trading day; dateSpan carries the full inclusive range.
    date: dateSpan?.to ?? null,
    empty: buyRows.length === 0 && sellRows.length === 0,
    accdist,
    top5Accdist: accdist, // same derived read for the top-5 stance
    top5NetValue,
    totalBuyers: totalBuyers > 0 ? totalBuyers : null,
    totalSellers: totalSellers > 0 ? totalSellers : null,
    sessionValue,
    // Accurate full-week buy/sell totals summed from the API's per-session det
    // aggregates (never truncated). bandarScore reads these for net-flow
    // conviction; buyRows/sellRows are for the table display only.
    buyTotal,
    sellTotal,
    topBuyers,
    topSellers,
    buyRows,
    sellRows,
    sessions: sessions.length,
    dateSpan,
    range: true,
  };
}

// Map a net buyer/seller ratio (-1..+1) onto the IDX accdist code convention.
// Symmetric bands so the read is consistent with the per-session codes the UI
// already colors (acc → bullish, dist → bearish).
function deriveAccdist(netRatio) {
  if (netRatio >= 0.3) return 'Big Acc';
  if (netRatio > 0.05) return 'Acc';
  if (netRatio <= -0.3) return 'Big Dist';
  if (netRatio < -0.05) return 'Dist';
  return 'Netral';
}

// Fetch bandarmology over the trailing `sessionCount` trading sessions ending
// at (or before) `asOfDate`, aggregating client-side into a single W-1-style
// read. `tradingSessions` is the list of available session date strings (from
// the chart candles) on/before `asOfDate`; we fetch the last `sessionCount` of
// them. Falls back gracefully: if fewer sessions exist, it uses what's there;
// if every fetch fails, it resolves to an empty aggregate so callers degrade.
//
// Memoized per (ticker, joined-session-key) so repeated calls for the same
// week are instant.
const rangeCache = new Map();

export function fetchBandarmologyRange(ticker, { asOfDate, tradingSessions, sessionCount = 5 } = {}) {
  const code = String(ticker || '').trim().toUpperCase();
  if (!code || !asOfDate) {
    return Promise.reject(new Error('Bandarmology range needs a ticker and an as-of date'));
  }
  if (!Array.isArray(tradingSessions) || tradingSessions.length === 0) {
    return Promise.reject(new Error('Bandarmology range needs the available trading sessions'));
  }

  // Resolve the trailing N sessions on or before the as-of date.
  const onOrBefore = tradingSessions.filter((d) => d <= asOfDate).sort();
  const window = onOrBefore.slice(-Math.max(1, Math.min(sessionCount, onOrBefore.length)));

  const cacheKey = `${code}|${window.join(',')}`;
  const cached = rangeCache.get(cacheKey);
  if (cached) return cached;

  const pending = (async () => {
    // Fetch each session in parallel; the shared serial throttle in idxFetch
    // keeps us under the BASIC plan's ~1 req/s ceiling, so this resolves in
    // roughly window.length × ~1.2s. Each failure degrades independently.
    const settled = await Promise.allSettled(window.map((d) => fetchBandarmology(code, { date: d })));
    const results = settled
      .filter((s) => s.status === 'fulfilled')
      .map((s) => s.value);
    if (results.length === 0) {
      throw new Error('Every bandarmology session in the window failed');
    }
    return aggregateBandarmology(results);
  })();
  rangeCache.set(cacheKey, pending);
  pending.catch(() => rangeCache.delete(cacheKey));
  return pending;
}

// Live health check for the IDX proxy: a real round-trip through /idx ->
// api/idx.js -> RapidAPI, so "configured" reflects the server-side
// IDX_RAPIDAPI_KEY rather than anything visible to the browser.
export async function checkIdxHealth() {
  const activityId = startIdxActivity({
    source: 'IDX',
    title: 'Live IDX health check started',
    summary: 'Requesting the market-wide broker tape through the IDX proxy.',
  });

  try {
    const data = await fetchTopBrokers();
    setIdxConfigured(true);
    finishIdxActivity(activityId, {
      source: 'IDX',
      title: 'Live IDX health check passed',
      summary: `Broker tape returned ${data.brokerCount} brokers for session ${data.sessionDate ?? 'n/a'}.`,
      evidence: {
        sections: [
          {
            title: 'Request',
            facts: [
              { label: 'Endpoint', value: `${BASE}/api/market-detector/top-broker` },
              { label: 'Brokers returned', value: data.brokerCount },
              { label: 'Session date', value: data.sessionDate ?? 'n/a' },
            ],
          },
        ],
      },
    });
    return { active: true, configured: true };
  } catch (error) {
    // A 500 specifically means the proxy ran but the env var is unset server-side.
    const missingKey = error.status === 500 && /IDX_RAPIDAPI_KEY/.test(error.message || '');
    setIdxConfigured(!missingKey);
    finishIdxActivity(activityId, {
      source: 'IDX',
      title: 'Live IDX health check failed',
      summary: error.message || 'The IDX proxy did not respond successfully.',
      error,
    });
    return { active: false, configured: !missingKey, error: error.message || String(error) };
  }
}

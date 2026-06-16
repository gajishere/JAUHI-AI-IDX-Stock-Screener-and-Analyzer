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
    topBuyers: buys.slice(0, 5).map(buyer),
    topSellers: sells.slice(0, 5).map(seller),
    // Fuller broker tape (up to the API's row limit) for the broker-action table.
    buyRows: buys.map(buyRow),
    sellRows: sells.map(sellRow),
  };
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

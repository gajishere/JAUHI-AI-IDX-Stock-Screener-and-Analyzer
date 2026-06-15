// Market data access for IDX-listed equities via Yahoo Finance
// (IDX tickers carry the .JK suffix). Requests go through the Vite
// dev-server proxy at /yf to avoid CORS.

const BASE = '/yf';

function toSymbol(code) {
  return `${code.trim().toUpperCase()}.JK`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Yahoo rate-limits (429) and occasionally 5xx-hiccups under the burst load of
// a full-universe screen. Retry with exponential backoff + jitter so a
// transient throttle doesn't silently drop a name (the root cause of screens
// returning 0–1 results on the user's network). Resolves to the final Response.
export async function resilientFetch(url, { retries = 3, baseDelay = 350 } = {}) {
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(url);
    } catch (err) {
      if (attempt >= retries) throw err;
      await sleep(baseDelay * 2 ** attempt + Math.random() * 250);
      continue;
    }
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      await sleep(baseDelay * 2 ** attempt + Math.random() * 250);
      continue;
    }
    return res;
  }
}

// Daily OHLCV history for any Yahoo symbol as-is (indices, FX, etc.) —
// e.g. "^JKSE", "IDR=X", "DX-Y.NYB". Candle dates render in Asia/Jakarta time.
export async function fetchSymbolChart(symbol, range = '1y') {
  const url = `${BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`;
  const res = await resilientFetch(url);
  if (!res.ok && res.status !== 404) {
    throw new Error(`Market data request failed (HTTP ${res.status})`);
  }
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) {
    const reason = json?.chart?.error?.description;
    throw new Error(reason || `No data found for "${symbol}"`);
  }

  const quote = result.indicators?.quote?.[0] ?? {};
  const dateFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const candles = (result.timestamp ?? [])
    .map((ts, i) => ({
      date: dateFmt.format(new Date(ts * 1000)),
      open: quote.open?.[i],
      high: quote.high?.[i],
      low: quote.low?.[i],
      close: quote.close?.[i],
      volume: quote.volume?.[i],
    }))
    .filter((c) => c.close != null && c.high != null && c.low != null);

  if (candles.length === 0) {
    throw new Error(`No trading history available for "${symbol}"`);
  }

  return {
    symbol,
    name: result.meta?.longName || result.meta?.shortName || null,
    currency: result.meta?.currency ?? null,
    fiftyTwoWeekHigh: result.meta?.fiftyTwoWeekHigh ?? null,
    fiftyTwoWeekLow: result.meta?.fiftyTwoWeekLow ?? null,
    candles,
  };
}

// IDX-listed equities carry the .JK suffix and default to IDR.
export async function fetchChart(code, range = '1y') {
  try {
    const chart = await fetchSymbolChart(toSymbol(code), range);
    return { ...chart, currency: chart.currency ?? 'IDR' };
  } catch (err) {
    // Preserve the IDX-flavoured "no listing" message for unknown tickers.
    if (/No data found/.test(err.message)) {
      throw new Error(`No IDX listing found for "${code.toUpperCase()}"`, { cause: err });
    }
    throw err;
  }
}

function latestPoint(series, key) {
  const rows = (series?.[key] ?? []).filter((r) => r?.reportedValue?.raw != null);
  return rows.length ? rows[rows.length - 1] : null;
}

// Trailing-twelve-month dividend per share from the chart endpoint's dividend
// events (the only no-crumb surface that carries them). Returns 0 when a name
// pays nothing in the trailing year, or null on a fetch failure.
async function fetchTrailingDividendPerShare(symbol) {
  try {
    const res = await resilientFetch(
      `${BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d&events=div`
    );
    if (!res.ok) return null;
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return null;
    const divs = result.events?.dividends;
    if (!divs) return 0;
    const cutoff = Math.floor(Date.now() / 1000) - 365 * 24 * 3600;
    let sum = 0;
    for (const d of Object.values(divs)) {
      if (d?.date != null && d.date >= cutoff && Number.isFinite(d.amount)) sum += d.amount;
    }
    return sum;
  } catch {
    return null;
  }
}

// Distinct calendar years (Asia/Jakarta) in which a name paid a dividend, over
// the trailing ~10 years, sorted ascending. Used by the Conglomerate screen to
// check dividend consistency. Returns [] when nothing was paid, null on failure.
async function fetchDividendCalendarYears(symbol) {
  try {
    const res = await resilientFetch(
      `${BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?range=10y&interval=1mo&events=div`
    );
    if (!res.ok) return null;
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return null;
    const divs = result.events?.dividends;
    if (!divs) return [];
    const yearFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric' });
    const years = new Set();
    for (const d of Object.values(divs)) {
      if (d?.date != null && Number.isFinite(d.amount) && d.amount > 0) {
        years.add(Number(yearFmt.format(new Date(d.date * 1000))));
      }
    }
    return [...years].sort((a, b) => a - b);
  } catch {
    return null;
  }
}

// Longest run of consecutive dividend years ending at the most recent one.
// e.g. [2018,2019,2021,2022,2023,2024] -> 4 (2021..2024). Stale histories that
// stopped paying years ago therefore score low even if they once paid yearly.
function consecutiveDividendYearsEndingLatest(years) {
  if (!years || years.length === 0) return 0;
  let run = 1;
  for (let i = years.length - 1; i > 0; i--) {
    if (years[i] - years[i - 1] === 1) run++;
    else break;
  }
  return run;
}

// Fundamental figures from Yahoo's fundamentals-timeseries endpoint
// (works without auth, unlike quoteSummary), plus trailing dividends from the
// chart endpoint. Returns null on any failure so the analysis can degrade
// gracefully. Valuation ratios (PER/PBV) are trailing; profitability (ROE/ROA)
// and growth (revenue/net-profit) come from the latest two annual reports.
// Pass { dividendHistory: true } to also resolve multi-year dividend
// consistency (one extra fetch) for the Conglomerate screen.
export async function fetchFundamentals(code, { dividendHistory = false } = {}) {
  try {
    const symbol = toSymbol(code);
    const now = Math.floor(Date.now() / 1000);
    const fourYearsAgo = now - 4 * 365 * 24 * 3600;
    const types = [
      'annualTotalRevenue',
      'annualDilutedEPS',
      'annualTotalDebt',
      'annualStockholdersEquity',
      'annualNetIncome',
      'annualTotalAssets',
      'trailingPeRatio',
      'trailingPbRatio',
    ].join(',');
    const url =
      `${BASE}/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}` +
      `?type=${types}&period1=${fourYearsAgo}&period2=${now}`;
    // Fundamentals + trailing dividends (and, for the Conglomerate screen,
    // multi-year dividend history) fetched together; any may fail independently
    // without sinking the others.
    const [res, dividendPerShare, dividendYears] = await Promise.all([
      fetch(url),
      fetchTrailingDividendPerShare(symbol),
      dividendHistory ? fetchDividendCalendarYears(symbol) : Promise.resolve(null),
    ]);
    if (!res.ok) return null;
    const json = await res.json();
    const results = json?.timeseries?.result;
    if (!Array.isArray(results)) return null;

    const byType = {};
    for (const entry of results) {
      const type = entry?.meta?.type?.[0];
      if (type) byType[type] = entry;
    }

    const revenues = (byType.annualTotalRevenue?.annualTotalRevenue ?? []).filter(
      (r) => r?.reportedValue?.raw != null
    );
    const netIncomes = (byType.annualNetIncome?.annualNetIncome ?? []).filter(
      (r) => r?.reportedValue?.raw != null
    );
    const eps = latestPoint(byType.annualDilutedEPS, 'annualDilutedEPS');
    const debt = latestPoint(byType.annualTotalDebt, 'annualTotalDebt');
    const equity = latestPoint(byType.annualStockholdersEquity, 'annualStockholdersEquity');
    const assets = latestPoint(byType.annualTotalAssets, 'annualTotalAssets');
    const pe = latestPoint(byType.trailingPeRatio, 'trailingPeRatio');
    const pb = latestPoint(byType.trailingPbRatio, 'trailingPbRatio');

    const yoyGrowth = (series) => {
      if (series.length < 2) return null;
      const prev = series[series.length - 2].reportedValue.raw;
      const last = series[series.length - 1].reportedValue.raw;
      return prev > 0 ? (last - prev) / prev : null;
    };

    const revenueGrowth = yoyGrowth(revenues);
    const netProfitGrowth = yoyGrowth(netIncomes);

    let debtToEquity = null;
    if (debt && equity && equity.reportedValue.raw > 0) {
      debtToEquity = debt.reportedValue.raw / equity.reportedValue.raw;
    }

    const netIncome = netIncomes.length ? netIncomes[netIncomes.length - 1].reportedValue.raw : null;
    let roe = null;
    if (netIncome != null && equity && equity.reportedValue.raw > 0) {
      roe = netIncome / equity.reportedValue.raw;
    }
    let roa = null;
    if (netIncome != null && assets && assets.reportedValue.raw > 0) {
      roa = netIncome / assets.reportedValue.raw;
    }

    const epsRaw = eps?.reportedValue.raw ?? null;
    // Payout = dividend per share / EPS (only meaningful for positive earnings).
    const payoutRatio =
      dividendPerShare != null && epsRaw != null && epsRaw > 0
        ? dividendPerShare / epsRaw
        : null;

    const fundamentals = {
      eps: epsRaw,
      epsAsOf: eps?.asOfDate ?? null,
      per: pe?.reportedValue.raw ?? null,
      pbv: pb?.reportedValue.raw ?? null,
      revenueGrowth,
      netProfitGrowth,
      debtToEquity,
      roe,
      roa,
      netIncome,
      dividendPerShare: dividendPerShare ?? null,
      payoutRatio,
      dividendYears: dividendYears ?? null,
      consecutiveDividendYears:
        dividendYears != null ? consecutiveDividendYearsEndingLatest(dividendYears) : null,
    };

    const hasAny = Object.values(fundamentals).some((v) => v != null);
    return hasAny ? fundamentals : null;
  } catch {
    return null;
  }
}

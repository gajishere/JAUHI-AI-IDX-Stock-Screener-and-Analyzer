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

// Fundamental figures from Yahoo's fundamentals-timeseries endpoint
// (works without auth, unlike quoteSummary). Returns null on any failure
// so the analysis can degrade gracefully.
export async function fetchFundamentals(code) {
  try {
    const symbol = toSymbol(code);
    const now = Math.floor(Date.now() / 1000);
    const fourYearsAgo = now - 4 * 365 * 24 * 3600;
    const types = [
      'annualTotalRevenue',
      'annualDilutedEPS',
      'annualTotalDebt',
      'annualStockholdersEquity',
      'trailingPeRatio',
    ].join(',');
    const url =
      `${BASE}/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}` +
      `?type=${types}&period1=${fourYearsAgo}&period2=${now}`;
    const res = await fetch(url);
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
    const eps = latestPoint(byType.annualDilutedEPS, 'annualDilutedEPS');
    const debt = latestPoint(byType.annualTotalDebt, 'annualTotalDebt');
    const equity = latestPoint(byType.annualStockholdersEquity, 'annualStockholdersEquity');
    const pe = latestPoint(byType.trailingPeRatio, 'trailingPeRatio');

    let revenueGrowth = null;
    if (revenues.length >= 2) {
      const prev = revenues[revenues.length - 2].reportedValue.raw;
      const last = revenues[revenues.length - 1].reportedValue.raw;
      if (prev > 0) revenueGrowth = (last - prev) / prev;
    }

    let debtToEquity = null;
    if (debt && equity && equity.reportedValue.raw > 0) {
      debtToEquity = debt.reportedValue.raw / equity.reportedValue.raw;
    }

    const fundamentals = {
      eps: eps?.reportedValue.raw ?? null,
      epsAsOf: eps?.asOfDate ?? null,
      per: pe?.reportedValue.raw ?? null,
      revenueGrowth,
      debtToEquity,
    };

    const hasAny = Object.values(fundamentals).some((v) => v != null);
    return hasAny ? fundamentals : null;
  } catch {
    return null;
  }
}

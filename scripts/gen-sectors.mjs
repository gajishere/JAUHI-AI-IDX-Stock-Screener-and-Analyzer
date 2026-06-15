// One-time generator: enrich src/data/emiten.js with `sector` + `industry`.
//
// The source spreadsheet (emiten-data.xlsx) carries no sector column, so we
// pull GICS-style sector/industry from Yahoo's `search` endpoint — the only
// Yahoo surface that returns it without the locked quoteSummary crumb. Results
// are cached to scripts/.sector-cache.json so re-runs resume instead of
// re-fetching the whole ~950-name universe.
//
// Run:  node scripts/gen-sectors.mjs

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EMITEN_PATH = resolve(__dirname, '../src/data/emiten.js');
const CACHE_PATH = resolve(__dirname, '.sector-cache.json');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const CONCURRENCY = 6;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function loadEmiten() {
  // emiten.js is `export const emiten = [ ...JSON... ];` — slice the array out.
  const src = await readFile(EMITEN_PATH, 'utf8');
  const start = src.indexOf('[');
  const end = src.lastIndexOf(']');
  return JSON.parse(src.slice(start, end + 1));
}

async function loadCache() {
  if (!existsSync(CACHE_PATH)) return {};
  try {
    return JSON.parse(await readFile(CACHE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

async function fetchSector(code) {
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(`${code}.JK`)}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (res.status === 429 || res.status >= 500) {
        await sleep(500 * 2 ** attempt + Math.random() * 300);
        continue;
      }
      if (!res.ok) return { sector: null, industry: null };
      const json = await res.json();
      const hit = (json.quotes ?? []).find((q) => q.symbol === `${code}.JK`) ?? (json.quotes ?? [])[0];
      return {
        sector: hit?.sector ?? null,
        industry: hit?.industry ?? null,
      };
    } catch {
      await sleep(500 * 2 ** attempt + Math.random() * 300);
    }
  }
  return { sector: null, industry: null };
}

async function mapLimit(items, limit, fn) {
  let next = 0;
  let done = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (next < items.length) {
      const idx = next++;
      await fn(items[idx], idx);
      done++;
      if (done % 25 === 0) process.stdout.write(`  ${done}/${items.length}\n`);
    }
  });
  await Promise.all(workers);
}

async function main() {
  const emiten = await loadEmiten();
  const cache = await loadCache();
  console.log(`Loaded ${emiten.length} emiten; ${Object.keys(cache).length} already cached.`);

  const todo = emiten.filter((e) => !cache[e.code]);
  console.log(`Fetching sector for ${todo.length} names (concurrency ${CONCURRENCY})...`);

  let saveCounter = 0;
  await mapLimit(todo, CONCURRENCY, async (e) => {
    cache[e.code] = await fetchSector(e.code);
    // Periodically flush the cache so a crash mid-run loses little progress.
    if (++saveCounter % 50 === 0) await writeFile(CACHE_PATH, JSON.stringify(cache));
  });
  await writeFile(CACHE_PATH, JSON.stringify(cache));

  const enriched = emiten.map((e) => ({
    ...e,
    sector: cache[e.code]?.sector ?? null,
    industry: cache[e.code]?.industry ?? null,
  }));

  const withSector = enriched.filter((e) => e.sector).length;
  const header =
    '// Auto-generated from emiten-data.xlsx — the full IDX listing universe.\n' +
    '// code, company name, listing date (ISO), shares outstanding, listing board,\n' +
    '// plus sector + industry enriched from Yahoo search (see scripts/gen-sectors.mjs).\n' +
    'export const emiten = ';
  await writeFile(EMITEN_PATH, `${header}${JSON.stringify(enriched)};\n`, 'utf8');

  console.log(`Done. ${withSector}/${enriched.length} have a sector; wrote ${EMITEN_PATH}`);
  const sectors = [...new Set(enriched.map((e) => e.sector).filter(Boolean))].sort();
  console.log(`Distinct sectors (${sectors.length}):\n  ${sectors.join('\n  ')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

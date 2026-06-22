// Market-hours gate for the live auto-screening feature.
//
// Everything here is computed in Asia/Jakarta (WIB, UTC+7) REGARDLESS of where
// the code runs — the browser of a visitor in another timezone, a Vercel
// serverless function (UTC), or a GitHub Actions runner (UTC). We never read the
// host clock's local time; we always project `now` into WIB via Intl, so the
// schedule is identical everywhere.
//
// The schedule is an explicit list of WIB clock slots, every 15 minutes across
// the active trading window (matching a 15-minute external cron so each fire
// produces a real scan, not a deduped no-op):
//   08:00–08:45  pre-market scans (must run unattended)
//   09:00–12:00  session 1, every 15 min; 12:00 is the session-1 close AND the
//                single lunch read — data freezes during the 12:00–13:30 break,
//                so there are NO slots until 13:30 (lunch crons harmlessly no-op
//                rather than re-scanning identical frozen data)
//   13:30–15:15  session 2, every 15 min
//   15:30        pre-close scan — the day's LAST scan ("what to hold overnight");
//                16:00 is the close, so a later scan would be too late.
//
// Both the server gate (api/auto-screen-run.js) and the page's status badge /
// countdown read from this module so they can never disagree.

import { isMarketHoliday } from '../data/idxHolidays.js';

const TZ = 'Asia/Jakarta';

// The day's scan slots in WIB, as 'HH:MM' strings. Order matters (ascending).
export const SCAN_SLOTS = [
  '08:00', '08:15', '08:30', '08:45',
  '09:00', '09:15', '09:30', '09:45',
  '10:00', '10:15', '10:30', '10:45',
  '11:00', '11:15', '11:30', '11:45',
  '12:00', // session-1 close + single lunch read; data freezes until 13:30
  '13:30', '13:45',
  '14:00', '14:15', '14:30', '14:45',
  '15:00', '15:15', '15:30',
];

// Session boundaries in minutes-since-midnight (WIB).
const T = (hm) => {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
};
const PRE_OPEN = T('08:00');
const S1_OPEN = T('09:00');
const S1_CLOSE = T('12:00');
const LUNCH_END = T('13:30');
const S2_OPEN = T('13:30');
const CLOSE = T('16:00');

const SLOT_MINUTES = SCAN_SLOTS.map(T);
const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// Project a Date into WIB wall-clock parts, independent of the host timezone.
// Returns { dateStr:'YYYY-MM-DD', hm:'HH:MM', minutes, weekday:0..6, hour, minute }.
export function wibNow(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  }).formatToParts(now);

  const get = (type) => parts.find((p) => p.type === type)?.value ?? '';
  const year = get('year');
  const month = get('month');
  const day = get('day');
  let hour = parseInt(get('hour'), 10);
  if (hour === 24) hour = 0; // some engines emit '24' at midnight
  const minute = parseInt(get('minute'), 10);
  const weekday = WEEKDAY_INDEX[get('weekday')] ?? new Date(now).getUTCDay();

  return {
    dateStr: `${year}-${month}-${day}`,
    hm: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    minutes: hour * 60 + minute,
    weekday,
    hour,
    minute,
  };
}

// A trading day = Mon–Fri and not an IDX holiday. `dateStr` is a WIB 'YYYY-MM-DD';
// when omitted we use today in WIB.
export function isTradingDay(dateStr) {
  const d = dateStr ?? wibNow().dateStr;
  if (isMarketHoliday(d)) return false;
  return !isWeekend(d);
}

// Weekday of a WIB date, derived from a midday-WIB instant so DST/offset quirks
// can't tip it to the wrong day.
function weekdayOf(dateStr) {
  const label = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' })
    .format(new Date(`${dateStr}T12:00:00+07:00`));
  return WEEKDAY_INDEX[label] ?? 0;
}

function isWeekend(dateStr) {
  const wd = weekdayOf(dateStr);
  return wd === 0 || wd === 6; // Sun / Sat
}

// Coarse market phase for the status badge.
//   'pre-market' | 'session-1' | 'lunch-break' | 'session-2' | 'closed'
export function marketStatus(now = new Date()) {
  const w = wibNow(now);
  if (!isTradingDay(w.dateStr)) return 'closed';
  const m = w.minutes;
  if (m >= PRE_OPEN && m < S1_OPEN) return 'pre-market';
  if (m >= S1_OPEN && m < S1_CLOSE) return 'session-1';
  if (m >= S1_CLOSE && m < LUNCH_END) return 'lunch-break';
  if (m >= S2_OPEN && m < CLOSE) return 'session-2';
  return 'closed';
}

export function isMarketOpen(now = new Date()) {
  const s = marketStatus(now);
  return s === 'session-1' || s === 'session-2';
}

// What kind of scan a given slot ('HH:MM') represents.
export function scanTypeForSlot(hm) {
  if (hm < '09:00') return 'pre-market'; // 08:00–08:45, before the session-1 open
  if (hm === '15:30') return 'pre-close';
  return 'intraday';
}

// The scan slot that "owns" the current moment: the latest slot whose start is
// at or before `now`, provided we're still inside that slot's window (before the
// next slot starts, or before the 16:00 close for the final 15:30 slot).
//
// This is deliberately drift-TOLERANT. GitHub Actions scheduled crons routinely
// fire 10–40 min late (the top-of-hour batch is the most congested), so a tight
// ±5-min grace silently dropped the 08:00 scan whenever the runner was delayed.
// With slot ownership, a late 08:00 cron arriving any time before 09:00 still
// resolves to the 08:00 slot. The run endpoint dedups by slot+date so this never
// double-scans, and firing extra cron ticks per slot just no-ops harmlessly.
// Returns the matched slot info, or null. Always null on non-trading days.
export function owningScanSlot(now = new Date()) {
  const w = wibNow(now);
  if (!isTradingDay(w.dateStr)) return null;
  let owned = null;
  for (let i = 0; i < SCAN_SLOTS.length; i++) {
    if (w.minutes < SLOT_MINUTES[i]) break; // slots are ascending — nothing later owns us
    const windowEnd = i + 1 < SLOT_MINUTES.length ? SLOT_MINUTES[i + 1] : CLOSE;
    if (w.minutes < windowEnd) {
      const hm = SCAN_SLOTS[i];
      owned = { slot: hm, scanType: scanTypeForSlot(hm), wib: w };
    }
  }
  return owned;
}

// Back-compat alias: callers that just want "which slot are we in" get the
// drift-tolerant owning slot. (The old ±grace matcher is gone — it was the bug.)
export function currentScanSlot(now = new Date()) {
  return owningScanSlot(now);
}

export function isScanSlot(now = new Date()) {
  return owningScanSlot(now) != null;
}

// The next scan slot strictly after `now`, with minutes until it. If no slots
// remain today (or today isn't a trading day), returns the next trading day's
// 08:00 with a cross-midnight `minutesUntil`. Used for the page countdown.
export function nextScanSlot(now = new Date()) {
  const w = wibNow(now);
  if (isTradingDay(w.dateStr)) {
    for (let i = 0; i < SCAN_SLOTS.length; i++) {
      if (SLOT_MINUTES[i] > w.minutes) {
        const hm = SCAN_SLOTS[i];
        return {
          slot: hm,
          dateStr: w.dateStr,
          scanType: scanTypeForSlot(hm),
          minutesUntil: SLOT_MINUTES[i] - w.minutes,
        };
      }
    }
  }
  // No slots remain today (or today isn't a trading day): roll to the next
  // trading day's 08:00. minutesUntil spans the rest of today + whole days in
  // between + the 08:00 offset on the target day.
  const next = nextTradingDay(w.dateStr);
  const minutesUntil = (1440 - w.minutes) + (next.daysAhead - 1) * 1440 + PRE_OPEN;
  return {
    slot: '08:00',
    dateStr: next.dateStr,
    scanType: 'pre-market',
    minutesUntil: Math.max(0, minutesUntil),
  };
}

// Walk forward from `dateStr` to the next trading day (starting tomorrow).
// Returns { dateStr, daysAhead } where daysAhead >= 1.
function nextTradingDay(dateStr) {
  for (let offset = 1; offset <= 14; offset++) {
    const cand = addDays(dateStr, offset);
    if (isTradingDay(cand)) return { dateStr: cand, daysAhead: offset };
  }
  return { dateStr: addDays(dateStr, 1), daysAhead: 1 }; // safety fallback
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T05:00:00+07:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

// Server-side gate decision in one call: should a scan run right now?
// Returns { ok, reason, slot?, scanType?, dateStr }.
export function shouldScanNow(now = new Date()) {
  const w = wibNow(now);
  if (!isTradingDay(w.dateStr)) {
    return { ok: false, reason: 'not-a-trading-day', dateStr: w.dateStr };
  }
  const slot = owningScanSlot(now);
  if (!slot) {
    return { ok: false, reason: 'not-a-scan-slot', dateStr: w.dateStr, hm: w.hm };
  }
  return { ok: true, reason: 'scan-slot', slot: slot.slot, scanType: slot.scanType, dateStr: w.dateStr };
}

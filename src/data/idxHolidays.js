// IDX (Bursa Efek Indonesia) trading holidays — "libur bursa".
//
// The auto-screening gate treats any date in this set as a non-trading day, so
// no scan runs and the page falls back to the last snapshot. Weekends are
// handled separately in marketHours.js; only put actual IDX holiday closures
// here (national holidays + cuti bersama + the BEI year-end closing days).
//
// ┌─────────────────────────────────────────────────────────────────────────┐
// │ ⚠  MUST BE VERIFIED / REFRESHED EACH YEAR against the official source.   │
// │    BEI publishes the "Hari Libur Bursa" calendar annually, derived from  │
// │    the government SKB (Surat Keputusan Bersama) on national holidays +   │
// │    cuti bersama. Movable Islamic/Christian dates (Idul Fitri, Idul Adha, │
// │    Nyepi, Waisak, Isra Mikraj, Maulid, Good Friday, Ascension, Imlek)    │
// │    shift every year — do NOT trust these dates blindly.                  │
// │    Source: https://www.idx.co.id  →  "Kalender Libur Bursa"              │
// │    Official decree: Peng-00171/BEI.POP/09-2025 (announced Sep 23, 2025)  │
// └─────────────────────────────────────────────────────────────────────────┘
//
// Dates are WIB calendar dates in 'YYYY-MM-DD' form.

// 2026 list verified against BEI official announcement Peng-00171/BEI.POP/09-2025.
// 22 bursa-holiday weekdays → 261 − 22 = 239 trading days (matches official count).
const HOLIDAYS_2026 = [
  // ── January ───────────────────────────────────────────────────────────────
  '2026-01-01', // Tahun Baru Masehi (New Year's Day) — fixed
  '2026-01-16', // Isra Mikraj Nabi Muhammad SAW 1447H

  // ── February ──────────────────────────────────────────────────────────────
  '2026-02-16', // Cuti Bersama Tahun Baru Imlek 2577 Kongzili
  '2026-02-17', // Tahun Baru Imlek 2577 Kongzili (Chinese New Year)

  // ── March — Nyepi + Idul Fitri block (7 consecutive weekdays off) ─────────
  '2026-03-18', // Cuti Bersama Hari Suci Nyepi
  '2026-03-19', // Hari Suci Nyepi Tahun Baru Saka 1948
  '2026-03-20', // Cuti Bersama Idul Fitri 1447H
  // Idul Fitri 1 & 2 Syawal: Sat 21 + Sun 22 Mar — weekend, no separate entry
  '2026-03-23', // Cuti Bersama Idul Fitri 1447H
  '2026-03-24', // Cuti Bersama Idul Fitri 1447H

  // ── April ─────────────────────────────────────────────────────────────────
  '2026-04-03', // Wafat Yesus Kristus (Good Friday)

  // ── May ───────────────────────────────────────────────────────────────────
  '2026-05-01', // Hari Buruh Internasional (Labour Day) — fixed
  '2026-05-14', // Kenaikan Yesus Kristus (Ascension of Christ)
  '2026-05-15', // Cuti Bersama Kenaikan Yesus Kristus
  '2026-05-27', // Hari Raya Idul Adha 1447H
  '2026-05-28', // Cuti Bersama Idul Adha 1447H

  // ── June ──────────────────────────────────────────────────────────────────
  '2026-06-01', // Hari Lahir Pancasila (Pancasila Day) — fixed
  '2026-06-16', // Tahun Baru Islam 1 Muharram 1448H (Islamic New Year)

  // ── July – November: no bursa holidays ───────────────────────────────────

  // ── August ────────────────────────────────────────────────────────────────
  '2026-08-17', // Hari Proklamasi Kemerdekaan RI (Independence Day) — fixed
  '2026-08-25', // Maulid Nabi Muhammad SAW 1448H

  // ── December ──────────────────────────────────────────────────────────────
  '2026-12-24', // Cuti Bersama Hari Natal (Christmas joint leave)
  '2026-12-25', // Hari Natal (Christmas Day) — fixed
  '2026-12-31', // Libur Bursa Akhir Tahun (BEI year-end closing)
];

// Per-year sets keyed by 'YYYY'. Add new years here as BEI publishes them.
const HOLIDAY_SETS = {
  2026: new Set(HOLIDAYS_2026),
};

// True if `dateStr` ('YYYY-MM-DD', WIB) is a published IDX trading holiday.
// Unknown years return false (the weekday gate still applies) — but a missing
// year means the calendar is stale and SHOULD be filled in.
export function isMarketHoliday(dateStr) {
  if (typeof dateStr !== 'string' || dateStr.length < 4) return false;
  const set = HOLIDAY_SETS[dateStr.slice(0, 4)];
  return set ? set.has(dateStr) : false;
}

// Exposed so callers (e.g. an admin/status page) can detect a stale calendar.
export function hasHolidayCalendar(year) {
  return Object.prototype.hasOwnProperty.call(HOLIDAY_SETS, String(year));
}

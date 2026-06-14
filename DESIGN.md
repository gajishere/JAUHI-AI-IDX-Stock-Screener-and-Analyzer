# Design

Visual system for the IDX Stock Analysis & Screening app. Register: **product** (the design serves the analysis workflow). Mood: *weekend equity research desk — printed note, amber bookmark, clinical restraint*. The interface should read like a well-typeset research report, never like a trading terminal.

## Theme

Light. Pure white ground — warmth is carried by the brand color and typography, never by tinting the paper.

## Color

All tokens are OKLCH, defined in `tailwind.config.js`. Strategy: **Restrained** — neutrals plus one brand accent; semantic color appears only where it carries a verdict.

| Token | Value | Role |
|---|---|---|
| `paper` | `oklch(1 0 0)` | Body background (pure white, never tinted) |
| `well` | `oklch(0.967 0.003 48)` | Quiet fills (file buttons, muted pills) |
| `well-2` | `oklch(0.93 0.005 48)` | Deeper fill (skeletons) |
| `line` | `oklch(0.885 0.004 48)` | Hairlines, borders, dotted leaders |
| `ink` | `oklch(0.235 0.012 48)` | Body text (16.8:1 on paper) |
| `ink-muted` | `oklch(0.47 0.015 48)` | Secondary text (6.9:1) |
| `brand` | `oklch(0.52 0.13 47)` | Burnt amber — primary actions, active tab, focus, selection. Always white text on fills. |
| `brand-deep` | `oklch(0.44 0.11 47)` | Brand hover/active |
| `brand-tint` | `oklch(0.96 0.018 47)` | Selected-state fill, brand pills |
| `info` / `info-tint` | `oklch(0.40 0.06 200)` | Deep teal — neutral informational pills (confidence) |
| `pos` / `pos-tint` | `oklch(0.49 0.105 155)` | Gains, buys, A-ratings, bullish |
| `neg` / `neg-tint` | `oklch(0.5 0.16 27)` | Losses, sells, stops, C-ratings, avoid |
| `warn` / `warn-tint` | `oklch(0.5 0.1 80)` | Ochre — B-ratings, neutral bias, caution |

Rules: color is a verdict, not decoration. Gains/losses always carry a `+`/`−` sign or label in addition to color. Rating tone mapping lives in `src/components/reportStyles.js` (`ratingTone`: A→pos, B→warn, else neg).

## Typography

| Family | Use |
|---|---|
| **Newsreader** (serif) | Report headings, masthead, ticker symbols in reports, large rating figures. Medium weight, tight tracking on display sizes. |
| **IBM Plex Sans** | UI, labels, body, buttons (400/500/600) |
| **IBM Plex Mono** | Figures, prices, dates, kickers, scores — always with `tabular-nums` |

Loaded from Google Fonts in `index.html`. Fixed rem scale (no fluid clamp). Section headings are sentence case — never ALL CAPS (anti-Bloomberg). `text-wrap: balance` on h1–h3, `pretty` on prose (set in `index.css`).

## Layout

- Single centered column, `max-w-4xl`, `px-5`. Reports read like documents; tables may scroll horizontally inside it.
- Sections separate with hairline rules (`border-t border-line`), not cards. No nested cards anywhere.
- The signature data element is the **dotted-leader row** (`Row` in `src/components/report.jsx`): muted label · dotted leader · tabular value, optionally toned.
- Prose blocks cap at `max-w-prose`.

## Components

Shared vocabulary in `src/components/report.jsx` — always reuse, never re-derive:
`Section`, `Row`, `RatingBadge`, `RatingFigure`, `Pill` (tones: info/brand/pos/warn/neg/muted), `PrimaryButton` (amber, white text, spinner when loading), `QuietButton`, `FieldLabel`, `ReportSkeleton`. Input classes in `reportStyles.js` (`inputClass`, `fileInputClass`).

States: buttons disable (45% opacity) with an adjacent muted hint explaining what unlocks them — no `alert()` dialogs. Loading uses skeletons (`ReportSkeleton`), not centered spinners. Focus is a 2px brand outline (global, `index.css`).

## Motion

- 150ms color transitions on interactive elements; nothing else animates on hover.
- Reports enter with `.report-enter` (400ms rise-and-fade, expo-out). Content is visible by default; animation only enhances.
- Skeletons pulse softly. All motion collapses under `prefers-reduced-motion: reduce`.

## Voice

Calm, literate, lowercase-leaning. Kickers are mono lowercase ("Equity flow note · 2026-06-11"), one per masthead — never an eyebrow above every section. Footer carries the standing disclaimer about sample data.

---
name: IDX Stock Analysis & Screening
description: A literate equity-research desk that reads the live IDX tape — clinical restraint, one decisive green, light or dark.
colors:
  # Brand — Stockbit green. Bright value fills; dark text rides on top; a darker green reads as text on light.
  brand: "#13b87a"
  brand-dark: "#1ece85"
  brand-deep: "#0f9966"
  brand-tint: "#e4f6ee"
  on-brand: "#08130d"
  brand-strong: "#0a7d54"
  # Neutral surfaces
  paper: "#ffffff"
  paper-dark: "#0d0f12"
  well: "#f5f6f7"
  well-2: "#eceef0"
  elevated-dark: "#1b2026"
  line: "#e6e8ea"
  line-dark: "#2f353d"
  # Text
  ink: "#16181c"
  ink-dark: "#eef1f4"
  ink-muted: "#6b7177"
  ink-muted-dark: "#8b929b"
  # Informational accent
  info: "#2f6bff"
  info-dark: "#5286ff"
  info-tint: "#e9efff"
  # Semantic verdicts — foreground tuned per theme to pass AA
  pos: "#0a7d54"
  pos-dark: "#1ece85"
  pos-tint: "#e4f6ee"
  neg: "#c92a36"
  neg-dark: "#ff5b66"
  neg-tint: "#fdebec"
  warn: "#8a5e00"
  warn-dark: "#e8a93c"
  warn-tint: "#fbf2dd"
typography:
  display:
    fontFamily: "Newsreader, Georgia, Cambria, serif"
    fontSize: "2.25rem"
    fontWeight: 500
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Newsreader, Georgia, Cambria, serif"
    fontSize: "1.25rem"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "normal"
  body:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
  label:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "normal"
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  full: "9999px"
spacing:
  hairline: "1px"
  xs: "4px"
  sm: "8px"
  md: "12px"
  gutter: "20px"
  section: "32px"
components:
  button-primary:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.on-brand}"
    rounded: "{rounded.md}"
    padding: "10px 20px"
  button-primary-hover:
    backgroundColor: "{colors.brand-deep}"
  button-quiet:
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.md}"
    padding: "10px 20px"
  pill:
    backgroundColor: "{colors.well}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.full}"
    padding: "2px 10px"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "10px 14px"
  toggle-active:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.on-brand}"
    rounded: "{rounded.full}"
    padding: "0 12px"
---

# Design System: IDX Stock Analysis & Screening

## 1. Overview

**Creative North Star: "The Reading Room Terminal"**

This is a quiet research desk that happens to read the live order flow. It carries itself like a well-typeset equity-research note — serif masthead, dotted-leader rows, sentence-case headings, generous air around the numbers — but it is wired to the Indonesia Stock Exchange tape, so a single decisive green can light up when the flow says something. The two halves never fight: typography and restraint do the reading-room work; one Stockbit green does the terminal work. Everything else is ink and paper.

The surface comes in two ambient settings. **Day** is a pure-white reading room; **Night** is a near-black trading floor (`#0d0f12`). The same tokens carry both — the user flips them from the gear in the top-right, the choice follows the OS by default and persists. Color is always a verdict, never decoration: a number is green because it went up, red because it went down, amber because it's a hold — never because green is pretty.

What this system explicitly rejects: **Bloomberg-terminal clutter** (wall-to-wall density, ALL-CAPS shouting, ten colors fighting), **crypto-hype aesthetics** (neon glows, gamified urgency), and **generic indigo SaaS dashboard** templates. If a screen starts to feel like any of those, it has drifted.

**Key Characteristics:**
- Literate, authored feel — the page reads like research, not a feed.
- One decisive green; all other color is semantic verdict only.
- Numbers are the content: tabular figures, aligned columns, dotted-leader rows.
- Dual theme (light reading room / dark trading floor) from one token set.
- Screenshot-ready — any section cropped and shared stands alone legibly.

## 2. Colors

A near-monochrome ink-and-paper base with exactly one identity color (green) and a tightly rationed set of verdict colors. Every foreground value is tuned per theme to clear WCAG AA (≥4.5:1).

### Primary
- **Stockbit Green** (light `#13b87a` / night `#1ece85`): the single identity color. Used as a **fill** for primary actions, the active nav/step, focus ring, and selection. Never carries white text — see the On-Brand rule.
- **On-Brand Ink** (`#08130d`): the near-black green that rides *on top of* green fills (button labels, active toggle text, step numbers). This is what the reference's green buttons actually do.
- **Brand Strong** (light `#0a7d54` / night `#2ad88f`): the green darkened (or, at night, lightened) enough to read as **text** on light or tinted surfaces — brand pills, the "Then" flow marker, accent glyphs.
- **Brand Deep** (`#0f9966`): hover/active state for green fills.
- **Brand Tint** (light `#e4f6ee` / night `#11271f`): the quiet green fill behind brand pills and selected states.

### Tertiary
- **Signal Blue** (light `#2f6bff` / night `#5286ff`): neutral informational pills only (confidence, mode). Never an action color — that role belongs to green alone.

### Neutral
- **Paper** (day `#ffffff` / night `#0d0f12`): the body ground. White is never tinted; night is a true near-black trading floor.
- **Elevated** (day `#ffffff` / night `#1b2026`): floating overlays (modals, popovers, dropdowns, the date calendar). At night it lifts a visible step off the ground so overlays read as a separate layer.
- **Well / Well-2** (day `#f5f6f7` / `#eceef0`; night `#16191d` / `#20252b`): quiet and deeper fills — muted pills, skeletons, inset panels.
- **Line** (day `#e6e8ea` / night `#2f353d`): hairlines, borders, and the signature dotted leaders.
- **Ink / Ink-Muted** (day `#16181c` / `#6b7177`; night `#eef1f4` / `#8b929b`): primary and secondary text.

### Verdict (semantic — meaning only)
- **Up Green** (light `#0a7d54` / night `#1ece85`) on tint `#e4f6ee` / `#0f2a20`: gains, buys, A-ratings, accumulation, bullish.
- **Down Red** (light `#c92a36` / night `#ff5b66`) on tint `#fdebec` / `#331519`: losses, sells, stop levels, C-ratings, distribution, avoid.
- **Hold Amber** (light `#8a5e00` / night `#e8a93c`) on tint `#fbf2dd` / `#2c2410`: B-ratings, neutral bias, caution.

### Named Rules
**The On-Brand Rule.** A green fill *never* carries white text. White-on-`#13b87a` fails contrast (2.6:1); white-on-`#1ece85` fails worse (2.0:1). Green fills carry `on-brand` (`#08130d`) dark text. When green must be *text*, use `brand-strong`, never `brand`.

**The Verdict Rule.** Green, red, and amber appear only where they carry direction, rating, or risk. A gain or loss always also carries a `+`/`−` sign or word — color is never the sole signal.

**The Atmospheric Ground Rule.** Paper *surfaces* stay near-neutral (white at the top of a raised panel's gradient), but the page **canvas** carries a faint brand-hued atmospheric lift (`--canvas`, ~5% green at top, fading out) so the ground reads as lit rather than dead-flat. The tint is the brand's own green, never warm/cream — warmth is still forbidden; identity lives in the green, the type, the data, and now a whisper of brand atmosphere behind it all.

## 3. Typography

**Display Font:** Newsreader (serif), with Georgia / Cambria fallback.
**Body Font:** IBM Plex Sans, with system-ui fallback.
**Label/Mono Font:** IBM Plex Mono, with ui-monospace fallback.

**Character:** A literary serif paired on a true contrast axis with a clean humanist sans and a precise monospace. The serif gives the masthead and report headings their authored, equity-research voice; the sans keeps the working UI quiet; the mono makes every figure line up. Three families, three jobs, no overlap.

### Hierarchy
- **Display** (Newsreader 500, 1.5rem–2.25rem, line-height ~1.1, tracking `-0.02em`): the masthead and the big report/stage headings ("Candidates ready"), plus the large rating figures. Fixed rem scale — never fluid `clamp()`; a sidebar-shrinking headline looks worse, not better.
- **Title** (Newsreader 500, 1.25rem): section headings inside a report. Sentence case, always.
- **Body** (IBM Plex Sans 400/500, 0.875rem, line-height ~1.55): UI copy, labels, descriptions, buttons. Prose caps at `max-w-prose` (≈65ch).
- **Label / Figure** (IBM Plex Mono 500, 0.75rem): kickers, prices, dates, scores, tickers — always with `tabular-nums` so columns align. Kickers are lowercase mono ("closing screen · as of 2026-06-15").

### Named Rules
**The Sentence-Case Rule.** Headings are sentence case — never ALL CAPS. Caps are Bloomberg shouting; this desk speaks at a normal volume. (Short mono section labels like "TOP BUYERS" are the one allowed exception, and stay small and rationed.)

**The Tabular Rule.** Any number that sits in a column — price, score, percentage, lot — is mono with `tabular-nums`. Scores and grades align to fixed-width columns so the eye scans straight down.

## 4. Elevation — Refined Depth

The surface is **layered, not flat**. Every real container carries a soft top-down gradient sheen, a low-opacity tinted shadow, and a 1px top edge highlight, so panels read as lit, dimensional surfaces lifting off an atmospheric ground — while the literate research feel (serif headings, dotted-leader rows, generous air) is preserved. Depth is *refined*: present and premium, never loud. Glassmorphism, neon glows, and heavy drop shadows remain out.

The whole system is driven by tokens + two reusable classes in `index.css`, so depth is consistent app-wide and theme-aware:

- **`--canvas`** — the body background. A radial gradient that lifts toward the top-center with a whisper of the brand hue (~5% light / ~9% dark), fading to the ground. The page reads as lit, not paper-flat. `background-attachment: fixed` so it stays put on scroll.
- **`.surface-raised`** — resting panels (calendars, saved boxes, report containers, the verdict card's neighbors, secondary/quiet buttons). Gradient sheen + soft `--shadow-raised`, over the element's own `bg-paper`/`bg-elevated` and a `border-line` hairline.
- **`.surface-float`** — floating layers (modals, popovers, dropdowns, the filters panel). Stronger gradient + layered `--shadow-float`.
- **`.verdict-{pos,warn,neg}`** — the buy/hold answer surface: a diagonal wash from the verdict tint (top, behind the large display verdict) to the neutral surface (bottom, behind the dotted-leader rows) + a verdict-hued soft glow shadow. Color carries the verdict and the surface is dimensional, while muted Row labels stay on the light end of the gradient and keep WCAG AA contrast.

### Depth Tokens (see `index.css`)
- **`--shadow-raised`** (light): `0 1px 2px / 0.04, 0 6px 16px -5px / 0.08`, ink-tinted. Resting panels.
- **`--shadow-float`** (light): `0 6px 14px -5px / 0.10, 0 22px 44px -12px / 0.18`. Floating layers.
- **`--edge-highlight`**: `inset 0 1px 0 rgb(255 255 255 / .7)` (light) — the lit top edge.
- Primary green buttons carry a vertical `brand → brand-deep` gradient plus a brand-hued glow shadow that intensifies on hover.

### Named Rules
**The No-Card-Stack Rule (still holds).** Surfaces gain depth, but a *report* still reads like a document: report facts are dotted-leader rows, not tiled stat cards, and cards are never nested inside cards. Depth is for genuine containers (panels, the verdict card, floating layers), not for tiling content into boxes.

**The Surface-Over-Shadow Rule (night).** On the near-black ground a cast shadow is nearly invisible, so dark-mode elevation is carried by the lighter **surface gradient** (`--surface-raised` / `--surface-float` lift a step above the ground) plus the **top edge highlight** and a brighter hairline. A deep ambient shadow sits under floating layers only.

## 5. Components

### Buttons
- **Shape:** gently rounded (6–8px; `rounded-md`). Pills (`rounded-full`) for segmented toggles.
- **Primary:** green fill (`brand`) with `on-brand` dark text, ~10×20px padding. Hover → `brand-deep` and a 1px lift; active → settle + 0.98 scale. Disabled → 45% opacity with an adjacent muted hint that explains what unlocks it (never an `alert()`).
- **Quiet:** bordered, `ink-muted` text, transparent fill; hover firms the border and ink. The secondary affordance throughout.
- **Loading:** an `on-brand` spinner replaces motion inside the same button — no layout shift, no centered overlay spinner.

### Chips / Pills
- **Style:** `rounded-full`, ~2×10px, tinted background + same-hue text. Tones: `info` (confidence), `brand` (uses `brand-strong` text), `pos` / `warn` / `neg` (verdicts), `muted` (`well` + `ink-muted`).
- **State:** verdict tone is chosen by meaning, not decoration. Accumulation/distribution pills are clickable to expand the broker summary.

### Cards / Containers
- **Corner Style:** 12–16px (`rounded-xl` / `rounded-2xl`) on the few real containers (saved-screening box, analysis note).
- **Background:** `paper`; **Border:** 1px `line`. **Shadow:** resting card only. No nested cards.
- **Internal Padding:** 20–24px.

### Inputs / Fields
- **Style:** 1px `line` stroke, `paper` fill, 6–12px radius, mono text for tickers.
- **Focus:** border shifts to `brand` + a 2–4px `brand`/15–25% ring; a subtle 1.02 scale on the search field. Focus is always a 2px brand outline globally.
- **Error:** `neg` text below the field, `role="alert"`; the field is never left to fail silently.

### Navigation
- **Style:** top tab row, IBM Plex Sans 500. Active tab = `ink` text over a 2px `brand` underline; inactive = `ink-muted` with a faint brand-tinted hover. No side nav — the app is a single centered `max-w-4xl` column.

### Stepper (signature)
A three-stop progress rail (Select Date · Run Screening · Refine with Brokers). Active stop = green fill with `on-brand` number; done = `pos-tint` with a check; todo = `well` + muted. It frames the screening flow as an authored sequence.

### Settings Popover (signature)
Gear button in the top-right opens an `elevated` popover holding the **theme toggle** (Light/Dark, sun/moon, active = green fill + `on-brand`) and the **language switcher** (EN/ID with drawn SVG flags). Closes on `pointerdown` outside or Escape; touch targets ≥44px; capped to the viewport on narrow phones.

### Dotted-Leader Row (signature)
The typographic spine: `muted label · dotted leader · tabular value`, value optionally toned by verdict. Every report fact is one of these — it is what makes a cropped screenshot read like research.

## 6. Do's and Don'ts

### Do:
- **Do** carry `on-brand` (`#08130d`) text on every green fill; reach for `brand-strong` when green must be text. Never white on green.
- **Do** keep color a verdict — green/red/amber only where direction, rating, or risk is meant, always paired with a `+`/`−` sign or word.
- **Do** set every figure in IBM Plex Mono with `tabular-nums` and align scores/grades to fixed-width columns.
- **Do** separate report *sections* with hairlines and dotted leaders; keep the single centered `max-w-4xl` column.
- **Do** give real containers depth via `.surface-raised` / `.surface-float` (gradient sheen + soft tinted shadow + edge highlight), not flat fills.
- **Do** carry night-mode elevation with the lighter surface gradient + top edge highlight + brighter hairline; reserve deep ambient shadow for floating layers.
- **Do** keep paper surfaces near-neutral and let the `--canvas` carry only a faint brand-green atmospheric lift — identity stays in the green, type, and data.

### Don't:
- **Don't** reproduce **Bloomberg-terminal clutter** — no wall-to-wall density, no ALL-CAPS shouting, no ten colors fighting for attention.
- **Don't** drift into **crypto-hype aesthetics** — no neon glows, no gamified urgency, no gradient text.
- **Don't** ship a **generic indigo SaaS dashboard** — the one accent is Stockbit green, never default Tailwind blue/indigo.
- **Don't** nest cards inside cards or tile the report into identical stat boxes — depth is for genuine containers, not for boxing every fact.
- **Don't** tint the ground *warm/cream* or use a fluid `clamp()` display scale (the only canvas tint allowed is the brand green).
- **Don't** let depth get loud — no glassmorphism, neon glow, or heavy drop shadows; keep it the soft, refined layered system.
- **Don't** rely on color alone, hover alone, or shadow alone to carry meaning.

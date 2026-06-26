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
  # Liquid Glass — frosted floating-chrome material. Light fill base = paper (#ffffff);
  # dark fill base below. Fill alpha, rim alpha, and blur are opacity/filter values
  # (not colors) and live in §4 Elevation + the sidecar, not the token schema.
  glass-tint-dark: "#0a0d12"
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
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 600
    lineHeight: 1.04
    letterSpacing: "-0.035em"
  title:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Inter, system-ui, sans-serif"
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
    rounded: "{rounded.full}"
    padding: "10px 24px"
  button-primary-hover:
    backgroundColor: "{colors.brand-deep}"
  button-quiet:
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.full}"
    padding: "10px 24px"
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

Behind it all sits one atmospheric layer, the **cosmic backdrop** (a Cosmoq-inspired addition): a fixed starfield + slowly drifting brand/info aurora, pinned behind every page over the `--canvas` ground. It is the *faintest* whisper on the Day reading room (stars at ~5% ink dust, aurora a hair of green/blue) so paper still reads as paper, and opens into a real deep-space look at Night. It is pure decoration that never touches the content layer or legibility — the one place this desk allows atmosphere for its own sake. See §4.

One deliberate exception to the desk's restraint: the **floating chrome** — every modal, popover, the settings menu, both date calendars, and the primary/secondary action buttons — is rendered in an Apple-style **Liquid Glass** material (frosted, lightly refractive, theme-aware). This is a *scoped* choice, never a default coat: the reading layer (reports, dotted-leader rows, data) stays opaque and screenshot-legible. Glass lives only where the eye expects a surface to float above the page. See §4.

What this system explicitly rejects: **Bloomberg-terminal clutter** (wall-to-wall density, ALL-CAPS shouting, ten colors fighting), **crypto-hype aesthetics** (rainbow neon, gamified urgency, gradient text), and **generic indigo SaaS dashboard** templates. If a screen starts to feel like any of those, it has drifted. (The Cosmoq pass adds a tightly-scoped atmosphere — Inter display type, a faint cosmic backdrop, and one in-brand glowing CTA — documented in §3–§5; these are the *only* sanctioned departures from the original ink-and-paper restraint.)

**Key Characteristics:**
- Literate, authored feel — the page reads like research, not a feed.
- One decisive green; all other color is semantic verdict only.
- Numbers are the content: tabular figures, aligned columns, dotted-leader rows.
- Dual theme (light reading room / dark trading floor) from one token set.
- Screenshot-ready — any section cropped and shared stands alone legibly.
- Liquid Glass on floating chrome only (modals, popovers, calendars, action buttons); content stays opaque.

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

**Display Font:** Inter, with system-ui fallback. Optical sizing on, deep negative tracking.
**Body Font:** Inter, with system-ui fallback.
**Label/Mono Font:** IBM Plex Mono, with ui-monospace fallback.

**Character:** Inter is the next-gen tech-product voice the desk adopted from the Cosmoq pass — a clean grotesque-humanist sans set *large with deep negative tracking* for the mastheads (the headings' whole punch comes from the size + tracking, not from a serif's contrast), and quiet at body size for the working UI. The one true contrast axis that remains is against **IBM Plex Mono**, which still carries every figure so columns line up. Two families, two jobs: Inter does the reading + display work, the mono does the data work. (Historical note: the masthead was previously Newsreader serif; the `font-serif` Tailwind alias is kept but now resolves to Inter, so existing heading call sites didn't have to change.)

### Hierarchy
- **Display** (Inter 600, 1.5rem–2.25rem, line-height ~1.04, tracking `-0.035em` via `.display`; the big hero headings use `.display-xl` — 700, `-0.04em`): the masthead and the big report/stage headings ("Candidates ready"), plus the large rating figures. Fixed rem scale — never fluid `clamp()`; a sidebar-shrinking headline looks worse, not better. The deep tracking is the Cosmoq signature — generic Inter at default tracking reads as a template.
- **Title** (Inter 500, 1.25rem, tracking `-0.02em`): section headings inside a report. Sentence case, always.
- **Body** (Inter 400/500, 0.875rem, line-height ~1.55): UI copy, labels, descriptions, buttons. Prose caps at `max-w-prose` (≈65ch).
- **Label / Figure** (IBM Plex Mono 500, 0.75rem): kickers, prices, dates, scores, tickers — always with `tabular-nums` so columns align. Kickers are lowercase mono ("closing screen · as of 2026-06-15").

### Named Rules
**The Sentence-Case Rule.** Headings are sentence case — never ALL CAPS. Caps are Bloomberg shouting; this desk speaks at a normal volume. (Short mono section labels like "TOP BUYERS" are the one allowed exception, and stay small and rationed.)

**The Tabular Rule.** Any number that sits in a column — price, score, percentage, lot — is mono with `tabular-nums`. Scores and grades align to fixed-width columns so the eye scans straight down.

## 4. Elevation — Refined Depth

The surface is **layered, not flat**. Every real container carries a soft top-down gradient sheen, a low-opacity tinted shadow, and a 1px top edge highlight, so panels read as lit, dimensional surfaces lifting off an atmospheric ground — while the literate research feel (serif headings, dotted-leader rows, generous air) is preserved. Depth is *refined*: present and premium, never loud. Neon glows and heavy drop shadows remain out. Glassmorphism is **no longer banned outright** — it is a deliberate, scoped material reserved for floating chrome (see Liquid Glass below); it never touches the content layer.

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

### Liquid Glass — floating chrome only

An Apple-style frosted, lightly refractive material for the layers that float above the page. Driven by tokens + a small class set in `index.css`, theme-aware, and **never applied to report/content surfaces**. Frosted surfaces stack two pseudo-layers so depth never costs legibility: a `::before` blurred backdrop bent by an SVG displacement filter (real refraction, not just blur), a `::after` translucent tint fill with an inset specular highlight, and the real content lifted above both (`z-index` 2) so text stays perfectly crisp.

**Glass tokens** (theme-aware, in `:root` / `.dark`):
- **`--glass-fill`** — tint base: `255 255 255` (day) / `10 13 18` (night, = `glass-tint-dark`).
- **`--glass-fill-a`** — fill opacity: `0.55` (day) / `0.58` (night). Translucent in **both** themes so the refraction actually shows and the panel reads as see-through over the dimmed page; the modal **backdrop scrim** (a true dark dim in both themes) carries readability, and dark ink over the white day fill still clears AA with room to spare even on a dimmed page.
- **`--glass-rim` / `--glass-rim-a`** — lit hairline edge: white at `0.6` (day) / `0.22` (night).
- **`--glass-blur`** — `16px` backdrop blur + `saturate(185%)`.
- **`#glass-distortion`** — one shared SVG `feTurbulence` + `feDisplacementMap` (scale 28, no specular-lighting pass — tuned low for legibility and zero scroll jank), mounted once at the app root.

**Variants:**
- **`.glass-surface`** (alias `.surface-glass`) — frosted neutral surface for modals, the settings popover, search/filter popovers, and both date calendars. Carries `--shadow-float`.
- **`.glass-accent`** — the green CTA. Brand fill at **80%** (hover 92%) on the element itself (its bare text node can't ride the pseudo-fill), backdrop blur, bright top specular, deep brand under-glow. Stays decisively green — a glass primary must never read paler than a secondary toggle.
- **`.glass-quiet`** — secondary CTA. Translucent `--c-elevated` fill (55%, hover 74%) + blur + white rim, so it reads as frosted glass distinct from the page in both themes.
- **`.glass-card`** — interactive option tiles (the decision modal's two choices). Translucent resting fill (40%, hover 56%) so the modal's refracted content shows through the tile; lifts and gains a green rim on hover.
- **`.glass-well`** — a brand-tinted, recessed tray that backs an *inline* glass surface with no scrim behind it (the analysis-step calendar). Glass refracts what's behind it, so over the blank near-white page the frost has nothing to bend; the well supplies a faint green wash + a tint ring around the panel so the calendar reads as a glass slab floating on the desk rather than a flat white card. Pair it with a `.glass-surface` child.

**Graceful degradation is mandatory.** Under `@supports not (backdrop-filter)` or `prefers-reduced-transparency: reduce`, every glass surface falls back to an **opaque** fill (no blur, no refraction) so nothing becomes unreadable. Reduced-motion is handled globally.

### Cosmic Backdrop — atmosphere behind everything (Cosmoq)

A fixed two-layer atmosphere mounted once by `<CosmicBackdrop/>` (like the shared `GlassFilter`) and pinned at `z-index: -1` behind all content, over the `--canvas` ground. It is the desk's one purely-decorative layer — it never touches the reading layer, never carries meaning, and stays subtle enough that the page still reads as a research desk, not a hero template.

- **`.cosmic-stars`** — a tiling radial-dot starfield that slowly twinkles (opacity 7s). Dot color + opacity are theme tokens.
- **`.cosmic-aurora`** — two-to-three soft brand-green + signal-blue radial blobs that drift (`transform` 26s, alternating). Brand/info only — never a foreign hue.

**Backdrop tokens** (theme-aware, in `:root` / `.dark`):
- **`--star-rgb` / `--star-opacity`** — `22 24 28` @ `0.05` (day, ink dust barely there) / `255 255 255` @ `0.55` (night, bright white).
- **`--aurora-brand` / `--aurora-info`** — aurora strengths: `0.06 / 0.05` (day) / `0.12 / 0.10` (night).

Both layers are pure transform/opacity (GPU-composited, zero scroll cost) and freeze under reduced-motion while the atmosphere itself stays. This is the **scoped exception** to the No-Decoration Rule (§5): it is allowed *because* it is behind everything, costs nothing, and never competes with the data.

### Glowing CTA Ring (`.glow-ring`, Cosmoq signature)

The primary action carries Cosmoq's signature: a conic light ring that rotates around the pill (`glow-ring-spin` 4s), masked to a thin rim with a soft outer bloom. Re-hued to the desk's **own** identity — brand green → signal blue → brand-strong, never Cosmoq's blue/gold — so it reads as the most alive thing on screen without importing a foreign palette. It composes *over* `.glass-accent` (the green fill, on-brand text, and decisive-green rule all still hold) and uses `@property --glow-angle` so the angle tweens smoothly. Freezes under reduced-motion. This is a deliberate, scoped relaxation of the old "no neon glow" line — confined to the single primary CTA, in-brand, on chrome only.

### Named Rules
**The Glass-On-Chrome-Only Rule.** Liquid Glass is for layers that float *above* the page — modals, popovers, calendars, action buttons. It is **forbidden** on the reading layer: reports, dotted-leader rows, the verdict card, data tables. Coating data in glass breaks WCAG AA and the screenshot-ready identity. If content is behind glass, it's wrong.

**The Decisive-Glass Rule.** A glass primary action (`.glass-accent`) carries the brand fill at ≥80% opacity. Translucency is the texture, not an excuse to wash the green out — the primary CTA must always be the most decisive green on screen, never paler than a selected date or an active toggle.

**The Glass-Fallback Rule.** Every glass surface ships an opaque fallback for no-`backdrop-filter` and reduced-transparency. Never let the only path to a surface's fill be a blur the browser might not paint.

**The No-Card-Stack Rule (still holds).** Surfaces gain depth, but a *report* still reads like a document: report facts are dotted-leader rows, not tiled stat cards, and cards are never nested inside cards. Depth is for genuine containers (panels, the verdict card, floating layers), not for tiling content into boxes.

**The Surface-Over-Shadow Rule (night).** On the near-black ground a cast shadow is nearly invisible, so dark-mode elevation is carried by the lighter **surface gradient** (`--surface-raised` / `--surface-float` lift a step above the ground) plus the **top edge highlight** and a brighter hairline. A deep ambient shadow sits under floating layers only.

## 5. Motion — iOS Spring Physics

Motion here reads as native iOS, not as a web approximation of it. Five principles govern every animation, and they are enforced by a small spring-physics system that is shared between CSS and the Web Animations API so a button press and a modal entrance move under the *same* physics.

1. **Spring physics over linear easing.** No `ease-in-out` anywhere on interactive motion. Five spring timing-functions (`--spring-press`, `--spring-modal`, `--spring-popover`, `--spring-reveal`, `--spring-settle`) are each the analytic response of a real (mass, stiffness, damping) spring, rendered as a `linear()` easing list. The durations are *as long as the physics takes to settle* (192–316 ms), not picked numbers — which is why they land in the 150–320 ms band where product motion feels native rather than laggy.
2. **Tactile feedback.** Every pressable surface scales *down* a hair on active and snaps back via the press spring — a real object you push on doesn't overshoot, it returns. Three strengths: `.tactile` (0.975, the universal press), `.tactile-soft` (0.985, chrome controls — the close ×, tab links, day buttons), and `.tactile-deep` (0.97, the primary CTA). No bounce, no elastic.
3. **Spatial awareness & depth.** Overlays animate *with* their depth: the modal rises + settles from 0.985→1 scale (the "iOS sheet" read), the settings popover expands from its top-right origin (the gear), the date popup from its input. The backdrop is a pure fade — a scrim has no position to spring from.
4. **Interruptibility.** Modal, settings popover, and date popup enter/exit through the Web Animations API via the `useSpringPresence` hook. WAAPI is interruptible by construction: `element.animate()` cancels any animation already running on those properties, so toggling open/closed/open in quick succession just restarts the enter each time — no class-swap jank, no timer desync, the way iOS overlays always feel fluid.
5. **Momentum & inertia.** `.ios-scroll` is the zero-cost baseline (`overscroll-behavior: contain` + `-webkit-overflow-scrolling: touch`). The `useElasticScroll` hook layers on the signature iOS rubber-band resistance (1/d diminishing curve + spring snap-back) on touch only — trackpads/mice scroll normally. It is applied only where a list genuinely scrolls with momentum (the attached-screenshots list).

### Motion Tokens (see `index.css` + `src/lib/motion.js`)
- **Spring curves** (`--spring-*`): five `linear()` easing lists, defined once in `:root` and mirrored as constants in `src/lib/motion.js` so WAAPI keyframes and CSS transitions share one body.
- **Spring durations** (`--spring-*-dur`): the matching ms values, so a CSS `transition-duration` and a WAAPI `duration` never drift apart.
- **`.tactile` / `.tactile-soft` / `.tactile-deep`**: the press affordances (§5.2). Apply to any click target that should read as a physical button.
- **`.ios-scroll`**: contained, momentum-scrolling container. Pair with `useElasticScroll()` where touch rubber-banding is wanted.
- **`useScrollReveal()`** (`src/lib/useScrollReveal.js`): returns a ref; one IntersectionObserver marks the element `data-reveal="pending"` after mount and adds `.is-visible` on entry (lift + fade on `--spring-reveal`). Reduced-motion / no-JS shows content immediately. Decorative motion — use sparingly on standing sections (see Restrained-Decoration Rule).
- **`.glow-ring`** + **cosmic backdrop animations** (`glow-ring-spin`, `aurora-drift`, `star-twinkle`): the Cosmoq decorative loops (§4). Infinite but compositor-cheap; all freeze under reduced-motion.

### Named Rules
**The Spring-Only Rule.** Interactive motion uses the spring tokens exclusively. Generic `ease-in-out`, `ease`, and linear are forbidden on press/enter/exit — they read as mechanical next to the springs. (The one exception is the backdrop fade and exit easings, which use plain `ease-in`/`ease-out` because a pure opacity change has no spatial component to spring.)

**The Press-Down Rule.** A pressable surface scales *down* on active (0.975–0.97), never up. iOS buttons compress into the surface; a scale-up reads as a hover, not a press. Hover is the only motion that lifts (−translate-y-px).

**The Interruptible-Overlay Rule.** Any overlay that the user can toggle (modal, popover, popup) must enter and exit through `useSpringPresence`, not through a CSS class swap. Class swaps desync under rapid toggling; the WAAPI hook cancels-and-restarts atomically.

**The Reduced-Motion Rule.** Every motion has a `prefers-reduced-motion: reduce` path. The springs collapse to near-instant (1 ms) crossfades via `withReducedMotion()`, the tactile press is neutralized, and `.ios-scroll`'s smooth scroll switches to auto — state still resolves, just without motion. This is non-optional accessibility, not a nicety.

**The Restrained-Decoration Rule** (revised from the old No-Decoration Rule, Cosmoq pass). Motion still mostly conveys state — feedback, reveal, loading, transition — and the **task UIs carry no page-load choreography**. The Cosmoq pass adds scoped decorative motion in three places, and no more: (1) the **cosmic backdrop** (§4) drifting/twinkling behind all content; (2) a **scroll reveal** — sections lift + fade in the first time they enter the viewport (`useScrollReveal` adds `.is-visible`, riding the `--spring-reveal` physics), applied *deliberately to a few standing sections*, not blanket-fired, and playing **once** per element; and (3) the **marketing landing route (`/`)** only, which — as a front door, not a task surface — earns a brief **staggered hero entrance** (`.hero-rise`, keyed off `--i`) on mount and a looping **ticker marquee** (`.marquee`). The landing is the *one* place page-load choreography is allowed; every tool page (`/analysis`, `/screening`, `/auto-screening`) keeps the no-choreography rule. All of the above, plus the glowing CTA ring, freeze under reduced-motion. Everything else still earns its motion by reporting state.

## 6. Components

### Buttons
- **Shape:** the liquid-glass action buttons are **fully-rounded pills** (`rounded-full`) — the green primary and the quiet secondary share one pill form so the pair reads as a single material (see §4 Liquid Glass). Segmented toggles and verdict chips are also pills; flat `rounded-md` remains the form for inputs and chrome-less buttons.
- **Primary:** the green CTA is the liquid-glass `.glass-accent` material — brand fill at ≥84% opacity (hover 92%) with `on-brand` dark text, backdrop blur, a lit top rim, a deep brand under-glow, and a **soft ambient halo** (two wide, low-opacity brand glows) bleeding past the pill edge — the signature of the liquid-glass read, ~10×24px padding. Hover → halo brightens + 1px lift; active → settle + 0.97 scale via `.tactile-deep` (see §5 Motion). Disabled/in-flight → halo drops (no green radiation when non-actionable) at 45% opacity, with an adjacent muted hint that explains what unlocks it (never an `alert()`). Stays the most decisive green on screen — never paler than a selected date or active toggle (see Decisive-Glass, §4). The primary CTA also wears the **`.glow-ring`** (§4): a rotating brand-green→signal-blue conic rim + soft bloom — the Cosmoq signature, in-brand and confined to this one button.
- **Quiet:** the secondary affordance throughout — the `.glass-quiet` material: a pill matching the primary's shape + ambient-halo vocabulary, translucent `--c-elevated` fill (58%, hover 76%) + blur + white rim, with a **neutral** halo (ink-tinted light / soft black night — never green) so it reads as the frosted sibling, not a second CTA. `ink-muted` text that firms to `ink` on hover. Carries `.tactile-soft` for its press (§5). Distinct from the page in both themes.
- **Focus:** glass pills carry an ink focus ring that follows the pill shape (`outline-offset: 3px`, `border-radius: 9999px`) — the default brand-green ring would be invisible on the green fill and sharp-cornered around the pill.
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
Gear button in the top-right opens a **liquid-glass** (`.glass-surface`) popover holding the **theme toggle** (Light/Dark, sun/moon, active = green fill + `on-brand`) and the **language switcher** (EN/ID with drawn SVG flags). Closes on `pointerdown` outside or Escape; touch targets ≥44px; capped to the viewport on narrow phones.

### Liquid Glass Surfaces (signature)
The floating-chrome material (see §4). Every modal, the settings popover, search/filter popovers, and both date calendars are `.glass-surface`: a frosted, lightly refractive sheet. Most float over a dark backdrop scrim (`bg-black/55`) that gives the frost something to refract and carries readability; the one *inline* surface with no scrim — the analysis-step calendar — sits in a `.glass-well` tinted tray so it still reads as glass. The decision modal's two choices are `.glass-card` tiles that lift and gain a green rim on hover. Real content rides above the glass at `z-index 2` so text stays crisp; an opaque fallback ships for browsers without `backdrop-filter` and for `prefers-reduced-transparency`. This material is the app's one signature flourish — and it is confined to chrome: it never coats a report, a dotted-leader row, or a data table.

### Dotted-Leader Row (signature)
The typographic spine: `muted label · dotted leader · tabular value`, value optionally toned by verdict. Every report fact is one of these — it is what makes a cropped screenshot read like research.

## 7. Do's and Don'ts

### Do:
- **Do** carry `on-brand` (`#08130d`) text on every green fill; reach for `brand-strong` when green must be text. Never white on green.
- **Do** keep color a verdict — green/red/amber only where direction, rating, or risk is meant, always paired with a `+`/`−` sign or word.
- **Do** set every figure in IBM Plex Mono with `tabular-nums` and align scores/grades to fixed-width columns.
- **Do** separate report *sections* with hairlines and dotted leaders; keep the single centered `max-w-4xl` column.
- **Do** give real containers depth via `.surface-raised` / `.surface-float` (gradient sheen + soft tinted shadow + edge highlight), not flat fills.
- **Do** carry night-mode elevation with the lighter surface gradient + top edge highlight + brighter hairline; reserve deep ambient shadow for floating layers.
- **Do** keep paper surfaces near-neutral and let the `--canvas` + cosmic backdrop carry only a faint brand-green/blue atmospheric lift — identity stays in the green, type, and data; the starfield/aurora stays a whisper on Day and never reaches the content layer.
- **Do** set display headings in Inter with the deep negative tracking (`.display` / `.display-xl`) — the masthead punch comes from size + tracking, with IBM Plex Mono still carrying every figure.
- **Do** reserve the liquid-glass material (`.glass-*`, §4) for floating chrome only — modals, popovers, both calendars, and the primary/secondary action buttons — with content lifted above the glass and an opaque fallback for unsupported browsers.
- **Do** use the spring tokens (`--spring-*`, §5) for all interactive motion, and the `.tactile` utilities for press feedback — a press scales *down* (0.975–0.97) and snaps back via the press spring, never up.
- **Do** route every toggleable overlay (modal, popover, popup) through `useSpringPresence` so its enter/exit is interruptible — reopening mid-exit must cancel and restart cleanly (§5).
- **Do** ship a `prefers-reduced-motion: reduce` path for every animation — near-instant crossfades, no press scale, no smooth scroll. Non-optional.

### Don't:
- **Don't** reproduce **Bloomberg-terminal clutter** — no wall-to-wall density, no ALL-CAPS shouting, no ten colors fighting for attention.
- **Don't** drift into **crypto-hype aesthetics** — no gamified urgency, no gradient text. (The two scoped exceptions from the Cosmoq pass: the in-brand `.glow-ring` on the single primary CTA, and the cosmic backdrop's faint aurora — both green/blue only, never a rainbow neon. Anything beyond those two is still out.)
- **Don't** ship a **generic indigo SaaS dashboard** — the one accent is Stockbit green, never default Tailwind blue/indigo.
- **Don't** nest cards inside cards or tile the report into identical stat boxes — depth is for genuine containers, not for boxing every fact.
- **Don't** tint the ground *warm/cream* or use a fluid `clamp()` display scale (the only canvas tint allowed is the brand green).
- **Don't** put glass on the reading layer — no glassmorphism on reports, dotted-leader rows, the verdict card, or data tables. The liquid-glass material (§4) is **only** for floating chrome (modals, popovers, calendars, action buttons); content stays opaque and screenshot-legible.
- **Don't** wash the green out — a glass primary (`.glass-accent`) holds brand fill at ≥80%; translucency is the texture, never an excuse to dim the CTA below a selected date or active toggle.
- **Don't** let depth get loud — no neon glow or heavy drop shadows; keep it the soft, refined layered system, and ship an opaque fallback for every glass surface.
- **Don't** use `ease-in-out`, `ease`, or linear on press/enter/exit motion — the spring tokens (§5) are the only curves for interactive motion. Generic easings read as mechanical next to them.
- **Don't** add decorative motion *beyond the two scoped Cosmoq exceptions* (the cosmic backdrop + the once-per-element scroll reveal on a few standing sections, §4–§5) — still no page-load choreography, and don't blanket-fire the reveal on every scrolled element. Outside those two, motion conveys state (feedback, reveal, loading, transition), nothing else.
- **Don't** rely on color alone, hover alone, or shadow alone to carry meaning.

---
target: start screen Filters button + filter panel
total_score: 10
p0_count: 0
p1_count: 2
timestamp: 2026-06-15T19-49-43Z
slug: pages-stockscreeningpage-jsx-start-screen-filters
---
# Critique — Screening Stage-1 start screen + Filters panel

Scope: the `stage === 'date'` start screen of StockScreeningPage.jsx (hero "Run Screening" CTA, the "Filters" button, and the filter dropdown). Not a whole-app score.

## Design Health (scoped to this surface)

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 4 | Consistency & Standards | 3 | Hero CTA + a second centered button below it read as a primary/secondary action pair, but "Filters" is configuration, not an alternative action |
| 6 | Recognition vs Recall | 3 | Active config hidden behind the button; only a count badge hints at it. Strategy is named in the subtext (good) but cap/sector/board are invisible until opened |
| 7 | Flexibility & Efficiency | 2 | Every adjustment requires opening a panel and scrolling; no inline quick-access to the most-changed control (strategy) |
| 8 | Aesthetic & Minimalist | 2 | 6 control groups (671px) stacked in one 320px column, force-scrolling in a 542px box that opens below the fold |
| — | IA / Flow | — | The primary action sits *above* its own configuration; reading order is act-then-configure (the subtext even says "change the filters below") |

Scoped subtotal: 10/16 on the relevant heuristics — the surface works but the configure→act flow is inverted and the panel is overloaded.

## Anti-Patterns Verdict

Deterministic scan: `detect.mjs` returned `[]` — clean, no slop tells on the page.

LLM read: no AI-slop aesthetic problems. The issues are structural/IA, not decorative. The design system usage is consistent (segmented controls, brand tokens, hairlines). The stale comment on line 664 ("Top bar — title left, compact Filters control on the right") reveals the filters drifted from an earlier top-right toolbar intent to their current center-below-CTA position — which is the root of concern #1.

## What's Working

- The active-filter **count badge** on the Filters button is a good recognition cue.
- Segmented controls (count / mode / cap) are the right compact affordance and use brand tokens consistently.
- The strategy **blurb** under the select is genuinely helpful context.

## Priority Issues

### [P1] Filters sits below the primary CTA — configure-then-act flow is inverted
- **Why it matters**: Run Screening (hero, 56px tall) and Filters (34px) share the same center axis 24px apart, so they read as a "primary / secondary" button pair (like Sign up / Log in). But Filters *configures* what Run Screening does. A user reads top-to-bottom, hits the big button first, and only then finds the filters — the subtext literally has to say "change the strategy and filters below." Configuration should precede its action.
- **Fix**: Move the Filters affordance *above* the CTA (right under the subtext), or surface the key control inline — e.g. a compact "Strategy: Blue Chip ▾ · Filters" row under the blurb — so the order is headline → what it'll do → adjust → **Run**. The hero CTA becomes the visual terminus, standing alone.
- **Suggested command**: `/impeccable layout`

### [P1] Filter panel is too tall — 671px in a 320px column, scrolls below the fold
- **Why it matters**: 6 stacked groups produce 671px of content, capped to a 542px scrolling box that opens at y≈533 in a 720px viewport — most of the panel is below the fold and requires internal scrolling. That's a "wall of options": >4 decisions presented at once with no chunking, violating progressive disclosure.
- **Fix**: Compress to a 2-column layout for the short segmented controls (Stocks-to-surface + Analysis mode side by side; Market cap + Sector can pair too), trim the verbose Listing-board help text (move to a tooltip or one line), and tighten `space-y-5` → `space-y-4`. Target ~430px, no scroll, fully above the fold. Optionally group as "Strategy" (primary) + a compact grid of secondary filters.
- **Suggested command**: `/impeccable layout`

## Minor Observations

- Line 664 comment is stale/misleading ("Filters control on the right") — clean it up when the layout is reworked.
- The Filters dropdown is `z-sticky` with a `z-dropdown` click-away scrim *behind* it — works, but the semantic z-scale naming is slightly inverted (a dropdown above a sticky layer).
- "Listing board" help text is the longest single block in the panel; it's the biggest contributor to the panel's height after the 6-group stack itself.

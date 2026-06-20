---
target: liquid glass site-wide
total_score: 30
p0_count: 1
p1_count: 2
timestamp: 2026-06-19T15-57-38Z
slug: src-index-css-liquid-glass-site-wide
---
# Critique — Liquid Glass treatment (site-wide)

## Design Health Score: 30/40 (Good)

The app is well-built; the glass treatment is real but sits at tier 1 ("frosted")
of the 3-tier Apple spec. The gap is refraction/motion fidelity + scope, not craft.

## Anti-patterns verdict
Detector: clean ([]) on App.jsx, components, pages. No markup slop.
LLM: current `.surface-glass` is `backdrop-filter: blur+saturate` + translucent
tint + static inset specular + green rim + one-shot sweep. That is frosted glass,
not liquid glass. Missing: lensing/refraction (blur != refraction), chromatic
aberration, pointer/scroll-driven specular, gel morphing transitions. Scoped to
one component (settings menu + gear).

## Priority issues
- [P0] No real lensing/refraction. backdrop-filter blurs but does not magnify or
  bend content behind. Needs an SVG feDisplacementMap edge-refraction layer (or a
  layered faux-lens) to read as physical glass.
- [P1] Glass lives on one component only. "Site-wide" = unify every floating CHROME
  layer (header/nav tab bar, modals, date picker, intent modal, popovers) on one
  material — NOT the report/content surfaces (legibility + screenshot-ready + the
  "color is a verdict" identity forbid coating data in glass).
- [P1] Transitions fade, they do not morph. Apple liquid glass melts/shapeshifts
  between states with spring physics. Current dropdown is a slide+fade.
- [P2] Specular highlight is static. Spec calls for highlights that track pointer/
  device motion. Add a pointer-driven sheen on the floating layers.
- [P2] No chromatic aberration at edges. Subtle RGB edge separation sells the lens.

## The tension (must resolve before building)
DESIGN.md is explicitly anti-glass on content ("read like research", "numbers are
the content", "color is a verdict", "screenshot-ready"). Apple itself reserves
liquid glass for floating chrome (tab bars, sidebars, menus), never the content
layer. So "site-wide" should mean all floating chrome, content stays opaque/legible.

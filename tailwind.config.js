/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // All hues resolve through CSS variables so the whole surface can flip
        // between the light and dark Stockbit-style palettes (see index.css).
        // Surfaces
        paper: 'var(--c-paper)',
        well: 'var(--c-well)',
        'well-2': 'var(--c-well-2)',
        line: 'var(--c-line)',
        // Elevated — floating overlays (modals, popovers, dropdowns) that need to
        // lift off the near-black ground in dark mode; identical to paper in light.
        elevated: 'var(--c-elevated)',
        // Text
        ink: 'var(--c-ink)',
        'ink-muted': 'var(--c-ink-muted)',
        // Brand — Stockbit green, used for actions, selection, focus
        brand: 'var(--c-brand)',
        'brand-deep': 'var(--c-brand-deep)',
        'brand-tint': 'var(--c-brand-tint)',
        // Text/icons that sit ON a brand fill — dark, like the reference's green
        // buttons. White on bright green fails contrast; this passes.
        'on-brand': 'var(--c-on-brand)',
        // Brand green darkened enough to read as TEXT on light/tinted surfaces.
        'brand-strong': 'var(--c-brand-strong)',
        // Informational accent — used for neutral badges (confidence, mode)
        info: 'var(--c-info)',
        'info-tint': 'var(--c-info-tint)',
        // Semantic verdicts — only where meaning is carried
        pos: 'var(--c-pos)',
        'pos-tint': 'var(--c-pos-tint)',
        neg: 'var(--c-neg)',
        'neg-tint': 'var(--c-neg-tint)',
        warn: 'var(--c-warn)',
        'warn-tint': 'var(--c-warn-tint)',
      },
      fontFamily: {
        // Cosmoq adopts Inter for both display and body. `serif` is kept as the
        // alias the existing headings reference, now resolving to Inter so every
        // masthead/section title becomes the tight-tracked Inter display face
        // without touching every call site (the .display tracking is in index.css).
        serif: ['Inter', '"Inter Placeholder"', 'system-ui', 'sans-serif'],
        sans: ['Inter', '"Inter Placeholder"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      zIndex: {
        dropdown: '10',
        sticky: '20',
      },
    },
  },
  plugins: [],
}

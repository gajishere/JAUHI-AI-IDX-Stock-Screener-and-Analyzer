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

        // ===== shadcn/ui token bridge =====
        // Pasted shadcn components use a fixed color vocabulary (primary,
        // secondary, accent, destructive, muted, border, input, ring, background,
        // foreground). This project doesn't use those names natively — it uses the
        // brand/ink/paper tokens above. Rather than rewrite every pasted component,
        // we alias the shadcn names onto the SAME CSS variables so a pasted
        // component renders in the Reading-Room identity (primary = Stockbit green,
        // not indigo), and the existing dark-mode flip still applies because the
        // underlying --c-* vars swap under .dark. Mappings follow shadcn semantics:
        //   primary/foreground   -> main action color + readable text on it
        //   secondary            -> a quiet fill
        //   accent               -> a hover/selection tint
        //   destructive          -> the verdict-red
        //   muted/foreground     -> secondary text
        //   border, input        -> hairlines
        //   ring                 -> focus ring
        //   background/foreground -> page ground + primary text
        primary: {
          DEFAULT: 'var(--c-brand)',
          foreground: 'var(--c-on-brand)',
        },
        secondary: {
          DEFAULT: 'var(--c-well)',
          foreground: 'var(--c-ink)',
        },
        accent: {
          DEFAULT: 'var(--c-brand-tint)',
          foreground: 'var(--c-ink)',
        },
        destructive: {
          DEFAULT: 'var(--c-neg)',
          foreground: 'var(--c-paper)',
        },
        muted: {
          DEFAULT: 'var(--c-well)',
          foreground: 'var(--c-ink-muted)',
        },
        popover: {
          DEFAULT: 'var(--c-elevated)',
          foreground: 'var(--c-ink)',
        },
        card: {
          DEFAULT: 'var(--c-paper)',
          foreground: 'var(--c-ink)',
        },
        border: 'var(--c-line)',
        input: 'var(--c-line)',
        ring: 'var(--c-brand)',
        background: 'var(--c-paper)',
        foreground: 'var(--c-ink)',
      },
      fontFamily: {
        serif: ['Newsreader', 'Georgia', 'Cambria', 'serif'],
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
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

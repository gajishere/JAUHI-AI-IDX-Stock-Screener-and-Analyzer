/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Surfaces — pure white ground; warmth lives in the brand color, not the paper
        paper: 'oklch(1 0 0)',
        well: 'oklch(0.967 0.003 48)',
        'well-2': 'oklch(0.93 0.005 48)',
        line: 'oklch(0.885 0.004 48)',
        // Text
        ink: 'oklch(0.235 0.012 48)',
        'ink-muted': 'oklch(0.47 0.015 48)',
        // Brand — burnt amber, used for actions, selection, focus
        brand: 'oklch(0.52 0.13 47)',
        'brand-deep': 'oklch(0.44 0.11 47)',
        'brand-tint': 'oklch(0.96 0.018 47)',
        // Informational accent — deep teal, used for neutral badges (confidence, mode)
        info: 'oklch(0.40 0.06 200)',
        'info-tint': 'oklch(0.955 0.014 200)',
        // Semantic verdicts — only where meaning is carried
        pos: 'oklch(0.49 0.105 155)',
        'pos-tint': 'oklch(0.962 0.03 155)',
        neg: 'oklch(0.5 0.16 27)',
        'neg-tint': 'oklch(0.962 0.02 27)',
        warn: 'oklch(0.5 0.1 80)',
        'warn-tint': 'oklch(0.965 0.045 95)',
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

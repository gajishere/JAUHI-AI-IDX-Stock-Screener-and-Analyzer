// The JA monogram brand mark, used inline in the header and anywhere the
// brand needs to appear. Two transparent-background PNGs were generated from
// the original logo — a dark-ink mark (for the light theme) and a light mark
// (for the dark theme). The active theme comes from the app-wide ThemeContext,
// so the mark always matches what's on screen (including a manual toggle).

import { useTheme } from '../lib/theme';

/**
 * @param {object} props
 * @param {string} [props.className] - sizing classes (size driven here, not in CSS)
 * @param {string} [props.alt] - accessible label
 */
export default function Logo({ className = 'h-9 w-auto', alt = 'JA logo' }) {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  return (
    <img
      src={dark ? '/logo-mark-light.png' : '/logo-mark-dark.png'}
      alt={alt}
      className={className}
      // Intrinsic mark is ~1.38:1 (wider than tall). Set the height and let
      // the width scale to match — never force a square, which stretches it.
      width={192}
      height={139}
      draggable={false}
    />
  );
}

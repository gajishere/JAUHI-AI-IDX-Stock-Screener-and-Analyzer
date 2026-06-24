// iOS segmented control — one shared track with the active segment carried by a
// sliding pill that springs between slots. This is the signature native motion
// (the same vocabulary already used by the Settings theme/sound toggles), pulled
// into one reusable component so every tab/segment switch across the app glides
// with the SAME settle spring instead of jumping on an instant bg swap.
//
// The indicator GLIDES via transform; it is sized and positioned by MEASURING
// the active button rather than assuming equal-width slots. Equal-width math
// breaks the moment labels differ in length (e.g. "EOD close" vs "Midday", or
// "15" vs "3"): `whitespace-nowrap` + per-button padding makes the wider label's
// min-content exceed its even share, so flexbox hands it more room and the pill
// — computed from a fixed slot width — lands off-centre. Measuring the real
// button keeps the pill locked to it for any label set. A ResizeObserver
// re-measures when the track resizes (responsive reflow, font load, popover
// open). Reduced motion is handled by the global `* { transition-duration }`
// rule in index.css, so the pill snaps to the slot for motion-sensitive users.

import { useLayoutEffect, useRef, useState } from 'react';

export function Segmented({
  // options: [{ value, label, icon?: ReactNode, title?: string }]
  options,
  value,
  onChange,
  ariaLabel,
  // role for the group: 'group' (default) or 'radiogroup' for a single-select.
  role = 'group',
  className = '',
  // Size of each segment button. The min-height keeps touch targets ≥44px on
  // coarse pointers (sm: drops to ≥36px on fine pointers, matching the rest of
  // the chrome controls).
  size = 'md',
}) {
  const activeIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const count = options.length;

  const trackRef = useRef(null);
  const btnRefs = useRef([]);
  // The pill geometry, measured from the active button: x is its offset from the
  // first button's left edge (which is where the pill rests via `left-1`), w is
  // the button's rendered width. Null until the first measure so the CSS
  // fallback below carries the very first paint.
  const [pill, setPill] = useState(null);

  useLayoutEffect(() => {
    const measure = () => {
      const first = btnRefs.current[0];
      const active = btnRefs.current[activeIndex];
      if (!first || !active) return;
      // offsetLeft/offsetWidth are LAYOUT values, immune to any ancestor
      // transform — the pill must track the button's layout box, not its
      // visual box. getBoundingClientRect would read the scaled-down size while
      // a parent popover is mid spring-scale and freeze the pill too narrow.
      setPill({ x: active.offsetLeft - first.offsetLeft, w: active.offsetWidth });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (trackRef.current) ro.observe(trackRef.current);
    return () => ro.disconnect();
  }, [activeIndex, count, value]);

  const sizeClasses =
    size === 'sm'
      ? 'min-h-9 px-3 text-xs'
      : 'min-h-11 sm:min-h-9 px-3 text-xs';

  return (
    <div
      ref={trackRef}
      role={role}
      aria-label={ariaLabel}
      className={`relative inline-flex w-full items-center rounded-full border border-line bg-well/60 p-1 ${className}`}
    >
      {/* The sliding pill. Sits behind the buttons (z-0); they're lifted to z-1
          so their content stays crisp above the moving fill. Rests at the first
          button's left edge (left-1 = the track's content origin) and translates
          to the measured active button. */}
      <span
        aria-hidden="true"
        className="absolute top-1 bottom-1 left-1 z-0 rounded-full bg-brand shadow-sm shadow-brand/25"
        style={{
          width: pill ? `${pill.w}px` : `calc((100% - 8px) / ${count})`,
          transform: pill
            ? `translateX(${pill.x}px)`
            : `translateX(calc(${activeIndex} * 100%))`,
          transition:
            'transform var(--spring-settle-dur) var(--spring-settle), width var(--spring-settle-dur) var(--spring-settle)',
        }}
      />
      {options.map((opt, i) => {
        const active = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            ref={(el) => {
              btnRefs.current[i] = el;
            }}
            type="button"
            role={role === 'radiogroup' ? 'radio' : undefined}
            aria-checked={role === 'radiogroup' ? active : undefined}
            aria-pressed={role === 'radiogroup' ? undefined : active}
            title={opt.title}
            onClick={() => onChange(opt.value)}
            className={`tactile-soft relative z-[1] inline-flex ${sizeClasses} flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-medium ${
              active ? 'text-on-brand' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export default Segmented;

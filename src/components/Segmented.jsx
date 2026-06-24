// iOS segmented control — one shared track with the active segment carried by a
// sliding pill that springs between slots. This is the signature native motion
// (the same vocabulary already used by the Settings theme/sound toggles), pulled
// into one reusable component so every tab/segment switch across the app glides
// with the SAME settle spring instead of jumping on an instant bg swap.
//
// The indicator is absolutely positioned and translated by the active index, so
// it GLIDES rather than cross-fading; transform/opacity only, GPU-friendly.
// Reduced motion is handled by the global `* { transition-duration: 0.01ms }`
// rule in index.css, so the pill snaps to the slot for motion-sensitive users
// with no extra wiring here.

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
  // The indicator sits inside the track's padding (p-1 = 4px), so its width is
  // one slot minus the per-side inset, and it translates by one slot per index.
  const gap = 4;

  const sizeClasses =
    size === 'sm'
      ? 'min-h-9 px-3 text-xs'
      : 'min-h-11 sm:min-h-9 px-3 text-xs';

  return (
    <div
      role={role}
      aria-label={ariaLabel}
      className={`relative inline-flex w-full items-center rounded-full border border-line bg-well/60 p-1 ${className}`}
    >
      {/* The sliding pill. Sits behind the buttons (z-0); they're lifted to z-1
          so their content stays crisp above the moving fill. */}
      <span
        aria-hidden="true"
        className="absolute top-1 bottom-1 left-1 z-0 rounded-full bg-brand shadow-sm shadow-brand/25"
        style={{
          width: `calc((100% - ${gap * 2}px) / ${count})`,
          transform: `translateX(calc(${activeIndex} * 100%))`,
          transition:
            'transform var(--spring-settle-dur) var(--spring-settle)',
        }}
      />
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={String(opt.value)}
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

// iOS-style spring physics for the web, expressed in a way CSS and WAAPI can both use.
//
// Apple describes springs by (mass, stiffness, damping). The browser's timing-function
// grammar only takes fixed curves, so we precompute the analytic spring response and
// express it as a `linear()` easing list (CSS) and an equivalent set of easing points
// for the Web Animations API. WAAPI's `linear()` easing accepts the same stops, so one
// definition drives both — a press in CSS and a modal entrance in WAAPI share one body.
//
// The math: underdamped spring position over time,
//   s(t) = 1 - e^(-c·t) · ( cos(w·t) + (c/w)·sin(w·t) )
// where c = damping/(2·mass) and w = sqrt(stiffness/mass - c²). Solving for the t that
// reaches a settling threshold gives a finite, non-arbitrary duration — which is why these
// durations are "as long as the physics takes", not a picked number.

const STEPS = 30;

// Solve the underdamped spring response and render it as a `linear()` easing string.
// Returns both the easing and the natural duration (ms to reach the settle threshold).
function makeSpring(mass, stiffness, damping, settle = 0.005) {
  const c = damping / (2 * mass); // decay rate
  const omega0 = Math.sqrt(stiffness / mass);
  const omega = Math.sqrt(Math.max(omega0 * omega0 - c * c, 0.0001));

  // Find the natural duration: walk forward until the response stays within ±settle.
  let duration = 2;
  const sample = (t) => {
    const e = Math.exp(-c * t);
    return 1 - e * (Math.cos(omega * t) + (c / omega) * Math.sin(omega * t));
  };
  // First-pass: find when oscillation amplitude drops below settle, cap at ~2.5s.
  for (let t = 0; t <= 2.5; t += 0.004) {
    if (t > 0.05 && Math.abs(sample(t) - 1) <= settle) {
      duration = t;
      break;
    }
  }
  // Sample STEPS stops along [0, duration] for the `linear()` list.
  // CSS `linear()` syntax is `<output-number> <input-position>%`: the output is
  // the eased progress (unitless, may exceed 1 on overshoot), the input position
  // is the fraction of elapsed time as a percentage. (Emitting `<pct>% <ms>` —
  // output as a percentage, input as a time — is invalid and the browser drops
  // it back to `ease`, silently killing every spring.)
  const stops = [];
  for (let i = 0; i <= STEPS; i++) {
    const t = (duration * i) / STEPS;
    const y = sample(t);
    const inputPct = (i / STEPS) * 100;
    stops.push(`${y.toFixed(5)} ${inputPct.toFixed(2)}%`);
  }
  return {
    css: `linear(${stops.join(', ')})`,
    duration: Math.round(duration * 1000),
  };
}

// The spring library. Tuned to the "Reading Room Terminal": decisive but quiet.
//   - press: a tap-down. Snappy, slightly underdamped so the settle has a hair of life.
//   - modal: a content layer rising into place. Settles without overshoot — reads as
//            "a real object decelerating", which is what makes iOS sheets feel native.
//   - popover: faster than modal (it's lighter chrome), same no-overshoot family.
//   - reveal: list items and route panels. A gentle lift, the lightest spring here.
//   - settle: the slowest, used for the theme/radio indicator that glides between slots.
export const SPRINGS = {
  press: makeSpring(1, 320, 26),
  modal: makeSpring(1, 150, 18),
  popover: makeSpring(1, 210, 24),
  reveal: makeSpring(1, 170, 20),
  settle: makeSpring(1, 120, 16),
};

// CSS custom properties for every spring, ready to drop into :root.
export const springCustomProperties = () =>
  Object.fromEntries(
    Object.entries(SPRINGS).map(([k, v]) => [`--spring-${k}`, v.css]),
  );

// WAAPI keyframe factories. Each returns the keyframes + options; the caller passes
// them to element.animate(). Centralizing them here keeps every enter/exit paired and
// visually inverse — exits use ~75% of the enter duration, per the easing craft rule.
export const presets = {
  // A floating layer rising into place: opacity + a small upward translate + a scale
  // that settles from 0.985 to 1 (the "iOS sheet" read). Backdrop is a plain fade.
  modalEnter: {
    keyframes: [
      { opacity: 0, transform: 'translateY(14px) scale(0.985)' },
      { opacity: 1, transform: 'translateY(0px) scale(1)' },
    ],
    options: { duration: SPRINGS.modal.duration, easing: SPRINGS.modal.css, fill: 'forwards' },
  },
  modalExit: {
    keyframes: [
      { opacity: 1, transform: 'translateY(0px) scale(1)' },
      { opacity: 0, transform: 'translateY(8px) scale(0.99)' },
    ],
    options: { duration: Math.round(SPRINGS.modal.duration * 0.75), easing: 'ease-in', fill: 'forwards' },
  },
  // Popover/dropdown: origin-aware. The caller sets transform-origin on the element;
  // the keyframes scale + fade so it reads as expanding *from the trigger*.
  popoverEnter: {
    keyframes: [
      { opacity: 0, transform: 'translateY(-6px) scale(0.96)' },
      { opacity: 1, transform: 'translateY(0) scale(1)' },
    ],
    options: { duration: SPRINGS.popover.duration, easing: SPRINGS.popover.css, fill: 'forwards' },
  },
  popoverExit: {
    keyframes: [
      { opacity: 1, transform: 'translateY(0) scale(1)' },
      { opacity: 0, transform: 'translateY(-4px) scale(0.97)' },
    ],
    options: { duration: Math.round(SPRINGS.popover.duration * 0.7), easing: 'ease-in', fill: 'forwards' },
  },
  // Backdrop: a pure opacity fade in both directions. No transform — the dim layer
  // has no "position" to spring from; fading reads as the scrim simply drawing in.
  backdropEnter: {
    keyframes: [{ opacity: 0 }, { opacity: 1 }],
    options: { duration: 180, easing: 'ease-out', fill: 'forwards' },
  },
  backdropExit: {
    keyframes: [{ opacity: 1 }, { opacity: 0 }],
    options: { duration: 140, easing: 'ease-in', fill: 'forwards' },
  },
};

// A reduced-motion override applied to any WAAPI options object. Under
// prefers-reduced-motion the animation is shortened to a near-instant crossfade so
// state still resolves without motion. The caller is expected to check the query
// itself; this just clamps the duration.
export const withReducedMotion = (options, prefersReduced) =>
  prefersReduced ? { ...options, duration: 1 } : options;

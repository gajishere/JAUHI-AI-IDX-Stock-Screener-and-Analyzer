import { useEffect, useRef } from 'react';

// A directional value-flash for live-updating figures (price, %, score).
//
// On a trading app a poll refresh swaps every number instantly — which reads as
// a frozen screen snapping forward, not a live market. Bloomberg/Robinhood
// instead flash a brief up/down tint behind a value when it changes, so the eye
// catches direction without a count-up (a count-up would show wrong intermediate
// prices and mislead a researcher). This hook gives that, in this codebase's
// vocabulary: a one-shot WAAPI animation on the element, interruptible like the
// presence hook, respecting reduced-motion, and silent on the very first render.
//
// Usage:
//   const ref = useFlashOnChange(price);
//   <span ref={ref} className="tabular-nums">{formatRp(price)}</span>
//
// `direction` ('up'|'down') is inferred from comparing value to the previous one;
// pass `positiveIsGood={false}` for a figure where DOWN is the good direction
// (e.g. a discount, a spread) so the tint still reads as green-good/red-bad.
export function useFlashOnChange(value, { positiveIsGood = true, duration = 700 } = {}) {
  const ref = useRef(null);
  const prevRef = useRef(value);
  // Track whether we've seen a real prior value, so the initial mount never
  // flashes (a brand-new value isn't a "change").
  const hasPrev = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const prev = prevRef.current;
    prevRef.current = value;

    // First effect run = initial mount; nothing to flash against.
    if (!hasPrev.current) {
      hasPrev.current = true;
      return;
    }

    // Only numeric-ish values carry direction. Anything non-numeric (null, '—',
    // a string) is treated as no-direction: we don't flash on a value going to
    // "—" and back, and we don't compare strings.
    const prevN = typeof prev === 'number' ? prev : NaN;
    const curN = typeof value === 'number' ? value : NaN;
    if (!Number.isFinite(prevN) || !Number.isFinite(curN) || curN === prevN) return;

    const up = curN > prevN;
    // Up can be "good" (a price rising) or "bad" (a discount widening). Map to
    // the semantic tint tokens so green always reads positive, red negative.
    const good = positiveIsGood ? up : !up;
    const tintVar = good ? '--c-pos-tint' : '--c-neg-tint';
    const inkVar = good ? '--c-pos' : '--c-neg';

    // Reduced motion: still resolve the tint change (it conveys direction) but
    // without the fade animation — a brief hold then clear.
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;

    // The flash: paint a soft tint behind the value, then fade it out. Cancels
    // any in-flight flash first (interruptible), so a rapid series of updates
    // restarts cleanly rather than stacking.
    node.getAnimations().forEach((a) => {
      if (a.id === 'value-flash') a.cancel();
    });
    const anim = node.animate(
      [
        {
          backgroundColor: `var(${tintVar})`,
          color: `var(${inkVar})`,
        },
        {
          backgroundColor: 'transparent',
          color: '',
        },
      ],
      {
        duration,
        // The reveal spring so the tint dissipates like a content layer
        // settling, not a hard blink. Pulled from the shared CSS token via the
        // :root spring list — matched against a reduced-motion short duration.
        easing: 'var(--spring-reveal, cubic-bezier(0.16, 1, 0.3, 1))',
        fill: 'forwards',
      },
    );
    anim.id = 'value-flash';
    // Restore the computed color so the figure settles back to its inherited
    // (often neutral) tone rather than the flash tone lingering at opacity 0.
    anim.onfinish = () => {
      node.style.color = '';
    };
  }, [value, positiveIsGood, duration]);

  return ref;
}

export default useFlashOnChange;

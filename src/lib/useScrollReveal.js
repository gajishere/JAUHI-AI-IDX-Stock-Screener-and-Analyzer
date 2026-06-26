import { useEffect, useRef } from 'react';

// Cosmoq-style scroll reveal: a section lifts + fades in the first time it
// scrolls into view, then stays put. Backed by one IntersectionObserver so it
// costs nothing on scroll. The element is marked `data-reveal="pending"` (which
// the CSS hides + offsets) only after mount, so server/no-JS render shows it,
// and `.is-visible` (added on intersection) springs it into place.
//
// Honors prefers-reduced-motion by never hiding the element — it just stays
// visible. Returns a ref to spread onto the section you want to reveal.
export function useScrollReveal({ threshold = 0.12, rootMargin = '0px 0px -8% 0px' } = {}) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Reduced motion (or no observer support): show immediately, no reveal.
    if (reduced || typeof IntersectionObserver === 'undefined') {
      el.dataset.reveal = 'done';
      el.classList.add('is-visible');
      return;
    }

    el.dataset.reveal = 'pending';

    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            obs.unobserve(entry.target);
          }
        }
      },
      { threshold, rootMargin },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold, rootMargin]);

  return ref;
}

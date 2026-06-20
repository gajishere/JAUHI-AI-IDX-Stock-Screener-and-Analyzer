import { useEffect, useRef } from 'react';

// iOS-style rubber-banding for a scroll container.
//
// CSS `overscroll-behavior: contain` already stops scroll-chaining to the page and is
// the right default everywhere (see `.ios-scroll` in index.css). What it can't do is the
// signature iOS gesture: when you drag past the top or bottom edge, the content moves
// with increasing *resistance* and snaps back on release. That's this hook.
//
// It binds only to touch (pointer: coarse) so trackpads/mice scroll normally, applies
// a 1/d diminishing resistance (the iOS curve), animates the snap-back via WAAPI so it
// interrupts cleanly if you grab again mid-snap, and is a no-op under reduced-motion.
//
// Attach to any overflow container:
//   const ref = useElasticScroll();
//   <div ref={ref} className="ios-scroll max-h-72 overflow-y-auto">…</div>
export function useElasticScroll({ resistance = 180 } = {}) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Only wire up on coarse pointers (touch). Trackpads already feel fine.
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!coarse || reduced) return;

    let active = false;
    let startY = 0;
    let dy = 0;
    let edge = null; // 'top' | 'bottom' | null
    let snapAnim = null;

    const cancelSnap = () => {
      if (snapAnim) {
        snapAnim.cancel();
        snapAnim = null;
      }
    };

    const onTouchStart = (e) => {
      // Only single-finger drags; ignore multi-touch (pinch-zoom etc).
      if (e.touches.length !== 1) return;
      cancelSnap();
      active = true;
      startY = e.touches[0].clientY;
      dy = 0;
      edge = null;
    };

    const onTouchMove = (e) => {
      if (!active) return;
      const y = e.touches[0].clientY;
      const delta = y - startY;
      const atTop = el.scrollTop <= 0;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;

      // Decide which edge we're pulling past, if any. Lock to that edge for the
      // rest of the gesture so crossing back through zero doesn't flicker.
      if (edge === null) {
        if (delta > 0 && atTop) edge = 'top';
        else if (delta < 0 && atBottom) edge = 'bottom';
      }

      if (edge) {
        // iOS resistance: each pixel of finger movement moves the content less.
        // 1 - (Δ / (Δ + resistance)) gives a smooth diminishing curve.
        const resisted = (delta / (delta + resistance)) * resistance;
        dy = resisted;
        el.style.transform = `translateY(${resisted}px)`;
        // Prevent the page from scrolling while we rubber-band.
        if (e.cancelable) e.preventDefault();
      }
    };

    const snapBack = () => {
      cancelSnap();
      snapAnim = el.animate(
        [
          { transform: `translateY(${dy}px)` },
          { transform: 'translateY(0px)' },
        ],
        { duration: 420, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' },
      );
      snapAnim.onfinish = () => {
        el.style.transform = '';
        snapAnim = null;
      };
    };

    const onTouchEnd = () => {
      if (!active) return;
      active = false;
      if (dy !== 0) snapBack();
      dy = 0;
      edge = null;
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
      cancelSnap();
    };
  }, [resistance]);

  return ref;
}

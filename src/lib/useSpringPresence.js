import { useLayoutEffect, useRef, useState } from 'react';
import { presets, withReducedMotion } from './motion';

// These hooks drive enter/exit in a LAYOUT effect (synchronous, after the DOM mutation
// but BEFORE the browser paints) so a freshly-mounted node starts from keyframe[0] —
// opacity 0, scaled down — with no one-frame flash of the final state. They only ever
// run for client-only chrome (modals, the settings popover), never server-rendered, so
// useLayoutEffect is safe here.

// Interruptible enter/exit presence for floating chrome (modals, popovers, dropdowns).
//
// The problem this solves: most React exit animations use a class swap + setTimeout, so
// if the user re-opens the element mid-exit, the new enter animation fights the leaving
// styles, and the unmount timer can fire during the new animation and yank it away. iOS
// overlays never do this — they always feel fluid because they cancel and restart cleanly.
//
// The WAAPI approach is interruptible by construction: element.animate() cancels any
// animation already running on those properties, so toggling open/closed/open in quick
// succession just restarts the enter each time, with no timer bookkeeping to desync.
//
// Usage:
//   const { mounted, nodeRef } = useSpringPresence(isOpen, presets.popoverEnter, presets.popoverExit);
//   return mounted && <div ref={nodeRef} ... />
//
// `mounted` stays true while an exit animation is playing; it flips to false (unmounting
// the node) only when the exit finishes. The hook drives BOTH animations through the
// ref, so there's no CSS class to forget.
//
// The mount/unmount decision is the one place React's render cycle must bridge to WAAPI
// (an external animation system that needs the node to exist before it can animate). The
// set-state-in-effect lint rule flags this pattern because it *usually* signals a mistake;
// here it's the documented exception, so the rule is scoped off on that single line.
export function useSpringPresence(open, enterPreset, exitPreset) {
  const [mounted, setMounted] = useState(open);
  const nodeRef = useRef(null);
  const reducedRef = useRef(
    typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useLayoutEffect(() => {
    // When opening, ensure the node is mounted so we have something to animate. This
    // setState is the React↔WAAPI bridge: WAAPI is an external system that needs the
    // DOM node present before element.animate() can run, and React owns whether the
    // node exists. Functional update guards against a redundant render.
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMounted((m) => m || true);
    }

    const node = nodeRef.current;
    if (!node) return;

    if (open) {
      // Entering (or re-entering mid-exit). cancel() makes the restart atomic.
      node.getAnimations().forEach((a) => a.cancel());
      node.animate(
        enterPreset.keyframes,
        withReducedMotion(enterPreset.options, reducedRef.current),
      );
    } else {
      // Exiting. Hold the node mounted until the exit resolves, then unmount.
      node.getAnimations().forEach((a) => a.cancel());
      const anim = node.animate(
        exitPreset.keyframes,
        withReducedMotion(exitPreset.options, reducedRef.current),
      );
      anim.onfinish = () => setMounted(false);
      anim.oncancel = () => {
        // If a new enter superseded us, onfinish won't fire — leave mounted as-is.
      };
    }
    // `mounted` is in the deps for the FIRST-OPEN case: when `open` flips true the
    // node isn't in the DOM yet, so this effect's first run bails at `if (!node)`
    // after scheduling the mount. Including `mounted` makes the effect run again
    // once setMounted(true) commits the node — that second run finds the node and
    // plays the enter. Without it, the panel mounts but never animates (it just
    // appears). enterPreset/exitPreset are stable module constants (presets.* from
    // motion.js), intentionally excluded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mounted]);

  return { mounted, nodeRef };
}

// A convenience: animate a backdrop element in parallel with the presence node.
// Same interruptible semantics, but the backdrop is driven by a separate ref so it
// can live in a different DOM subtree (e.g. the Modal's portal siblings).
export function useBackdropPresence(open) {
  const [mounted, setMounted] = useState(open);
  const ref = useRef(null);
  const reducedRef = useRef(
    typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useLayoutEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMounted((m) => m || true);
    }

    const node = ref.current;
    if (!node) return;

    if (open) {
      node.getAnimations().forEach((a) => a.cancel());
      node.animate(
        presets.backdropEnter.keyframes,
        withReducedMotion(presets.backdropEnter.options, reducedRef.current),
      );
    } else {
      node.getAnimations().forEach((a) => a.cancel());
      const anim = node.animate(
        presets.backdropExit.keyframes,
        withReducedMotion(presets.backdropExit.options, reducedRef.current),
      );
      anim.onfinish = () => setMounted(false);
    }
    // `mounted` included so the freshly-mounted backdrop plays its fade on first
    // open too (same first-open fix as useSpringPresence above).
  }, [open, mounted]);

  return { mounted, ref };
}

import { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../lib/i18n';
import { presets } from '../lib/motion';
import { useSpringPresence, useBackdropPresence } from '../lib/useSpringPresence';

// A centered modal over a dimmed backdrop. Escape and backdrop-click close it; focus
// moves into the dialog on open and the page scroll is locked.
//
// Enter/exit run through WAAPI via the presence hooks, which makes them INTERRUPTIBLE:
// reopening mid-exit just cancels the exit and replays the enter, no timer desync, no
// jank — the way iOS overlays always feel fluid. The dialog uses the real modal spring
// (opacity + upward translate + a 0.985→1 scale settle, the "iOS sheet" read); the
// backdrop is a plain fade (a scrim has no position to spring from).
export function Modal({ open, onClose, title, description, children, labelledById = 'modal-title', variant = 'glass' }) {
  const t = useT();
  const dialogRef = useRef(null);

  // Drive both layers through the interruptible presence hooks. `mounted` stays true
  // while an exit is playing and flips false only when the exit resolves — so the node
  // stays on screen for the full leave animation, then unmounts cleanly.
  const { mounted: dialogMounted, nodeRef: dialogAnimRef } = useSpringPresence(
    open,
    presets.modalEnter,
    presets.modalExit,
  );
  const { mounted: backdropMounted, ref: backdropRef } = useBackdropPresence(open);

  const handleClose = useCallback(() => {
    onClose?.();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Focus the dialog for screen readers once it's mounted. Deferred so the
    // presence node has been committed to the DOM by the time we focus it.
    const focusTimer = setTimeout(() => dialogRef.current?.focus(), 0);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      clearTimeout(focusTimer);
    };
  }, [open, handleClose]);

  // Render the portal while open OR while either layer is still mid-exit. Derived from
  // the presence hooks' own mount state — no extra effect or state needed.
  const shouldRender = open || dialogMounted || backdropMounted;
  if (!shouldRender) return null;

  // Merge the presence ref with our focus ref.
  const setDialogRef = (node) => {
    dialogRef.current = node;
    dialogAnimRef.current = node;
  };

  // Render into a portal so `position: fixed` resolves against the viewport, not a
  // parent that creates a containing block (e.g. .route-panel's transform animation).
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onMouseDown={(e) => {
        // Close only when the backdrop itself (not the card) is pressed.
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      {/* Backdrop */}
      {backdropMounted && (
        <div
          ref={backdropRef}
          className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
          aria-hidden="true"
        />
      )}
      {dialogMounted && (
        <div
          ref={setDialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelledById}
          tabIndex={-1}
          className={`relative w-full max-w-lg rounded-xl p-7 outline-none ${
            variant === 'glass' ? 'glass-surface' : 'surface-float border border-line bg-elevated'
          }`}
        >
          <div className="flex items-start justify-between gap-6">
            <div>
              <h2 id={labelledById} className="font-serif text-2xl font-medium tracking-tight">
                {title}
              </h2>
              {description && <p className="mt-1.5 text-sm text-ink-muted">{description}</p>}
            </div>
            <button
              type="button"
              onClick={handleClose}
              aria-label={t('Close', 'Tutup')}
              className="tactile-soft -mr-1 -mt-1 shrink-0 rounded-md p-1.5 text-ink-muted hover:bg-well hover:text-ink"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          <div className="mt-5">{children}</div>
        </div>
      )}
    </div>,
    document.body,
  );
}

import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../lib/i18n';
import { useGlassSpecular } from '../lib/useGlassSpecular';

// Leave animation duration — matches the CSS .modal-leave-backdrop timing.
const LEAVE_MS = 180;

// A centered modal over a dimmed backdrop. Escape and backdrop-click close it;
// focus moves into the dialog on open and the page scroll is locked. The modal
// plays an entrance animation on open and a leave animation on close; the
// parent's state flips immediately (onClose fires on the trigger, not on
// unmount) while the component delays its own unmount to play the exit.
export function Modal({ open, onClose, title, description, children, labelledById = 'modal-title' }) {
  const t = useT();
  const dialogRef = useRef(null);
  // Drives the pointer-tracked specular highlight on the glass panel.
  const glassRef = useGlassSpecular();
  const [closing, setClosing] = useState(false);
  const closeTimeout = useRef(null);
  const isClosing = closing && !open;

  const handleClose = useCallback(() => {
    if (!open && closing) return;
    onClose?.();
    setClosing(true);
    closeTimeout.current = setTimeout(() => setClosing(false), LEAVE_MS);
  }, [closing, onClose, open]);

  useEffect(() => {
    if (!open && !closing) return;
    const onKey = (e) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (!isClosing) dialogRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, closing, isClosing, handleClose]);

  // Cleanup timeout on unmount.
  useEffect(() => () => { if (closeTimeout.current) clearTimeout(closeTimeout.current); }, []);

  if (!open && !closing) return null;

  // Render into a portal so that `position: fixed` is resolved against the
  // viewport, not a parent that happens to create a containing block (e.g.
  // .route-panel's transform animation).
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onMouseDown={(e) => {
        // Close only when the backdrop itself (not the card) is pressed.
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-[2px] ${isClosing ? 'modal-leave-backdrop' : 'modal-enter-backdrop'}`}
        aria-hidden="true"
      />
      <div
        ref={(node) => {
          dialogRef.current = node;
          glassRef.current = node;
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledById}
        tabIndex={-1}
        className={`surface-glass glass-morph relative w-full max-w-lg rounded-2xl border border-line p-7 outline-none ${isClosing ? 'modal-leave' : 'modal-enter'}`}
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
            className="spring -mr-1 -mt-1 shrink-0 rounded-md p-1.5 text-ink-muted transition-colors hover:bg-well hover:text-ink"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>,
    document.body
  );
}

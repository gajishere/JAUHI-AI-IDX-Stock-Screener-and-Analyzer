import { useEffect, useRef } from 'react';

// A centered modal over a dimmed backdrop. Escape and backdrop-click close it;
// focus moves into the dialog on open and the page scroll is locked. The modal
// renders only while `open` (controlled by the parent) and plays an entrance
// animation — closing is immediate, which keeps the open/close state a single
// source of truth and avoids render loops.
export function Modal({ open, onClose, title, description, children, labelledById = 'modal-title' }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onMouseDown={(e) => {
        // Close only when the backdrop itself (not the card) is pressed.
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      {/* Backdrop */}
      <div
        className="modal-enter-backdrop absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledById}
        tabIndex={-1}
        className="modal-enter relative w-full max-w-lg rounded-xl border border-line bg-paper p-7 shadow-2xl shadow-ink/20 outline-none"
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
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 shrink-0 rounded-md p-1.5 text-ink-muted transition-colors hover:bg-well hover:text-ink"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}

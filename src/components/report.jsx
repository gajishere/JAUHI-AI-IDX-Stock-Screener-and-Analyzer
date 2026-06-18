// Shared report vocabulary — every analytical surface speaks the same language.
import { useState } from 'react';
import { ratingTone } from './reportStyles';
import { useT } from '../lib/i18n';

const BROKER_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const RATING_TONES = {
  pos: 'bg-pos-tint text-pos',
  warn: 'bg-warn-tint text-warn',
  neg: 'bg-neg-tint text-neg',
};

const RATING_TEXT_TONES = {
  pos: 'text-pos',
  warn: 'text-warn',
  neg: 'text-neg',
};

export function RatingBadge({ rating }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 font-mono text-xs font-medium ${RATING_TONES[ratingTone(rating)]}`}
    >
      {rating}
    </span>
  );
}

export function RatingFigure({ rating, className = '' }) {
  return (
    <span className={`font-serif font-medium ${RATING_TEXT_TONES[ratingTone(rating)]} ${className}`}>
      {rating}
    </span>
  );
}

// A labelled value with a dotted leader, the typographic spine of the report.
export function Row({ label, value, tone }) {
  return (
    <div className="flex items-baseline gap-2 py-1.5">
      <span className="shrink-0 text-sm text-ink-muted">{label}</span>
      <span aria-hidden="true" className="min-w-4 flex-1 -translate-y-1 border-b border-dotted border-line" />
      <span className={`max-w-[70%] text-right text-sm font-medium tabular-nums ${tone ?? ''}`}>
        {value}
      </span>
    </div>
  );
}

export function Section({ title, aside, children }) {
  return (
    <section className="mt-8 border-t border-line pt-5 first:mt-0 first:border-t-0 first:pt-0">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h3 className="font-serif text-xl font-medium">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Pill({ children, tone = 'info', className = '' }) {
  const tones = {
    info: 'bg-info-tint text-info',
    brand: 'bg-brand-tint text-brand-strong',
    pos: 'bg-pos-tint text-pos',
    warn: 'bg-warn-tint text-warn',
    neg: 'bg-neg-tint text-neg',
    muted: 'bg-well text-ink-muted',
  };
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]} transition-colors duration-150 ${className}`}>
      {children}
    </span>
  );
}

export function PrimaryButton({ children, disabled, loading, type = 'button', onClick }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand bg-gradient-to-b from-brand to-brand-deep px-5 py-2.5 text-sm font-medium text-on-brand shadow-[0_4px_14px_-5px_color-mix(in_srgb,var(--c-brand)_60%,transparent)] transition-[background-image,box-shadow,transform,opacity] duration-150 ease-out hover:-translate-y-px hover:from-brand-deep hover:to-brand-deep hover:shadow-[0_9px_24px_-7px_color-mix(in_srgb,var(--c-brand)_72%,transparent)] active:translate-y-0 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none disabled:hover:translate-y-0"
    >
      {loading && (
        <span
          aria-hidden="true"
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-on-brand/40 border-t-on-brand motion-reduce:animate-none"
        />
      )}
      {children}
    </button>
  );
}

export function QuietButton({ children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="surface-raised inline-flex min-h-11 items-center rounded-md border border-line px-5 py-2.5 text-sm font-medium text-ink-muted transition-[border-color,color,transform,box-shadow] duration-150 ease-out hover:-translate-y-px hover:border-ink-muted hover:text-ink active:translate-y-0 active:scale-[0.98]"
    >
      {children}
    </button>
  );
}

export function FieldLabel({ children, htmlFor }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-ink">
      {children}
    </label>
  );
}

// Click-or-drag broker-summary upload. Owns the file input (clears it after each
// pick so the same file can be re-selected) and hands captured images up via
// onAdd(File[]); the parent keeps the list and the dedup. Drag-drop is a pointer
// enhancement — the focusable input inside the label carries the keyboard path.
export function BrokerScreenshotField({ id, files, onAdd, onRemove }) {
  const t = useT();
  const [dragging, setDragging] = useState(false);

  // Materialize the FileList synchronously before the input is cleared.
  const addFiles = (list) => {
    const incoming = Array.from(list ?? []).filter((f) => BROKER_IMAGE_TYPES.has(f.type));
    if (incoming.length) onAdd(incoming);
  };

  return (
    <div>
      <label
        htmlFor={id}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-7 text-center text-sm transition-[background-color,border-color,transform] duration-200 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/25 ${
          dragging
            ? 'border-brand bg-brand-tint/70 text-ink scale-[1.01]'
            : 'border-line bg-well/40 text-ink-muted hover:-translate-y-px hover:border-ink-muted/60 hover:bg-well/70'
        }`}
      >
        <svg
          className={`h-6 w-6 transition-colors duration-200 ${dragging ? 'text-brand-strong' : 'text-ink-muted'}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0L8 8m4-4l4 4M4 17v1a3 3 0 003 3h10a3 3 0 003-3v-1" />
        </svg>
        <span className="font-medium text-ink">{dragging ? t('Drop to attach', 'Lepaskan untuk melampirkan') : t('Add broker images', 'Tambah gambar broker')}</span>
        <span className="text-ink-muted">{t('Drag & drop or click · PNG, JPG, WebP, GIF', 'Seret & lepas atau klik · PNG, JPG, WebP, GIF')}</span>
        <input
          id={id}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif"
          multiple
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
          className="sr-only"
        />
      </label>

      {files.length > 0 && (
        <ul className="mt-3 max-h-40 space-y-1.5 overflow-y-auto">
          {files.map((file, index) => (
            <li
              key={`${file.name}:${file.size}`}
              className="list-item-enter flex items-center justify-between gap-3 rounded-md bg-well/60 px-3 py-1.5 text-xs"
              style={{ '--i': index }}
            >
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="truncate text-ink">{file.name}</span>
                <span className="shrink-0 font-mono tabular-nums text-ink-muted">{formatFileSize(file.size)}</span>
              </span>
              <button
                type="button"
                onClick={() => onRemove(index)}
                className="-mr-1 shrink-0 rounded px-1.5 py-1 font-medium text-ink-muted transition-[transform,color] duration-200 hover:scale-[1.02] hover:text-neg active:scale-[0.95]"
                aria-label={t(`Remove ${file.name}`, `Hapus ${file.name}`)}
              >
                {t('Remove', 'Hapus')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ReportSkeleton() {
  const t = useT();
  return (
    <div role="status" aria-label={t('Preparing the report', 'Menyiapkan laporan')} className="mt-10 space-y-4">
      <div className="skeleton h-9 w-2/5" />
      <div className="skeleton h-4 w-3/5" />
      <div className="mt-6 space-y-2.5">
        <div className="skeleton h-4 w-full" />
        <div className="skeleton h-4 w-11/12" />
        <div className="skeleton h-4 w-4/5" />
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="skeleton h-24" />
        <div className="skeleton h-24" />
        <div className="skeleton h-24" />
      </div>
    </div>
  );
}

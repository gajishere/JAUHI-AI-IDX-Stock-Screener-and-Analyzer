// Non-component pieces of the shared report vocabulary (kept apart for Fast Refresh).

export function ratingTone(rating) {
  if (!rating) return 'neg';
  if (rating.startsWith('A')) return 'pos';
  if (rating.startsWith('B')) return 'warn';
  return 'neg';
}

export const inputClass =
  'tool-input px-3.5 py-2.5 text-sm';

export const fileInputClass =
  'w-full cursor-pointer text-sm text-ink-muted transition-[transform,opacity] duration-200 file:mr-3 file:cursor-pointer file:rounded-full file:border file:border-solid file:border-line file:bg-well file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink hover:file:border-ink-muted/60 hover:file:bg-well-2 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25';

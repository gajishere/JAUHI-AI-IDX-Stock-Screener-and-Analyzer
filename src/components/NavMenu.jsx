import { Fragment, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useT } from '../lib/i18n';
import { useSpringPresence } from '../lib/useSpringPresence';
import { presets } from '../lib/motion';

// The destinations, in nav order. `match` decides the active item from the
// current pathname. '/' is now the marketing landing page (Home); the live
// screener has its own '/auto-screening' route, mirroring App's routing.
const NAV = [
  { to: '/', match: (p) => p === '/', en: 'Home', id: 'Beranda' },
  { to: '/auto-screening', match: (p) => p === '/auto-screening', en: 'Live Screening', id: 'Penyaringan Langsung' },
  { to: '/analysis', match: (p) => p === '/analysis', en: 'Stock Analysis', id: 'Analisis Saham' },
  { to: '/screening', match: (p) => p === '/screening', en: 'Stock Screening', id: 'Penyaringan Saham' },
  { to: '/api-status', match: (p) => p === '/api-status', en: 'API Status', id: 'Status API' },
];

// Three stacked bars that spring-morph into an X when `open` — the morph itself
// lives in index.css (.hamburger-lines), driven by the data-open flag so it
// reuses the same popover spring as the panel it toggles. Transform/opacity only.
function HamburgerLines({ open }) {
  return (
    <span className="hamburger-lines" data-open={open} aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

// The page navigation, collapsed into a single hamburger trigger. The trigger
// doubles as a breadcrumb — it carries the active page name so the current
// location stays visible even though the tab row is gone. The panel is the same
// liquid-glass popover material as SettingsMenu (outside-click + Escape to
// close, interruptible spring presence), with the items cascading in on open.
export function NavMenu() {
  const t = useT();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  const activeItem = NAV.find((n) => n.match(location.pathname)) ?? NAV[0];

  // Close on outside pointer (mouse/touch/pen) or Escape — same contract as the
  // settings popover so the two header menus behave identically.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Belt-and-suspenders: any navigation (a link tap, a deep-link, the browser
  // back button) collapses the menu so it never lingers over the new page.
  // Adjusting state during render (React's documented pattern) instead of an
  // effect avoids the extra commit + cascading render an effect would cause.
  const [lastPath, setLastPath] = useState(location.pathname);
  if (lastPath !== location.pathname) {
    setLastPath(location.pathname);
    setOpen(false);
  }

  // Interruptible presence: the panel scales+fades from its top-left origin (the
  // trigger). Reopening mid-close cancels the close cleanly.
  const { mounted, nodeRef } = useSpringPresence(open, presets.popoverEnter, presets.popoverExit);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('Open navigation menu', 'Buka menu navigasi')}
        // Current page on hover/long-press keeps the breadcrumb cue the inline
        // label used to give, now that the trigger is icon-only.
        title={t(activeItem.en, activeItem.id)}
        className={`tap-target tactile-soft inline-flex h-9 w-9 items-center justify-center rounded-full border border-line bg-paper text-ink-muted shadow-sm shadow-ink/5 hover:text-ink sm:h-10 sm:w-10 ${
          open ? 'text-ink' : ''
        }`}
      >
        <HamburgerLines open={open} />
      </button>

      {mounted && (
        <nav
          ref={nodeRef}
          aria-label={t('Pages', 'Halaman')}
          className="glass-surface absolute right-0 top-[calc(100%+0.5rem)] z-dropdown w-60 max-w-[calc(100vw-2.5rem)] rounded-xl p-1.5"
          style={{ transformOrigin: 'top right' }}
        >
          <p className="px-2.5 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            {t('Pages', 'Halaman')}
          </p>
          {NAV.map((item, i) => {
            const active = item.match(location.pathname);
            return (
              <Fragment key={item.to}>
                {/* Hairline between rows, inset to align with the labels — keeps
                    the rounded hover/active pills clean while grouping the list. */}
                {i > 0 && <div className="mx-2.5 h-px bg-line" aria-hidden="true" />}
                <Link
                  to={item.to}
                  onClick={() => setOpen(false)}
                  aria-current={active ? 'page' : undefined}
                  style={{ '--i': i }}
                  className={`list-item-enter tactile-soft flex min-h-11 items-center justify-between gap-3 rounded-lg px-2.5 text-sm sm:min-h-10 ${
                    active
                      ? 'bg-brand-tint font-medium text-brand-strong'
                      : 'text-ink-muted hover:bg-well-2 hover:text-ink'
                  }`}
                >
                  <span>{t(item.en, item.id)}</span>
                  {active && (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />
                  )}
                </Link>
              </Fragment>
            );
          })}
        </nav>
      )}
    </div>
  );
}

export default NavMenu;

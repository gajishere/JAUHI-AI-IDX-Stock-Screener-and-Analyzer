import { useEffect, useRef, useState } from 'react';
import { useT } from '../lib/i18n';
import { useTheme } from '../lib/theme';
import { useGlassSpecular } from '../lib/useGlassSpecular';
import { LanguageSwitcher } from './LanguageSwitcher';

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[1.05rem] w-[1.05rem]" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path strokeLinecap="round" d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

const THEMES = [
  { value: 'light', labelEn: 'Light', labelId: 'Terang', Icon: SunIcon },
  { value: 'dark', labelEn: 'Dark', labelId: 'Gelap', Icon: MoonIcon },
];

// Top-right settings popover. Houses the appearance (light/dark) toggle and the
// language switcher — the language control used to live directly in the header
// and now lives here. Closes on outside click or Escape.
export function SettingsMenu() {
  const t = useT();
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  // Drives the pointer-tracked specular highlight on the glass popover.
  const glassRef = useGlassSpecular();

  useEffect(() => {
    if (!open) return;
    // pointerdown unifies mouse, touch, and pen — tapping outside on a phone
    // closes the popover as reliably as a desktop click.
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

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t('Settings', 'Pengaturan')}
        title={t('Settings', 'Pengaturan')}
        className={`glass-trigger spring inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-line text-ink-muted transition-[transform,color] duration-200 hover:scale-[1.04] hover:text-ink active:scale-[0.95] sm:min-h-9 sm:min-w-9 ${
          open ? 'text-ink' : ''
        }`}
      >
        <GearIcon />
      </button>

      {open && (
        <div
          ref={glassRef}
          role="dialog"
          aria-label={t('Settings', 'Pengaturan')}
          style={{ transformOrigin: 'top right' }}
          className="surface-glass glass-morph absolute right-0 top-[calc(100%+0.5rem)] z-dropdown w-64 max-w-[calc(100vw-1.5rem)] rounded-2xl border border-line p-4"
        >
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              {t('Appearance', 'Tampilan')}
            </p>
            <div
              role="group"
              aria-label={t('Theme', 'Tema')}
              className="inline-flex w-full items-center gap-1 rounded-full border border-line/70 bg-well/40 p-1 backdrop-blur-sm"
            >
              {THEMES.map(({ value, labelEn, labelId, Icon }) => {
                const active = theme === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTheme(value)}
                    aria-pressed={active}
                        className={`spring inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-medium transition-[transform,color,background-color] duration-200 hover:scale-[1.02] active:scale-[0.95] sm:min-h-9 ${
                      active ? 'bg-brand text-on-brand shadow-sm shadow-brand/25' : 'text-ink-muted hover:text-ink'
                    }`}
                  >
                    <Icon />
                    {t(labelEn, labelId)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4 border-t border-line pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              {t('Language', 'Bahasa')}
            </p>
            <LanguageSwitcher />
          </div>
        </div>
      )}
    </div>
  );
}

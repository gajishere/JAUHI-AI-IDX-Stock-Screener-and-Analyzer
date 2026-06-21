import { useEffect, useRef, useState } from 'react';
import { useT } from '../lib/i18n';
import { useTheme } from '../lib/theme';
import { useSound } from '../lib/sound';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useSpringPresence } from '../lib/useSpringPresence';
import { presets } from '../lib/motion';

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" className="gear-icon h-[1.05rem] w-[1.05rem]" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
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

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" />
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
  const { soundEnabled, setSoundEnabled, playDing } = useSound();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

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

  // Interruptible popover presence: the panel scales+fades from its top-right
  // origin (the gear). Reopening mid-close cancels the close cleanly.
  const { mounted, nodeRef } = useSpringPresence(open, presets.popoverEnter, presets.popoverExit);

  // The sliding segmented-indicator offset, computed once so the JSX stays parser-clean.
  const indicatorOffset = theme === 'dark' ? '100%' : '0';
  const soundOffset = soundEnabled ? '100%' : '0';

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t('Settings', 'Pengaturan')}
        title={t('Settings', 'Pengaturan')}
        data-open={open}
        className={`settings-trigger tactile-soft inline-flex h-9 w-9 items-center justify-center rounded-full border border-line bg-paper text-ink-muted shadow-sm shadow-ink/5 hover:text-ink sm:h-10 sm:w-10 ${
          open ? 'text-ink' : ''
        }`}
      >
        <GearIcon />
      </button>

      {mounted && (
        <div
          ref={nodeRef}
          role="dialog"
          aria-label={t('Settings', 'Pengaturan')}
          className="glass-surface absolute right-0 top-[calc(100%+0.5rem)] z-dropdown w-64 max-w-[calc(100vw-1.5rem)] rounded-xl p-4"
          style={{ transformOrigin: 'top right' }}
        >
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              {t('Appearance', 'Tampilan')}
            </p>
            {/* iOS segmented control: one shared track, the active segment carried by a
                sliding pill that springs between slots via --spring-settle. The pill is
                absolutely positioned and translated by index, so it GLIDES instead of
                cross-fading — the signature native segmented-control motion. */}
            <div
              role="group"
              aria-label={t('Theme', 'Tema')}
              className="relative inline-flex w-full items-center rounded-full border border-line bg-well/60 p-1"
            >
              <span
                aria-hidden="true"
                className="absolute top-1 bottom-1 left-1 rounded-full bg-brand shadow-sm shadow-brand/25"
                style={{
                  width: 'calc(50% - 4px)',
                  transform: 'translateX(' + indicatorOffset + ')',
                  transition: 'transform var(--spring-settle-dur) var(--spring-settle)',
                }}
              />
              {THEMES.map(({ value, labelEn, labelId, Icon }) => {
                const active = theme === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTheme(value)}
                    aria-pressed={active}
                    className={`tactile-soft relative z-[1] inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-medium sm:min-h-9 ${
                      active ? 'text-on-brand' : 'text-ink-muted hover:text-ink'
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
              {t('Sound', 'Suara')}
            </p>
            {/* Same iOS segmented-control vocabulary as the theme toggle. Turning
                sound on plays a sample ding immediately — it's both the feedback
                ("this is the chime you'll hear") and the user gesture that
                unlocks the AudioContext for all later triggers. */}
            <div
              role="group"
              aria-label={t('Completion chime', 'Lonceng selesai')}
              className="relative inline-flex w-full items-center rounded-full border border-line bg-well/60 p-1"
            >
              <span
                aria-hidden="true"
                className="absolute top-1 bottom-1 left-1 rounded-full bg-brand shadow-sm shadow-brand/25"
                style={{
                  width: 'calc(50% - 4px)',
                  transform: 'translateX(' + soundOffset + ')',
                  transition: 'transform var(--spring-settle-dur) var(--spring-settle)',
                }}
              />
              {[
                { value: false, labelEn: 'Off', labelId: 'Mati', Icon: null },
                { value: true, labelEn: 'On', labelId: 'Aktif', Icon: BellIcon },
              ].map(({ value, labelEn, labelId, Icon }) => {
                const active = soundEnabled === value;
                return (
                  <button
                    key={String(value)}
                    type="button"
                    onClick={() => {
                      setSoundEnabled(value);
                      // Play the chime when enabling so the gesture unlocks audio
                      // and the trader hears exactly what each completion will sound like.
                      if (value) playDing();
                    }}
                    aria-pressed={active}
                    className={`tactile-soft relative z-[1] inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-medium sm:min-h-9 ${
                      active ? 'text-on-brand' : 'text-ink-muted hover:text-ink'
                    }`}
                  >
                    {Icon && <Icon />}
                    {t(labelEn, labelId)}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-ink-muted">
              {t('Chimes when a scan, analysis, or re-rank finishes.', 'Berbunyi saat pemindaian, analisis, atau pemeringkatan ulang selesai.')}
            </p>
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

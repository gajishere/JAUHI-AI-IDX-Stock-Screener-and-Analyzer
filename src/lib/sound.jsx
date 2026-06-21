/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

// Completion chime for the desk. A short "ding" fires when a long-running
// result lands: a fresh Live-Screening scan, a finished Stock Analysis, the
// Stock Screening candidates, and the re-rank. Sound is opt-in (default off)
// — an unexpected chime during a screen-share or in a quiet office is
// intrusive, so the trader turns it on deliberately from the gear menu.
//
// Produced via the Web Audio API (no asset file): a real bell is two decaying
// sine partials — a fundamental plus an inharmonic overtone — through a short
// exponential decay envelope. Generated on demand, fire-and-forget. The single
// shared AudioContext is created lazily and resumed on first play, because
// browsers suspend audio until a user gesture; every call site originates from
// a click (Run / Refresh / pick date / Re-rank), so the gesture requirement is
// always satisfied by the time playDing() runs.
const STORAGE_KEY = 'idx-sound';

function resolveInitial() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    // Only 'on' enables; anything else (including null) stays off. Default off.
    return saved === 'on';
  } catch {
    return false;
  }
}

const SoundContext = createContext({ soundEnabled: false, setSoundEnabled: () => {}, playDing: () => {} });

export function SoundProvider({ children }) {
  const [soundEnabled, setSoundEnabledState] = useState(resolveInitial);
  // Lazily-created AudioContext. Held outside React state so it isn't recreated
  // on re-render; the ref starts null and is populated on first playDing().
  const ctxRef = useRef(null);
  // The enabled flag is also mirrored in a ref so playDing() reads the freshest
  // value without depending on it (its identity is stable forever).
  const enabledRef = useRef(soundEnabled);
  useEffect(() => {
    enabledRef.current = soundEnabled;
  }, [soundEnabled]);

  const setSoundEnabled = useCallback((next) => {
    setSoundEnabledState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off');
    } catch {
      /* storage unavailable — setting still applies for this session */
    }
  }, []);

  const playDing = useCallback(() => {
    if (!enabledRef.current) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!ctxRef.current) ctxRef.current = new AudioCtx();
      const ctx = ctxRef.current;
      // Browsers start the context suspended until a gesture; resume is a no-op
      // if already running. Every call site follows a user click, so this
      // resolves immediately and the chime plays.
      if (ctx.state === 'suspended') ctx.resume();

      const now = ctx.currentTime;
      const master = ctx.createGain();
      // Overall loudness: a quiet desk chime, not an alarm. ~0.18 peak.
      master.gain.setValueAtTime(0.0001, now);
      master.gain.exponentialRampToValueAtTime(0.18, now + 0.004);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
      master.connect(ctx.destination);

      // Two partials make it read as a struck bell, not a pure sine beep:
      //   880 Hz fundamental (A5) + a 2.76× inharmonic overtone (the metallic
      //   shimmer). Each is a separate sine so the overtone decays faster than
      //   the fundamental, the way a real bell's high partials ring off first.
      const partials = [
        { freq: 880, gain: 1.0, decay: 0.9 },
        { freq: 880 * 2.76, gain: 0.32, decay: 0.5 },
      ];
      partials.forEach(({ freq, gain, decay }) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        g.gain.setValueAtTime(gain, now);
        g.gain.exponentialRampToValueAtTime(0.0001, now + decay);
        osc.connect(g);
        g.connect(master);
        osc.start(now);
        osc.stop(now + decay + 0.02);
      });
    } catch {
      // Audio is best-effort: never let a chime failure break the result flow.
    }
  }, []);

  return (
    <SoundContext.Provider value={{ soundEnabled, setSoundEnabled, playDing }}>
      {children}
    </SoundContext.Provider>
  );
}

export function useSound() {
  return useContext(SoundContext);
}

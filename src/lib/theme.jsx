/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useCallback, useEffect } from 'react';

// Light/dark theming for the desk. The actual colors live as CSS variables in
// index.css (:root vs .dark); this provider only flips the `dark` class on the
// <html> element and remembers the choice. Default follows the OS preference,
// then persists the user's explicit pick in localStorage.
const STORAGE_KEY = 'idx-theme';
const SUPPORTED = new Set(['light', 'dark']);

function resolveInitial() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (SUPPORTED.has(saved)) return saved;
  } catch {
    /* storage unavailable */
  }
  const prefersDark =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  return prefersDark ? 'dark' : 'light';
}

function applyTheme(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.style.colorScheme = theme;
}

const ThemeContext = createContext({ theme: 'light', setTheme: () => {}, toggleTheme: () => {} });

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    const initial = resolveInitial();
    // Apply synchronously on first render so there is no flash of the wrong theme.
    if (typeof document !== 'undefined') applyTheme(initial);
    return initial;
  });

  const setTheme = useCallback((next) => {
    if (!SUPPORTED.has(next)) return;
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage unavailable — theme still applies for this session */
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

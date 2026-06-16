/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useCallback, useEffect } from 'react';

// Lightweight i18n for the desk. Translations are co-located at each call site
// via t('English copy', 'Bahasa Indonesia copy') rather than a central key
// dictionary — the English string stays readable in the JSX and there are no
// keys to keep in sync. The chosen language persists in localStorage.
const STORAGE_KEY = 'idx-lang';
const SUPPORTED = new Set(['en', 'id']);

const LanguageContext = createContext({ lang: 'en', setLang: () => {} });

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return SUPPORTED.has(saved) ? saved : 'en';
    } catch {
      return 'en';
    }
  });

  const setLang = useCallback((next) => {
    if (!SUPPORTED.has(next)) return;
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage unavailable — language still applies for this session */
    }
  }, []);

  // Keep the document language attribute in sync for accessibility tooling.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return <LanguageContext.Provider value={{ lang, setLang }}>{children}</LanguageContext.Provider>;
}

export function useLang() {
  return useContext(LanguageContext);
}

// Returns a translator: t(en, id) → the string for the active language. When no
// Indonesian variant is supplied the English copy is used as the fallback, so
// untranslated strings degrade gracefully instead of rendering blank.
export function useT() {
  const { lang } = useContext(LanguageContext);
  return useCallback((en, id) => (lang === 'id' && id != null ? id : en), [lang]);
}

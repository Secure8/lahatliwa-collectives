import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { applyDocumentTheme, normalizeThemePreference, persistThemePreference, readThemePreference, resolveThemePreference } from './theme.js';
import { createThemeTransitionController } from './themeTransition.js';

const ThemeContext = createContext(null);

function initialThemeState() {
  const preference = readThemePreference();
  const rootTheme = globalThis.document?.documentElement?.dataset?.theme;
  const resolvedTheme = rootTheme === 'light' || rootTheme === 'dark' ? rootTheme : resolveThemePreference(preference);
  return { preference, resolvedTheme };
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(initialThemeState);
  const preferenceRef = useRef(theme.preference);
  const transitionControllerRef = useRef(null);

  const applyPreference = useCallback((nextPreference) => {
    const preference = normalizeThemePreference(nextPreference);
    const resolvedTheme = resolveThemePreference(preference);
    preferenceRef.current = preference;
    applyDocumentTheme(resolvedTheme);
    persistThemePreference(preference);
    setTheme({ preference, resolvedTheme });
  }, []);

  const setPreference = useCallback((nextPreference) => {
    transitionControllerRef.current?.begin();
    applyPreference(nextPreference);
  }, [applyPreference]);

  useEffect(() => {
    const controller = createThemeTransitionController();
    transitionControllerRef.current = controller;
    return () => {
      controller.dispose();
      if (transitionControllerRef.current === controller) transitionControllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    applyDocumentTheme(theme.resolvedTheme);
    const media = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
    const onSystemChange = () => {
      if (preferenceRef.current !== 'system') return;
      const resolvedTheme = resolveThemePreference('system');
      applyDocumentTheme(resolvedTheme);
      setTheme({ preference: 'system', resolvedTheme });
    };
    media?.addEventListener?.('change', onSystemChange);
    return () => media?.removeEventListener?.('change', onSystemChange);
  }, []);

  return <ThemeContext.Provider value={{ ...theme, setPreference }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside ThemeProvider.');
  return value;
}

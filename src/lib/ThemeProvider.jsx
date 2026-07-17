import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { applyDocumentTheme, normalizeThemePreference, persistThemePreference, readThemePreference, resolveThemePreference, themeMotionAllowed } from './theme.js';

const ThemeContext = createContext(null);
const THEME_FADE_OPTIONS = { duration: 240, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' };

function trackAnimation(ref, animation) {
  if (!animation) return;
  ref.current = animation;
  animation.finished.finally(() => {
    if (ref.current === animation) ref.current = null;
  }).catch(() => {
  });
}

function initialThemeState() {
  const preference = readThemePreference();
  const rootTheme = globalThis.document?.documentElement?.dataset?.theme;
  const resolvedTheme = rootTheme === 'light' || rootTheme === 'dark' ? rootTheme : resolveThemePreference(preference);
  return { preference, resolvedTheme };
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(initialThemeState);
  const preferenceRef = useRef(theme.preference);
  const contentAnimationRef = useRef(null);

  const applyPreference = useCallback((nextPreference) => {
    const preference = persistThemePreference(normalizeThemePreference(nextPreference));
    const resolvedTheme = resolveThemePreference(preference);
    preferenceRef.current = preference;
    applyDocumentTheme(resolvedTheme);
    setTheme({ preference, resolvedTheme });
  }, []);

  const setPreference = useCallback((nextPreference) => {
    const preference = normalizeThemePreference(nextPreference);
    contentAnimationRef.current?.cancel?.();
    contentAnimationRef.current = null;
    applyPreference(preference);
    if (!themeMotionAllowed()) return;
    const content = document.getElementById('root');
    trackAnimation(contentAnimationRef, content?.animate?.(
      [{ opacity: 0.82 }, { opacity: 1 }],
      THEME_FADE_OPTIONS,
    ));
  }, [applyPreference]);

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

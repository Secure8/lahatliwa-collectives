import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { applyDocumentTheme, canAnimateTheme, normalizeThemePreference, persistThemePreference, readThemePreference, resolveThemePreference, themeAnimationOrigin, themeRevealRadius } from './theme.js';

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
  const requestRef = useRef(0);

  const applyPreference = useCallback((nextPreference) => {
    const preference = persistThemePreference(normalizeThemePreference(nextPreference));
    const resolvedTheme = resolveThemePreference(preference);
    preferenceRef.current = preference;
    applyDocumentTheme(resolvedTheme);
    setTheme({ preference, resolvedTheme });
  }, []);

  const setPreference = useCallback((nextPreference, trigger = {}) => {
    const preference = normalizeThemePreference(nextPreference);
    const request = ++requestRef.current;
    const element = trigger.element || trigger.event?.currentTarget || null;
    const origin = themeAnimationOrigin(trigger.event, element);
    const commit = () => {
      if (request === requestRef.current) applyPreference(preference);
    };

    if (!canAnimateTheme()) {
      document.documentElement?.classList.remove('theme-transition');
      commit();
      return;
    }

    const root = document.documentElement;
    root.classList.add('theme-transition');
    let transition;
    try {
      transition = document.startViewTransition(commit);
    } catch {
      root.classList.remove('theme-transition');
      commit();
      return;
    }

    transition.ready.then(() => {
      if (request !== requestRef.current) return;
      const radius = themeRevealRadius(origin);
      root.animate(
        { clipPath: [`circle(0px at ${origin.x}px ${origin.y}px)`, `circle(${radius}px at ${origin.x}px ${origin.y}px)`] },
        { duration: 600, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', pseudoElement: '::view-transition-new(root)' },
      );
    }).catch(() => {
    });
    transition.finished.finally(() => {
      if (request === requestRef.current) root.classList.remove('theme-transition');
    }).catch(() => {
    });
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
